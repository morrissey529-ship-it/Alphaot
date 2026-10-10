-- Alpha OT — Bulk Assign officers (October 10, 2026)
-- The same function is installed on live Alpha OT and separate Alpha OT Beta.
-- Adds multiple Training, Volunteer OT, or Required OT entries with one date.
-- Roles: editor or admin, checked in function; viewer/anon cannot execute.
-- Saves in ONE database transaction: error rejects every selected assignment.
-- Selected UUIDs are sorted by the pre-batch rotation order rather than
-- the order of UI selections. Officer eligibility, Bereavement restrictions
-- and existing rotation engine apply to all rows. Already-assigned same-day
-- duplicates are rejected. Caller supplies the visible list revision so
-- stale selections are rejected rather than silently reordered.
-- Existing Volunteer/Required block and Training snapshots remain unchanged.

CREATE OR REPLACE FUNCTION public.alpha_bulk_assign(p_officer_ids uuid[], p_action text, p_event_date date, p_expected_revision bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order uuid[];
  v_selected uuid[];
  v_id uuid;
  v_count integer;
  v_revision bigint;
begin
  if public.current_user_role() not in ('admin','editor') then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if p_action not in ('Training','Volunteer OT','Required OT') then
    raise exception 'Select Training, Volunteer OT or Required OT';
  end if;
  if p_event_date is null then raise exception 'Assignment date is required'; end if;
  v_count:=coalesce(array_length(p_officer_ids,1),0);
  if v_count<1 or v_count>100 or
     exists(select 1 from unnest(p_officer_ids) as x(id) where id is null) or
     v_count<>(select count(distinct id) from unnest(p_officer_ids) as x(id)) then
    raise exception 'Choose 1 to 100 different officers';
  end if;

  -- Check the displayed list revision before saving. Locking its state row
  -- serializes this bulk batch against existing OT writes.
  select revision into v_revision
    from alpha_private.list_state where singleton for update;
  if p_expected_revision is not null and p_expected_revision<>v_revision then
    raise exception 'The OT list changed. Refresh and select officers again.';
  end if;
  v_order:=alpha_private.rotation_order();
  select array_agg(x.id order by array_position(v_order,x.id))
    into v_selected
  from unnest(p_officer_ids) as x(id)
  join public.officers o on o.id=x.id
  where o.status='Active';
  if coalesce(array_length(v_selected,1),0)<>v_count then
    raise exception 'Some selected officers are not Active. Refresh the list.';
  end if;
  if exists (
    select 1 from public.ot_events e
    where e.officer_id=any(v_selected) and not e.reversed
      and e.action_type=p_action and e.event_date=p_event_date
  ) then
    raise exception 'An officer already has this assignment on this date';
  end if;

  -- Apply in pre-batch rotation order, never in checkbox selection order.
  -- Training dates use the existing original-position snapshot, while OT
  -- retains Volunteer-before-Required and date ordering in rotation replay.
  foreach v_id in array v_selected loop
    perform public.alpha_apply_action_with_bereavement(
      v_id,p_action,p_event_date,null::date
    );
  end loop;
  return jsonb_build_object('ok',true,'count',v_count,
    'action',p_action,'date',p_event_date);
end $function$;

revoke all on function public.alpha_bulk_assign(uuid[],text,date,bigint) from public,anon,authenticated;
grant execute on function public.alpha_bulk_assign(uuid[],text,date,bigint) to authenticated;
