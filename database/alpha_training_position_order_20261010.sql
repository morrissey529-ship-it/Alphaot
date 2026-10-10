-- Alpha OT: original-position snapshot for Training groups.
-- Source: deployed live database, October 10, 2026.
-- Applies to Alpha OT and Alpha OT Beta. Depends on the existing
-- alpha_private.rotation_order, alpha_private.replay_segment,
-- alpha_private.action_clock, public.ot_events, and public.officers.
-- All Training for one date drops together in the position order held
-- before the first Training for that date was recorded.
-- Volunteer and Required OT block processing is unchanged.
--
-- Existing date groups are backfilled with their historical pre-first-event
-- order. Later groups are automatically snapshotted BEFORE their first INSERT.
-- Snapshots are private; no public table reads should be granted.

create table if not exists alpha_private.training_group_positions (
  training_date date primary key,
  original_order uuid[] not null,
  first_assigned_at timestamptz not null,
  recorded_at timestamptz not null default now()
);
alter table alpha_private.training_group_positions enable row level security;

CREATE OR REPLACE FUNCTION alpha_private.rotation_order_before(p_at timestamp with time zone)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_order uuid[];
 v_after timestamptz;
 v_move record;
 v_at integer;
begin
 select array_agg(id order by base_order,id) into v_order from public.officers;
 for v_move in
   select * from alpha_private.manual_reorders
   where happened_at < p_at order by happened_at,id
 loop
   v_order:=alpha_private.replay_segment(v_order,v_after,v_move.happened_at);
   if v_move.officer_id=any(v_order) and v_move.anchor_id=any(v_order) then
     v_order:=array_remove(v_order,v_move.officer_id);
     v_at:=array_position(v_order,v_move.anchor_id);
     if v_move.placement='after' then v_at:=v_at+1; end if;
     v_order:=v_order[1:v_at-1] || array[v_move.officer_id] || v_order[v_at:array_length(v_order,1)];
   end if;
   v_after:=v_move.happened_at;
 end loop;
 return alpha_private.replay_segment(v_order,v_after,p_at-interval '1 microsecond');
end $function$;

-- Backfill before activating the snapshot-based helper; avoids rewriting
-- past OT events or manual corrections.
insert into alpha_private.training_group_positions
  (training_date,original_order,first_assigned_at)
select first_events.event_date,
       alpha_private.rotation_order_before(first_events.first_assigned_at),
       first_events.first_assigned_at
from (
 select e.event_date, min(coalesce(c.happened_at,e.created_at)) as first_assigned_at
 from public.ot_events e
 left join alpha_private.action_clock c
   on c.source_table='ot_events' and c.source_id=e.id
 where e.action_type='Training' and not e.reversed
 group by e.event_date
 having max(coalesce(c.happened_at,e.created_at)) >= timestamptz '2026-10-10 11:26:00+00'
) first_events
on conflict (training_date) do nothing;

CREATE OR REPLACE FUNCTION alpha_private.capture_training_position()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.action_type='Training' and not new.reversed then
   insert into alpha_private.training_group_positions
      (training_date,original_order,first_assigned_at)
   values (new.event_date,alpha_private.rotation_order(),clock_timestamp())
   on conflict (training_date) do nothing;
 end if;
 return new;
end $function$;

-- Repeatable trigger installation:
drop trigger if exists alpha_training_position_snapshot on public.ot_events;
create trigger alpha_training_position_snapshot
before insert on public.ot_events
for each row execute function alpha_private.capture_training_position();

CREATE OR REPLACE FUNCTION alpha_private.apply_training_group(p_order uuid[], p_date date, p_as_of timestamp with time zone)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
 v_original uuid[];
 v_training uuid[];
 v_id uuid;
begin
 select original_order into v_original
 from alpha_private.training_group_positions
 where training_date=p_date;

 select array_agg(pos.officer_id order by
   coalesce(array_position(v_original,pos.officer_id),1000000+pos.n),
   pos.n)
 into v_training
 from unnest(p_order) with ordinality as pos(officer_id,n)
 where exists (
   select 1 from public.ot_events e
   left join alpha_private.action_clock c
     on c.source_table='ot_events' and c.source_id=e.id
   where e.officer_id=pos.officer_id and e.action_type='Training'
     and e.event_date=p_date and not e.reversed
     and coalesce(c.happened_at,e.created_at)<=p_as_of
 );

 foreach v_id in array coalesce(v_training,array[]::uuid[]) loop
   p_order:=array_remove(p_order,v_id);
 end loop;
 return p_order || coalesce(v_training,array[]::uuid[]);
end $function$;

-- Existing replay_segment already calls apply_training_group for Training
-- from October 10 11:26 UTC onward, and preserves older history.
CREATE OR REPLACE FUNCTION alpha_private.replay_segment(p_order uuid[], p_after timestamp with time zone, p_until timestamp with time zone)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_events alpha_private.rotation_entry[];
  v_key alpha_private.rotation_entry;
  v_row record;
  n integer;
  i integer;
  j integer;
  v_cutover constant timestamptz := '2026-10-01 10:50:00+00';
