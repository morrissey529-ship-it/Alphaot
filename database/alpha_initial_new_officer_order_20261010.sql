-- Alpha OT — New Officer Initial position rule
-- Date: October 10, 2026
-- Applies to production Alpha OT and the separate Alpha OT Beta database.
-- New Admin-added officers must have Initial and a list-entry date.
-- Consecutively entered Initial officers drop as one bottom cohort,
-- alphabetically by their LAST name (A above Z), ignoring operator
-- entry sequence or list-entry dates for alphabetical ordering.
-- Older officers, volunteer/required OT block processing, Training
-- position snapshots, Bereavement, and manual changes are preserved.
-- This script contains deployed function definitions and is intended for
-- versioned redeployment during any company IT handoff.

CREATE OR REPLACE FUNCTION public.alpha_add_officer_auth(p_name text, p_status text DEFAULT 'Active'::text, p_baseline_event_type text DEFAULT NULL::text, p_baseline_event_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 new_id uuid;
 next_order integer;
 clean_name text := nullif(btrim(p_name),'');
begin
 if public.current_user_role()<>'admin' then raise exception 'Not authorized'; end if;
 if clean_name is null then raise exception 'Officer name required'; end if;
 if p_status not in ('Active','Off Shift') then
   raise exception 'New officers must start Active or Off Shift';
 end if;
 if p_baseline_event_type is distinct from 'Initial' then
   raise exception 'New officers must have Initial as their starting event';
 end if;
 if p_baseline_event_date is null then
   raise exception 'Date added to the list is required';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(74021,223);
 select coalesce(max(base_order),0)+1 into next_order from public.officers;
 insert into public.officers(
   name,crew,base_order,status,baseline_event_type,baseline_event_date,initial_new_hire
 ) values(
   clean_name,'Alpha',next_order,p_status,'Initial',p_baseline_event_date,true
 ) returning id into new_id;
 return new_id;
end $function$;

CREATE OR REPLACE FUNCTION alpha_private.place_initial_group(p_order uuid[], p_initial_ids uuid[])
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_ids uuid[]; v_one uuid;
begin
  select coalesce(array_agg(x.id order by
    lower(trim(case
      when position(',' in o.name)>0 then split_part(o.name,',',1)
      else regexp_replace(trim(o.name), '^.*[[:space:]]+', '')
    end)),
    lower(trim(o.name)),
    x.id::text),array[]::uuid[])
  into v_ids
  from unnest(coalesce(p_initial_ids,array[]::uuid[])) as x(id)
  join public.officers o on o.id=x.id;
  foreach v_one in array v_ids loop
    p_order:=array_remove(p_order,v_one);
  end loop;
  return p_order || v_ids;
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
  v_new_initial uuid[]:=array[]::uuid[];
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
    -- Consecutive newly-added Initial entries form an alphabetic cohort.
    -- Buffer before moving them so entry order does not decide who is above.
    if v_row.action_type='Initial' then
      v_new_initial:=array_append(v_new_initial,v_row.officer_id);
      continue;
    end if;
    if coalesce(array_length(v_new_initial,1),0)>0 then
      p_order:=alpha_private.place_initial_group(p_order,v_new_initial);
      v_new_initial:=array[]::uuid[];
    end if;
    if v_row.action_type='Training' and v_row.action_at >= timestamptz '2026-10-10 11:26:00+00' then
      p_order:=alpha_private.apply_training_group(p_order,v_row.event_date,v_row.action_at);
    else
      p_order:=array_append(array_remove(p_order,v_row.officer_id),v_row.officer_id);
    end if;
  end loop;
  if coalesce(array_length(v_new_initial,1),0)>0 then
    p_order:=alpha_private.place_initial_group(p_order,v_new_initial);
  end if;

  return p_order;
end
$function$;