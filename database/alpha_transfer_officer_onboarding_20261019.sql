-- Alpha OT production — transferred officers (October 19, 2026)
--
-- Purpose:
--   * Admin can add an officer transferring from another crew.
--   * Preserve their last qualifying event type and date as baseline history.
--   * Insert before/after a selected current officer in the same status section.
--   * Do NOT insert an Alpha OT/Training event or force an artificial rotation drop.
--   * Allow an optional call number, displayed by alpha-call-numbers-v1.js.
--   * Keep pre-existing Initial new-hire onboarding and alphabetical placement
--     unchanged, with alpha_add_officer_auth still handling Initial.
--
-- User example: Cruz, Required OT Oct 17 2026, call #89, directly after Akre.
-- Cruz was added separately via the authorized transfer RPC; DO NOT
-- insert her as part of this reusable schema migration.
--
-- Production Supabase project: hvihhsrhoqbbhkobayhx
-- Beta was intentionally not changed.
-- Use this migration with the matching live index.html and
-- alpha-call-numbers-v1.js frontend changes.

alter table public.officers add column if not exists call_number integer;
-- The following constraint was created by the production migration:
-- alter table public.officers add constraint alpha_call_number_range
--   check (call_number is null or call_number between 1 and 9999);
-- For a fresh install, uncomment the statement above.

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
  ) order by case o.status when 'Active' then 0 when 'Vacation' then 1 else 2 end,ord.n),'[]'::jsonb)
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

revoke all on function public.alpha_add_transfer_auth(text,text,text,date,uuid,text,integer,bigint)
  from public,anon,authenticated;
grant execute on function public.alpha_add_transfer_auth(text,text,text,date,uuid,text,integer,bigint)
  to authenticated;