begin
  /*
    Historical entries before the Oct. 1 cutover keep the established
    comparison rules exactly as before.
  */
  select array_agg(x order by (x).created_at,(x).officer_id)
    into v_events
  from (
    select (
      e.officer_id,
      e.action_type,
      e.event_date,
      coalesce(c.happened_at,e.created_at),
      e.rotation_sort_at,
      o.name
    )::alpha_private.rotation_entry x
    from public.ot_events e
    join public.officers o on o.id=e.officer_id
    left join alpha_private.action_clock c
      on c.source_table='ot_events' and c.source_id=e.id
    where not e.reversed
      and e.action_type in ('Training','Volunteer OT','Required OT','Vacation Return')
      and coalesce(c.happened_at,e.created_at) < v_cutover
      and (p_after is null or coalesce(c.happened_at,e.created_at)>p_after)
      and (p_until is null or coalesce(c.happened_at,e.created_at)<=p_until)

    union all

    select (
      o.id,
      'Initial',
      o.baseline_event_date,
      coalesce(c.happened_at,o.created_at),
      null::timestamptz,
      o.name
    )::alpha_private.rotation_entry
    from public.officers o
    left join alpha_private.action_clock c
      on c.source_table='officers' and c.source_id=o.id
    where o.initial_new_hire
      and o.baseline_event_date is not null
      and coalesce(c.happened_at,o.created_at) < v_cutover
      and (p_after is null or coalesce(c.happened_at,o.created_at)>p_after)
      and (p_until is null or coalesce(c.happened_at,o.created_at)<=p_until)
  ) s;

  n:=coalesce(array_length(v_events,1),0);
  if n>1 then
    for i in 2..n loop
      v_key:=v_events[i];
      j:=i-1;
      while j>=1 loop
        exit when alpha_private.compare_rotation(v_key,v_events[j])>=0;
        v_events[j+1]:=v_events[j];
        j:=j-1;
      end loop;
      v_events[j+1]:=v_key;
    end loop;
  end if;

  for i in 1..n loop
    p_order:=array_append(array_remove(p_order,(v_events[i]).officer_id),(v_events[i]).officer_id);
  end loop;

  /*
    New behavior from the cutover forward:

    - Training / Vacation Return continue to move according to when the
      assignment/action was entered.
    - OT belonging to the same Alpha off-day block is replayed as one batch.
      The batch becomes effective when the last OT assignment currently in
      that block was entered.
    - Inside an OT block:
        1) all Volunteer OT, earliest workday first;
        2) all Required OT, earliest workday first.
      Same-day ties keep entry order.

    This makes a two-day block replay as Day 1 volunteers, Day 2 volunteers,
    Day 1 requireds, Day 2 requireds. A three-day block extends naturally
    through Day 3.
  */
  for v_row in
    with post_events as (
      select
        e.officer_id,
        e.action_type,
        e.event_date,
        coalesce(c.happened_at,e.created_at) as action_at,
        e.rotation_sort_at,
        o.name as officer_name,
        case
          when e.action_type in ('Volunteer OT','Required OT')
            then alpha_private.block_id(e.event_date)
          else null
        end as ot_block
      from public.ot_events e
      join public.officers o on o.id=e.officer_id
      left join alpha_private.action_clock c
        on c.source_table='ot_events' and c.source_id=e.id
      where not e.reversed
        and e.action_type in ('Training','Volunteer OT','Required OT','Vacation Return')
        and coalesce(c.happened_at,e.created_at) >= v_cutover
        and (p_after is null or coalesce(c.happened_at,e.created_at)>p_after)
        and (p_until is null or coalesce(c.happened_at,e.created_at)<=p_until)

      union all

      select
        o.id,
        'Initial'::text,
        o.baseline_event_date,
        coalesce(c.happened_at,o.created_at),
        null::timestamptz,
        o.name,
        null::integer
      from public.officers o
      left join alpha_private.action_clock c
        on c.source_table='officers' and c.source_id=o.id
      where o.initial_new_hire
        and o.baseline_event_date is not null
        and coalesce(c.happened_at,o.created_at) >= v_cutover
        and (p_after is null or coalesce(c.happened_at,o.created_at)>p_after)
        and (p_until is null or coalesce(c.happened_at,o.created_at)<=p_until)
    ),
    keyed as (
      select
        p.*,
        case
          when p.ot_block is not null
            then max(p.action_at) over (partition by p.ot_block)
          else p.action_at
        end as batch_at
      from post_events p
    )
    select *
    from keyed
    order by
      batch_at,
      case when ot_block is null then 0 else 1 end,
      coalesce(ot_block,-2147483648),
      case action_type
        when 'Volunteer OT' then 1
        when 'Required OT' then 2
        else 0
      end,
      case
        when action_type in ('Volunteer OT','Required OT') then event_date
        else date '0001-01-01'
      end,
      action_at,
      officer_name,
      officer_id
  loop
    if v_row.action_type='Training'
      and v_row.action_at >= timestamptz '2026-10-10 11:26:00+00' then
      p_order:=alpha_private.apply_training_group(p_order,v_row.event_date,v_row.action_at);
    else
      p_order:=array_append(array_remove(p_order,v_row.officer_id),v_row.officer_id);
    end if;
  end loop;

  return p_order;
end
$function$;
