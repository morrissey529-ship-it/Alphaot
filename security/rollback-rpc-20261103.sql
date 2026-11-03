-- Alpha OT security/UI review rollback snapshot, 2026-11-03.
-- Run inside a transaction; restores prior function bodies only (no grants changed).
BEGIN;
CREATE OR REPLACE FUNCTION public.alpha_list_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order uuid[]; v_events alpha_private.rotation_entry[]; v_key alpha_private.rotation_entry;
  v_count integer; i integer; j integer; v_today date;
  v_result jsonb; v_revision bigint;
begin
  v_today := (now() at time zone 'America/Chicago')::date;
  v_order:=alpha_private.rotation_order();
  select revision into v_revision from alpha_private.list_state where singleton;
  select coalesce(jsonb_agg(jsonb_build_object(
    'revision',v_revision,'call_number',o.call_number,'id',o.id,'name',o.name,'crew',o.crew,'status',o.status,'base_order',o.base_order,
    'vacation_return_date',o.vacation_return_date,'called_off_date',o.called_off_date,
    'called_off_event_type',case when o.called_off_date is not null then o.called_off_event_type else null end,
    'temporarily_unavailable',o.temporarily_unavailable,
    'temporarily_unavailable_date',o.temporarily_unavailable_date,
    'recent_activity',coalesce(recent.items,'[]'::jsonb),
    'upcoming',upcoming.item
  ) order by case when o.status in ('Active','Military','Bonding') then 0 when o.status='Vacation' then 1 else 2 end,ord.n),'[]'::jsonb)
  into v_result
  from unnest(v_order) with ordinality ord(id,n)
  join public.officers o on o.id=ord.id
  left join lateral (
    select jsonb_agg(jsonb_build_object('date',d.event_date,'types',d.types) order by d.event_date desc) items
    from (select a.event_date,jsonb_agg(distinct a.label) types from (
      select e.event_date,e.action_type as label from public.ot_events e
        where e.officer_id=o.id and not e.reversed and e.event_date<=v_today
          and e.action_type in ('Training','Volunteer OT','Required OT','Vacation Return')
      union all
      select o.baseline_event_date,o.baseline_event_type || ' (baseline)'
        where o.baseline_event_date<=v_today and o.baseline_event_type in ('Initial','Training','Volunteer OT','Required OT','Vacation Return')
          and not exists(select 1 from public.ot_events same where same.officer_id=o.id
                         and same.event_date=o.baseline_event_date and same.action_type=o.baseline_event_type)
    ) a group by a.event_date order by a.event_date desc limit 2) d
  ) recent on true
  left join lateral (
    select jsonb_build_object('date',e.event_date,'type',e.action_type) item
    from public.ot_events e where e.officer_id=o.id and not e.reversed and e.event_date>v_today
      and e.action_type in ('Training','Volunteer OT','Required OT','Vacation Return')
    order by e.event_date,e.created_at limit 1
  ) upcoming on true;
  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION public.alpha_list_summary_with_bereavement()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select coalesce(jsonb_agg(t.item || jsonb_build_object('bereavement_start_date',o.bereavement_start_date,'bereavement_return_date',o.bereavement_return_date) order by case when o.status in ('Active','Bereavement','Military','Bonding') then 0 when o.status='Vacation' then 1 else 2 end,array_position(alpha_private.rotation_order(),o.id)),'[]'::jsonb) from jsonb_array_elements(public.alpha_list_summary()) as t(item) join public.officers o on o.id=(t.item->>'id')::uuid $function$;

CREATE OR REPLACE FUNCTION public.ieas_list_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date:=(now() at time zone 'America/Chicago')::date;
  v_result jsonb;
