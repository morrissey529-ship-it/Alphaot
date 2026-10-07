-- Alpha OT rule: overtime blocks are replayed as volunteers first, then requireds.
-- Within each group, earlier workday drops first; on a 3-day off block, day 3 drops third.
-- Training and Vacation Return keep their assignment/action-time behavior.
-- Live database migration applied 2026-10-07.

create or replace function alpha_private.replay_segment(
  p_order uuid[],
  p_after timestamptz,
  p_until timestamptz
)
returns uuid[]
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_events alpha_private.rotation_entry[];
  v_key alpha_private.rotation_entry;
  v_row record;
  n integer;
  i integer;
  j integer;
  v_cutover constant timestamptz := '2026-10-01 10:50:00+00';
begin
  select array_agg(x order by (x).created_at,(x).officer_id)
    into v_events
  from (
    select (
      e.officer_id,e.action_type,e.event_date,
      coalesce(c.happened_at,e.created_at),e.rotation_sort_at,o.name
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
      o.id,'Initial',o.baseline_event_date,
      coalesce(c.happened_at,o.created_at),null::timestamptz,o.name
    )::alpha_private.rotation_entry
    from public.officers o
    left join alpha_private.action_clock c
      on c.source_table='officers' and c.source_id=o.id
    where o.initial_new_hire and o.baseline_event_date is not null
      and coalesce(c.happened_at,o.created_at) < v_cutover
      and (p_after is null or coalesce(c.happened_at,o.created_at)>p_after)
      and (p_until is null or coalesce(c.happened_at,o.created_at)<=p_until)
  ) s;

  n:=coalesce(array_length(v_events,1),0);
  if n>1 then
    for i in 2..n loop
      v_key:=v_events[i]; j:=i-1;
      while j>=1 loop
        exit when alpha_private.compare_rotation(v_key,v_events[j])>=0;
        v_events[j+1]:=v_events[j]; j:=j-1;
      end loop;
      v_events[j+1]:=v_key;
    end loop;
  end if;
  for i in 1..n loop
    p_order:=array_append(array_remove(p_order,(v_events[i]).officer_id),(v_events[i]).officer_id);
  end loop;

  for v_row in
    with post_events as (
      select e.officer_id,e.action_type,e.event_date,
             coalesce(c.happened_at,e.created_at) action_at,
             e.rotation_sort_at,o.name officer_name,
             case when e.action_type in ('Volunteer OT','Required OT')
                  then alpha_private.block_id(e.event_date) end ot_block
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
      select o.id,'Initial'::text,o.baseline_event_date,
             coalesce(c.happened_at,o.created_at),null::timestamptz,o.name,null::integer
      from public.officers o
      left join alpha_private.action_clock c
        on c.source_table='officers' and c.source_id=o.id
      where o.initial_new_hire and o.baseline_event_date is not null
        and coalesce(c.happened_at,o.created_at) >= v_cutover
        and (p_after is null or coalesce(c.happened_at,o.created_at)>p_after)
        and (p_until is null or coalesce(c.happened_at,o.created_at)<=p_until)
    ),
    keyed as (
      select p.*,
             case when p.ot_block is not null
                  then max(p.action_at) over(partition by p.ot_block)
                  else p.action_at end batch_at
      from post_events p
    )
    select *
    from keyed
    order by batch_at,
             case when ot_block is null then 0 else 1 end,
             coalesce(ot_block,-2147483648),
             case action_type when 'Volunteer OT' then 1 when 'Required OT' then 2 else 0 end,
             case when action_type in ('Volunteer OT','Required OT') then event_date else date '0001-01-01' end,
             action_at,officer_name,officer_id
  loop
    p_order:=array_append(array_remove(p_order,v_row.officer_id),v_row.officer_id);
  end loop;
  return p_order;
end
$function$;
