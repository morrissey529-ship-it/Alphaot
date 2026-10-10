-- Alpha OT training group ordering. Applied to production and beta October 10, 2026.
-- Same Training date participants move in pre-move relative order.
-- The existing volunteer/required OT block sequence is retained.
-- Manual reorders continue to be replayed; prior historical events retained.
-- IMPORTANT: This file is source documentation of database functions,
-- and should be versioned with the application during company handoff.

CREATE OR REPLACE FUNCTION alpha_private.apply_training_group(p_order uuid[], p_date date, p_as_of timestamp with time zone)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_ids uuid[]; v_id uuid;
begin
  select array_agg(pos.officer_id order by pos.n)
  into v_ids
  from unnest(p_order) with ordinality as pos(officer_id,n)
  where exists (
    select 1 from public.ot_events e
    left join alpha_private.action_clock c on c.source_table='ot_events' and c.source_id=e.id
    where e.officer_id=pos.officer_id and e.action_type='Training'
      and e.event_date=p_date and not e.reversed
      and coalesce(c.happened_at,e.created_at)<=p_as_of
  );
  foreach v_id in array coalesce(v_ids,array[]::uuid[]) loop
    p_order:=array_remove(p_order,v_id);
  end loop;
  return p_order || coalesce(v_ids,array[]::uuid[]);
end $function$;

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