begin
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',o.id,'name',o.name,'crew',o.crew,'status',o.status,
      'position',ord.n,'call_number',o.call_number,
      'baseline_activity',coalesce(r.baseline_activity,'Initial · New officer'),
      'vacation_return_date',o.vacation_return_date,
      'temporarily_unavailable',o.temporarily_unavailable,
      'temporarily_unavailable_date',o.temporarily_unavailable_date,
      'bereavement_start_date',o.bereavement_start_date,
      'bereavement_return_date',o.bereavement_return_date,
      'available',
        (o.status='Active'
          and not (coalesce(o.temporarily_unavailable,false) and o.temporarily_unavailable_date=v_today)
          and not (o.bereavement_start_date is not null and o.bereavement_return_date is not null and v_today >= o.bereavement_start_date and v_today < o.bereavement_return_date)),
      'recent_activity',
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',a.id,'date',a.work_date,'shift_type',a.shift_type,
            'assignment_kind',a.assignment_kind,'status',a.status
          ) order by a.work_date desc,a.created_at desc)
          from (
            select * from public.ieas_assignments ev
            where ev.officer_id=o.id
            order by ev.work_date desc,ev.created_at desc limit 4
          ) a
        ),'[]'::jsonb)
    )
    order by
      case when o.status in ('Military','Bonding') then 0 when
        o.status='Active'
        and not (coalesce(o.temporarily_unavailable,false) and o.temporarily_unavailable_date=v_today)
        and not (o.bereavement_start_date is not null and o.bereavement_return_date is not null and v_today >= o.bereavement_start_date and v_today < o.bereavement_return_date)
      then 0 else 1 end,ord.n
  ),'[]'::jsonb) into v_result
  from unnest(alpha_private.ieas_rotation_order()) with ordinality as ord(officer_id,n)
  join public.officers o on o.id=ord.officer_id
  left join public.ieas_roster r on r.officer_id=o.id;
  return v_result;
end;
$function$;

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

CREATE OR REPLACE FUNCTION public.alpha_add_transfer_auth(p_name text, p_status text, p_baseline_event_type text, p_baseline_event_date date, p_anchor_id uuid, p_placement text DEFAULT 'after'::text, p_call_number integer DEFAULT NULL::integer, p_expected_revision bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid:=auth.uid();
 v_name text:=nullif(btrim(p_name),'');
 v_anchor public.officers%rowtype;
 v_new_id uuid;
 v_base_order integer;
 v_revision bigint;
begin
 if v_actor is null or public.current_user_role()<>'admin' then
   raise exception 'Admin access required to add a transfer' using errcode='42501';
 end if;
 if v_name is null then raise exception 'Officer name required'; end if;
 if p_status not in ('Active','Off Shift') then
   raise exception 'Choose Active or Off Shift';
 end if;
 if p_baseline_event_type not in ('Volunteer OT','Required OT','Training','Vacation Return') then
   raise exception 'Select the previous qualifying event type';
 end if;
 if p_baseline_event_date is null or
    p_baseline_event_date>(now() at time zone 'America/Chicago')::date then
   raise exception 'Previous qualifying date must be on or before today';
 end if;
 if p_placement not in ('before','after') then
   raise exception 'Select before or after';
 end if;
 if p_call_number is not null and (p_call_number<1 or p_call_number>9999) then
   raise exception 'Call number must be between 1 and 9999';
 end if;
 if p_anchor_id is null then
   raise exception 'Select the officer to position the transfer alongside';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(74021,223);
 select revision into v_revision from alpha_private.list_state where singleton for update;
 if p_expected_revision is not null and p_expected_revision<>v_revision then
   raise exception 'The OT list changed. Refresh and choose the placement again'
      using errcode='40001';
 end if;
 select * into v_anchor from public.officers where id=p_anchor_id;
 if not found then raise exception 'Selected placement officer no longer exists'; end if;
 if v_anchor.status is distinct from p_status then
   raise exception 'Choose an officer in the same Active / Off Shift section';
 end if;
 if exists(select 1 from public.officers where lower(name)=lower(v_name)) then
   raise exception 'An officer with that name is already on the list';
 end if;
 select coalesce(max(base_order),0)+1 into v_base_order from public.officers;

 perform set_config('alpha.audit_action','Add transfer',true);
 insert into public.officers(
   name,crew,status,base_order,baseline_event_type,baseline_event_date,
   display_event_type,display_event_date,initial_new_hire,call_number
 )
 values (
   v_name,'Alpha',p_status,v_base_order,p_baseline_event_type,
   p_baseline_event_date,p_baseline_event_type,p_baseline_event_date,
   false,p_call_number
 )
 returning id into v_new_id;

 -- This is an insertion/placement only. No Alpha OT or Training event
 -- is created, so the officer does not incur an artificial rotation drop.
 insert into alpha_private.manual_reorders(
   officer_id,anchor_id,placement,crew,status,actor_id
 )
 values(v_new_id,p_anchor_id,p_placement,'Alpha',p_status,v_actor);

 insert into alpha_private.audit_log(
   officer_id,source_table,source_id,operation,action_label,actor_id,
   actor_kind,before_value,after_value
 ) values (
   v_new_id,'manual_reorders',v_new_id,'INSERT','Transfer list placement',
   v_actor,'Authenticated user',null,
   jsonb_build_object('anchor_id',p_anchor_id,'anchor_name',v_anchor.name,
     'placement',p_placement,'baseline_event_type',p_baseline_event_type,
     'baseline_event_date',p_baseline_event_date,'call_number',p_call_number)
 );
 update alpha_private.list_state set revision=revision+1
 where singleton returning revision into v_revision;

 return jsonb_build_object('ok',true,'id',v_new_id,'name',v_name,
   'event_type',p_baseline_event_type,'event_date',p_baseline_event_date,
   'call_number',p_call_number,'position',p_placement,
   'anchor',v_anchor.name,'revision',v_revision);
end
$function$;

CREATE OR REPLACE FUNCTION public.alpha_apply_action_auth(p_officer_id uuid, p_action text, p_event_date date DEFAULT CURRENT_DATE, p_vacation_return_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text;
  target_event uuid;
  target_date date;
  target_type text;
  v_event_date date;
  prev_type text;
  prev_date date;
begin
  v_role:=public.current_user_role();
  if v_role not in ('editor','admin') then raise exception 'Not authorized'; end if;
  perform set_config('alpha.audit_action',p_action,true);
  v_event_date:=coalesce(p_event_date,current_date);

  if p_action='Active' then
    update public.officers set status='Active',vacation_return_date=null,temporarily_unavailable=false,temporarily_unavailable_date=null,updated_at=now() where id=p_officer_id;
  elsif p_action='Off Shift' then
    update public.officers set status='Off Shift',vacation_return_date=null,temporarily_unavailable=false,temporarily_unavailable_date=null,updated_at=now() where id=p_officer_id;
  elsif p_action='Vacation' then
    if p_vacation_return_date is null then raise exception 'Vacation return date required'; end if;
    update public.officers set status='Vacation',vacation_return_date=p_vacation_return_date,temporarily_unavailable=false,temporarily_unavailable_date=null,updated_at=now() where id=p_officer_id;
  elsif p_action in ('Military','Jury Duty','Bonding') then
    -- Administrative leave status changes do not create OT or training events.
    update public.officers
       set status=p_action,vacation_return_date=null,
           temporarily_unavailable=false,temporarily_unavailable_date=null,
           updated_at=now()
     where id=p_officer_id;
  elsif p_action='Unavailable Today' then
    update public.officers set temporarily_unavailable=true,temporarily_unavailable_date=v_event_date,updated_at=now() where id=p_officer_id;
  elsif p_action in ('Volunteer OT','Required OT','Training') then
    if exists(select 1 from public.officers where id=p_officer_id
              and status in ('Military','Jury Duty','Bonding')) then
      raise exception 'Officer unavailable due to Military, Jury Duty or Bonding leave'
        using errcode='22023';
    end if;
    insert into public.ot_events(officer_id,action_type,event_date) values(p_officer_id,p_action,v_event_date);
    update public.officers set status='Active',vacation_return_date=null,temporarily_unavailable=false,temporarily_unavailable_date=null,
      called_off_date=case when p_action in ('Volunteer OT','Required OT') then null else called_off_date end,
      called_off_event_type=case when p_action in ('Volunteer OT','Required OT') then null else called_off_event_type end,
      display_event_type=p_action,display_event_date=v_event_date,initial_new_hire=false,updated_at=now() where id=p_officer_id;
  elsif p_action='Undo OT' then
    select id into target_event
    from public.ot_events
    where officer_id=p_officer_id and not reversed and action_type in ('Volunteer OT','Required OT')
    order by created_at desc limit 1;
    if target_event is null then raise exception 'No OT event to undo'; end if;
    update public.ot_events set reversed=true,reversed_at=now() where id=target_event;
  elsif p_action='Called Off' then
    /*
      A call-off can apply to OT or Training. The selected event date is
      authoritative so an old OT event cannot be reversed when today's
      Training is what was called off.
    */
    select id,event_date,action_type
      into target_event,target_date,target_type
    from public.ot_events
    where officer_id=p_officer_id
      and not reversed
      and action_type in ('Volunteer OT','Required OT','Training')
      and event_date=v_event_date
    order by created_at desc
    limit 1;

    if target_event is null then
      raise exception 'No active OT or Training event found for %', v_event_date;
    end if;

    update public.ot_events
      set reversed=true,reversed_at=now()
    where id=target_event;

    select e.action_type,e.event_date
      into prev_type,prev_date
    from public.ot_events e
    where e.officer_id=p_officer_id
      and not e.reversed
      and e.action_type in ('Volunteer OT','Required OT','Training')
    order by e.created_at desc
    limit 1;

    if prev_date is null then
      select baseline_event_type,baseline_event_date
        into prev_type,prev_date
      from public.officers
      where id=p_officer_id;
      if prev_type not in ('Volunteer OT','Required OT','Training') then
        prev_type:=null;
        prev_date:=null;
      end if;
    end if;

    update public.officers
    set called_off_date=target_date, called_off_event_type=target_type,
        display_event_type=prev_type,
        display_event_date=prev_date,
        updated_at=now()
    where id=p_officer_id;
  else
    raise exception 'Unsupported action';
  end if;
  return jsonb_build_object('ok',true);
end
$function$;

CREATE OR REPLACE FUNCTION public.alpha_apply_action_with_bereavement(p_officer_id uuid, p_action text, p_event_date date DEFAULT CURRENT_DATE, p_vacation_return_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_now date := (now() at time zone 'America/Chicago')::date;
  v_original public.officers%rowtype; v_start date := coalesce(p_event_date,v_now);
begin
  if public.current_user_role() not in ('admin','editor') then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  select * into v_original from public.officers where id=p_officer_id for update;
  if not found then raise exception 'Officer not found'; end if;
  if p_action='Bereavement' then
    if p_vacation_return_date is null then raise exception 'Bereavement return date required'; end if;
    if p_vacation_return_date <= v_start then raise exception 'Return date must be after the start date'; end if;
    if p_vacation_return_date <= v_now then raise exception 'Return date must be in the future'; end if;
    perform set_config('alpha.audit_action','Bereavement',true);
    update public.officers
      set status=case when v_start<=v_now then 'Bereavement' else 'Active' end,
          bereavement_start_date=v_start,bereavement_return_date=p_vacation_return_date,
          vacation_return_date=null,temporarily_unavailable=false,
          temporarily_unavailable_date=null,updated_at=now()
    where id=p_officer_id;
    return jsonb_build_object('ok',true);
  end if;
  if p_action in ('Volunteer OT','Required OT','Training') then
    if v_original.status in ('Military','Jury Duty','Bonding') then
      raise exception 'Officer is unavailable for OT or Training due to %',v_original.status
        using errcode='22023';
    end if;
    if v_original.bereavement_start_date is not null
       and (
         (v_start>=v_original.bereavement_start_date
          and v_start<v_original.bereavement_return_date)
         or (p_action in ('Volunteer OT','Required OT')
             and alpha_private.bereavement_voids_ot_block(
               v_start,v_original.bereavement_start_date,
               v_original.bereavement_return_date))
       ) then
      raise exception 'Officer is VOID for this OT block due to Bereavement';
    end if;
  end if;
  perform public.alpha_apply_action_auth(p_officer_id,p_action,p_event_date,p_vacation_return_date);
  if p_action in ('Active','Off Shift','Vacation','Military','Jury Duty','Bonding') then
    update public.officers set bereavement_start_date=null,bereavement_return_date=null,updated_at=now()
    where id=p_officer_id and bereavement_start_date is not null;
  elsif p_action in ('Volunteer OT','Required OT','Training') and v_original.status='Bereavement' then
    update public.officers set status='Bereavement',updated_at=now() where id=p_officer_id;
  end if;
  return jsonb_build_object('ok',true);
end $function$;

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

CREATE OR REPLACE FUNCTION public.alpha_manual_reorder(p_officer_id uuid, p_anchor_id uuid, p_placement text, p_expected_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_revision bigint; v_cards jsonb; v_moved jsonb; v_anchor jsonb; v_ids uuid[];
  v_before integer; v_anchor_pos integer; v_after integer; v_old_num integer; v_new_num integer;
  v_actor uuid; v_crew text; v_status text; v_row jsonb; v_index integer; v_id bigint;
begin
  v_actor:=auth.uid();
  if v_actor is null or public.current_user_role()<>'admin' then
    raise exception 'Admin access required' using errcode='42501';
  end if;
  if p_placement not in ('before','after') or p_officer_id=p_anchor_id then
    raise exception 'Invalid destination' using errcode='22023';
  end if;
  select revision into v_revision from alpha_private.list_state where singleton for update;
  if p_expected_revision is distinct from v_revision then
    raise exception 'The list changed before this move could be saved. Refresh and try again.' using errcode='40001';
  end if;
  v_cards:=public.alpha_list_summary();
  select value into v_moved from jsonb_array_elements(v_cards) value where value->>'id'=p_officer_id::text;
  select value into v_anchor from jsonb_array_elements(v_cards) value where value->>'id'=p_anchor_id::text;
  if v_moved is null or v_anchor is null or v_moved->>'crew'<>v_anchor->>'crew'
    or v_moved->>'status'<>v_anchor->>'status' then
    raise exception 'Move within the same crew and status group' using errcode='22023';
  end if;
  v_crew:=v_moved->>'crew'; v_status:=v_moved->>'status';
  if exists (
    select 1 from jsonb_array_elements(v_cards) with ordinality as x(value,ord)
    where ord between least(
      (select ord from jsonb_array_elements(v_cards) with ordinality as a(value,ord) where value->>'id'=p_officer_id::text),
      (select ord from jsonb_array_elements(v_cards) with ordinality as a(value,ord) where value->>'id'=p_anchor_id::text))
      and greatest(
      (select ord from jsonb_array_elements(v_cards) with ordinality as a(value,ord) where value->>'id'=p_officer_id::text),
      (select ord from jsonb_array_elements(v_cards) with ordinality as a(value,ord) where value->>'id'=p_anchor_id::text))
      and (value->>'crew'<>v_crew or value->>'status'<>v_status)
  ) then
    raise exception 'Move within one contiguous crew and status section' using errcode='22023';
  end if;
  select array_agg((value->>'id')::uuid order by group_ord),
         max(group_ord::integer) filter(where value->>'id'=p_officer_id::text),
         max(group_ord::integer) filter(where value->>'id'=p_anchor_id::text)
  into v_ids,v_before,v_anchor_pos
  from (select value,row_number() over(order by ord) group_ord
        from jsonb_array_elements(v_cards) with ordinality as x(value,ord)
        where value->>'crew'=v_crew and value->>'status'=v_status) grouped;
  v_after:=v_anchor_pos+case when p_placement='after' then 1 else 0 end;
  if v_before<v_after then v_after:=v_after-1; end if;
  if v_after=v_before then return jsonb_build_object('saved',false,'revision',v_revision); end if;
  -- The public display groups status; only the moved ID and anchor are persisted.
  -- Numbers are based on eligible officers, including those before this group.
  -- Power Crew has its own availability; it has no same-crew move while alone.
  if v_status='Active' and v_crew='Alpha' then
    select count(*)::integer into v_old_num
    from jsonb_array_elements(v_cards) with ordinality as x(value,ord)
    where value->>'crew'='Alpha' and value->>'status'='Active'
      and not ((value->>'temporarily_unavailable')::boolean
        and value->>'temporarily_unavailable_date'=(now() at time zone 'America/Chicago')::date::text)
      and ord <= (select ord from jsonb_array_elements(v_cards) with ordinality as y(value,ord)
                  where value->>'id'=p_officer_id::text);
    if (v_moved->>'temporarily_unavailable')::boolean
       and v_moved->>'temporarily_unavailable_date'=(now() at time zone 'America/Chicago')::date::text then
      v_old_num:=null;
    else
      v_ids:=array_remove(v_ids,p_officer_id);
      v_ids:=v_ids[1:v_after-1] || array[p_officer_id] || v_ids[v_after:array_length(v_ids,1)];
      select count(*)::integer into v_new_num
      from unnest(v_ids) with ordinality as x(id,ord)
      join jsonb_array_elements(v_cards) value on value->>'id'=x.id::text
      where ord<=v_after
        and not ((value->>'temporarily_unavailable')::boolean
          and value->>'temporarily_unavailable_date'=(now() at time zone 'America/Chicago')::date::text);
    end if;
  end if;
  insert into alpha_private.manual_reorders(officer_id,anchor_id,placement,crew,status,actor_id)
  values(p_officer_id,p_anchor_id,p_placement,v_crew,v_status,v_actor) returning id into v_id;
  insert into alpha_private.audit_log(officer_id,source_table,source_id,operation,action_label,actor_id,actor_kind,before_value,after_value)
  values(p_officer_id,'manual_reorders',p_officer_id,'INSERT','Manual list reorder',v_actor,'Authenticated user',
    jsonb_build_object('crew',v_crew,'status',v_status,'group_position',v_before,'eligible_number',v_old_num),
    jsonb_build_object('crew',v_crew,'status',v_status,'group_position',v_after,'eligible_number',v_new_num,
      'anchor_id',p_anchor_id,'placement',p_placement,'reorder_id',v_id));
  update alpha_private.list_state set revision=revision+1 where singleton returning revision into v_revision;
  return jsonb_build_object('saved',true,'revision',v_revision);
end $function$;

CREATE OR REPLACE FUNCTION public.alpha_move_training_calendar(p_officer_name text, p_new_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid;v_prior date;v_name text;
begin
 if public.current_user_role() not in ('editor','admin') then
   raise exception 'Not authorized' using errcode='42501';
 end if;
 if p_new_date is null then raise exception 'Select a new Training date'; end if;
 select s.officer_id,s.training_date,o.name
 into v_id,v_prior,v_name
 from public.alpha_training_schedule s
 join public.officers o on o.id=s.officer_id
 where o.name=trim(p_officer_name) for update of s;
 if v_id is null then raise exception 'Officer not found in Training schedule'; end if;
 if v_prior is distinct from p_new_date then
   update public.alpha_training_schedule set training_date=p_new_date,
     updated_at=clock_timestamp(),updated_by=auth.uid()
     where officer_id=v_id;
   insert into alpha_private.training_calendar_changes(officer_id,before_date,after_date,actor_id)
     values(v_id,v_prior,p_new_date,auth.uid());
 end if;
 return jsonb_build_object('ok',true,'name',v_name,'old_date',v_prior,'new_date',p_new_date);
end $function$;

CREATE OR REPLACE FUNCTION public.alpha_officer_history(p_officer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_from date; v_today date; v_officer public.officers%rowtype;
begin
  if auth.uid() is null or public.current_user_role()<>'admin' then raise exception 'Admin access required' using errcode='42501'; end if;
  select * into v_officer from public.officers where id=p_officer_id;
  if not found then raise exception 'Officer not found'; end if;
  v_today:=(now() at time zone 'America/Chicago')::date; v_from:=v_today-59;
  return jsonb_build_object(
    'name',v_officer.name,'crew',v_officer.crew,'from',v_from,'through',v_today,
    'events',coalesce((select jsonb_agg(to_jsonb(h) order by h.event_date desc,h.created_at desc nulls last) from (
      select e.id,e.event_date,e.action_type,e.reversed,e.created_at,e.reversed_at,
        case when e.reversed then coalesce((select a.action_label from alpha_private.audit_log a
          where a.source_table='ot_events' and a.source_id=e.id and a.operation='UPDATE' and a.after_value->>'reversed'='true'
          order by a.happened_at desc limit 1),'Reversed — reason not recorded') end as reversal_reason,
        coalesce((select coalesce(p.email,a.actor_id::text) from alpha_private.audit_log a left join public.profiles p on p.id=a.actor_id where a.source_table='ot_events'
          and a.source_id=e.id and a.operation='INSERT' order by a.happened_at limit 1),'Not recorded') as entered_by,
        false as baseline from public.ot_events e where e.officer_id=p_officer_id and e.event_date between v_from and v_today
      union all
      select null::uuid,v_officer.baseline_event_date,v_officer.baseline_event_type,false,null::timestamptz,null::timestamptz,
        null::text,'Not recorded',true where v_officer.baseline_event_date between v_from and v_today
        and v_officer.baseline_event_type in ('Initial','Training','Volunteer OT','Required OT','Vacation Return')
        and not exists(select 1 from public.ot_events same where same.officer_id=p_officer_id
          and same.event_date=v_officer.baseline_event_date and same.action_type=v_officer.baseline_event_type)
    ) h),'[]'::jsonb),
    'upcoming',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'event_date',e.event_date,'action_type',e.action_type,
                  'created_at',e.created_at,'reversed',e.reversed,'reversed_at',e.reversed_at,
                  'reversal_reason',case when e.reversed then coalesce((select a.action_label from alpha_private.audit_log a
                    where a.source_table='ot_events' and a.source_id=e.id and a.operation='UPDATE' and a.after_value->>'reversed'='true'
                    order by a.happened_at desc limit 1),'Reversed — reason not recorded') end)
                  order by e.event_date,e.created_at)
      from public.ot_events e where e.officer_id=p_officer_id and e.event_date>v_today),'[]'::jsonb),
    'administrative_changes',coalesce((select jsonb_agg(jsonb_build_object('at',a.happened_at,'action',a.action_label,
       'operation',a.operation,'source',a.source_table,'source_id',a.source_id,'actor',coalesce(p.email,a.actor_id::text,a.actor_kind),
       'before',a.before_value,'after',a.after_value) order by a.happened_at desc,a.id desc)
      from alpha_private.audit_log a left join public.profiles p on p.id=a.actor_id where a.officer_id=p_officer_id
        and (a.happened_at at time zone 'America/Chicago')::date between v_from and v_today),'[]'::jsonb)
  );
end $function$;

CREATE OR REPLACE FUNCTION public.alpha_undo_last_change(p_transaction_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_preview jsonb;
  v_change alpha_private.undo_change_log%rowtype;
  v_table text;
  v_pk text;
  v_current jsonb;
  v_columns text;
  v_action_count integer:=0;
  v_training_dates date[]:=array[]::date[];
  v_day date;
  v_actor uuid:=auth.uid();
begin
  if public.current_user_role() not in ('editor','admin') then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  -- Serialize with officer/OT edits, and require the exact item previewed.
  perform 1 from alpha_private.list_state where singleton for update;
  v_preview:=public.alpha_undo_preview();
  if not coalesce((v_preview->>'available')::boolean,false)
     or p_transaction_id is distinct from (v_preview->>'transaction_id')::bigint then
    raise exception 'A newer action exists. Refresh Undo Last Change before continuing.';
  end if;

  perform set_config('alpha.undo_in_progress','on',true);
  perform set_config('alpha.audit_action','Undo Last Change',true);

  for v_change in
    select * from alpha_private.undo_change_log
    where transaction_id=p_transaction_id order by id desc
  loop
    v_table:=v_change.table_name;
    if v_table not in (
      'public.officers','public.ot_events',
      'alpha_private.manual_reorders',
      'public.alpha_training_schedule','public.seniority','public.profiles'
    ) then raise exception 'Unsupported change type %',v_table; end if;
    v_pk:=case when v_table='public.alpha_training_schedule'
      then 'officer_id' else 'id' end;
    v_current:=null;
    execute format('select to_jsonb(t) from %s t where t.%I::text=$1 for update',v_table,v_pk)
      into v_current using v_change.row_key;
    if v_change.operation='INSERT' then
      if v_current is distinct from v_change.after_row then
        raise exception 'This change was modified later; cannot undo safely';
      end if;
      if v_table='public.ot_events' then
        update public.ot_events
           set reversed=true,reversed_at=clock_timestamp()
        where id=v_change.row_key::uuid;
        if v_change.after_row->>'action_type'='Training' then
          v_training_dates:=array_append(v_training_dates,
             (v_change.after_row->>'event_date')::date);
        end if;
      else
        execute format('delete from %s where %I::text=$1',v_table,v_pk)
          using v_change.row_key;
        if v_table='alpha_private.manual_reorders' then
          insert into alpha_private.audit_log(
            officer_id,source_table,source_id,operation,action_label,
            actor_id,actor_kind,before_value,after_value
          ) values (
            (v_change.after_row->>'officer_id')::uuid,
            'manual_reorders',(v_change.after_row->>'officer_id')::uuid,
            'DELETE','Undo Last Change',v_actor,'Authenticated user',
            v_change.after_row,null
          );
        end if;
      end if;
    elsif v_change.operation='UPDATE' then
      if v_current is distinct from v_change.after_row then
        raise exception 'This change was modified later; cannot undo safely';
      end if;
      select string_agg(format('%I',a.attname),',' order by a.attnum)
        into v_columns
      from pg_attribute a
      where a.attrelid=to_regclass(v_table)
        and a.attnum>0 and not a.attisdropped
        and a.attname<>v_pk and a.attgenerated='';
      if v_columns is null then raise exception 'Table fields not available'; end if;
      execute format(
        'update %s set (%s)=(select %s from jsonb_populate_record(null::%s,$1)) where %I::text=$2',
        v_table,v_columns,v_columns,v_table,v_pk
      ) using v_change.before_row,v_change.row_key;
      if v_table='public.alpha_training_schedule' then
        insert into alpha_private.training_calendar_changes(
          officer_id,before_date,after_date,actor_id
        ) values (
          (v_change.row_key)::uuid,
          (v_change.after_row->>'training_date')::date,
          (v_change.before_row->>'training_date')::date,
          v_actor
        );
      end if;
    elsif v_change.operation='DELETE' then
      if v_current is not null then
        raise exception 'Deleted record was recreated; cannot undo safely';
      end if;
      execute format('insert into %s select (jsonb_populate_record(null::%s,$1)).*',
        v_table,v_table) using v_change.before_row;
    else
      raise exception 'Unsupported operation';
    end if;
    v_action_count:=v_action_count+1;
  end loop;

  -- An undone Training batch must not leave an obsolete pre-group snapshot.
  foreach v_day in array v_training_dates loop
    if not exists(select 1 from public.ot_events
       where action_type='Training' and event_date=v_day and not reversed) then
      delete from alpha_private.training_group_positions where training_date=v_day;
    end if;
  end loop;

  insert into alpha_private.undo_completed(
     transaction_id,original_actor,undone_by,change_count
  )
  select p_transaction_id,l.actor_id,v_actor,v_action_count
  from alpha_private.undo_change_log l
  where l.transaction_id=p_transaction_id
  order by l.id desc limit 1;
  return jsonb_build_object('ok',true,'changes_reversed',v_action_count,
    'original_action',v_preview->>'action',
    'transaction_id',p_transaction_id);
end $function$;

CREATE OR REPLACE FUNCTION public.alpha_undo_preview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_recent alpha_private.undo_change_log%rowtype;
  v_count int;
  v_officers int;
  v_role text:=public.current_user_role();
  v_action text;
  v_date text;
begin
 if v_role not in ('admin','editor') then
   raise exception 'Not authorized' using errcode='42501';
 end if;
 select l.* into v_recent
 from alpha_private.undo_change_log l
 where not exists (
   select 1 from alpha_private.undo_completed done
   where done.transaction_id=l.transaction_id
 )
 order by l.id desc limit 1;
 if not found then
   return jsonb_build_object('available',false,'reason','No recent changes available to undo');
 end if;
 if v_role<>'admin' and v_recent.actor_id is distinct from auth.uid() then
   return jsonb_build_object('available',false,
     'reason','The most recent change belongs to another user. Ask an Admin to undo it.');
 end if;
 select count(*),count(distinct coalesce(
   case when table_name='public.ot_events'
     then coalesce(after_row,before_row)->>'officer_id'
     when table_name='alpha_private.manual_reorders'
     then coalesce(after_row,before_row)->>'officer_id'
     when table_name='public.alpha_training_schedule'
     then coalesce(after_row,before_row)->>'officer_id'
     else row_key end))
 into v_count,v_officers
 from alpha_private.undo_change_log
 where transaction_id=v_recent.transaction_id;
 select coalesce(
   (select action_label from alpha_private.undo_change_log
    where transaction_id=v_recent.transaction_id and action_label is not null
      and action_label<>'Officer change'
    order by id desc limit 1),
   (select max(coalesce(after_row,before_row)->>'action_type')
    from alpha_private.undo_change_log
    where transaction_id=v_recent.transaction_id
      and table_name='public.ot_events'),
   'List change')
 into v_action;
 select max(coalesce(after_row,before_row)->>'event_date')
   into v_date from alpha_private.undo_change_log
 where transaction_id=v_recent.transaction_id
   and table_name='public.ot_events';
 return jsonb_build_object(
   'available',true,'transaction_id',v_recent.transaction_id,
   'action',v_action,'date',v_date,
   'officers',v_officers,'changes',v_count,
   'saved_at',v_recent.happened_at,
   'is_own_action',v_recent.actor_id=auth.uid()
 );
end $function$;
COMMIT;
