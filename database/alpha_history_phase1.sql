-- Alpha OT history and least-privilege list API. Apply as one transaction.
begin;
create schema if not exists alpha_private;
revoke all on schema alpha_private from public, anon, authenticated;

create table if not exists alpha_private.audit_log (
  id bigint generated always as identity primary key,
  officer_id uuid not null,
  source_table text not null,
  source_id uuid not null,
  operation text not null,
  action_label text,
  actor_id uuid,
  actor_kind text not null,
  happened_at timestamptz not null default now(),
  before_value jsonb,
  after_value jsonb
);
alter table alpha_private.audit_log enable row level security;
revoke all on alpha_private.audit_log from public, anon, authenticated;
create index if not exists alpha_audit_officer_time on alpha_private.audit_log(officer_id,happened_at desc);
create index if not exists alpha_audit_source on alpha_private.audit_log(source_table,source_id);

create or replace function alpha_private.audit_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb; v_new jsonb; v_officer uuid; v_id uuid; v_actor uuid;
begin
  v_old := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_new := case when tg_op in ('UPDATE','INSERT') then to_jsonb(new) end;
  if tg_op='UPDATE' and (v_old - 'updated_at')=(v_new - 'updated_at') then return new; end if;
  v_officer := case when tg_table_name='officers' then coalesce((v_new->>'id')::uuid,(v_old->>'id')::uuid)
                    else coalesce((v_new->>'officer_id')::uuid,(v_old->>'officer_id')::uuid) end;
  v_id := coalesce((v_new->>'id')::uuid,(v_old->>'id')::uuid);
  v_actor := case when nullif(current_setting('alpha.audit_system',true),'') is not null then null else auth.uid() end;
  insert into alpha_private.audit_log(officer_id,source_table,source_id,operation,action_label,actor_id,actor_kind,before_value,after_value)
  values(v_officer,tg_table_name,v_id,tg_op,nullif(current_setting('alpha.audit_action',true),''),v_actor,
         case when v_actor is not null then 'Authenticated user'
              when nullif(current_setting('alpha.audit_system',true),'') is not null then 'Automated system'
              else 'Not recorded' end,v_old,v_new);
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function alpha_private.audit_change() from public, anon, authenticated;
drop trigger if exists alpha_audit_officers on public.officers;
create trigger alpha_audit_officers after insert or update or delete on public.officers
for each row execute function alpha_private.audit_change();
drop trigger if exists alpha_audit_events on public.ot_events;
create trigger alpha_audit_events after insert or update or delete on public.ot_events
for each row execute function alpha_private.audit_change();

create or replace function alpha_private.block_id(p_date date) returns integer
language sql immutable strict set search_path = '' as $$
  select floor((p_date-date '2026-09-12') / 14.0)::integer * 6 +
         case (((p_date-date '2026-09-12') % 14 + 14) % 14)
           when 0 then 0 when 1 then 0 when 2 then 0
           when 3 then 1 when 4 then 1 when 5 then 2 when 6 then 2
           when 7 then 3 when 8 then 3 when 9 then 3
           when 10 then 4 when 11 then 4 else 5 end
$$;
revoke all on function alpha_private.block_id(date) from public, anon, authenticated;

do $$ begin
  if not exists(select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='alpha_private' and t.typname='rotation_entry') then
    create type alpha_private.rotation_entry as (
      officer_id uuid, action_type text, event_date date,
      created_at timestamptz, rotation_sort_at timestamptz, officer_name text
    );
  end if;
end $$;
create or replace function alpha_private.compare_rotation(a alpha_private.rotation_entry,b alpha_private.rotation_entry)
returns integer language plpgsql immutable set search_path = '' as $$
declare av integer; bv integer;
begin
  av:=alpha_private.block_id(a.event_date); bv:=alpha_private.block_id(b.event_date);
  if av<>bv then return case when av<bv then -1 else 1 end; end if;
  if a.action_type='Initial' or b.action_type='Initial' then
    if a.event_date<>b.event_date then return case when a.event_date<b.event_date then -1 else 1 end; end if;
    if a.action_type='Initial' and b.action_type='Initial' then
      return case when a.officer_name<b.officer_name then -1 when a.officer_name>b.officer_name then 1 else 0 end;
    end if;
    return case when a.action_type='Initial' then 1 else -1 end;
  end if;
  av:=case a.action_type when 'Training' then 1 when 'Volunteer OT' then 2 when 'Required OT' then 3 else 4 end;
  bv:=case b.action_type when 'Training' then 1 when 'Volunteer OT' then 2 when 'Required OT' then 3 else 4 end;
  if av<>bv then return case when av<bv then -1 else 1 end; end if;
  if a.event_date<>b.event_date then return case when a.event_date<b.event_date then -1 else 1 end; end if;
  if coalesce(a.rotation_sort_at,a.created_at)<>coalesce(b.rotation_sort_at,b.created_at) then
    return case when coalesce(a.rotation_sort_at,a.created_at)<coalesce(b.rotation_sort_at,b.created_at) then -1 else 1 end;
  end if;
  return 0;
end $$;
revoke all on function alpha_private.compare_rotation(alpha_private.rotation_entry,alpha_private.rotation_entry) from public, anon, authenticated;

create or replace function public.alpha_list_summary() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_order uuid[]; v_events alpha_private.rotation_entry[]; v_key alpha_private.rotation_entry;
  v_count integer; i integer; j integer; v_today date;
  v_result jsonb;
begin
  v_today := (now() at time zone 'America/Chicago')::date;
  select array_agg(id order by base_order,id) into v_order from public.officers;
  select array_agg(x order by (x).created_at,(x).officer_id) into v_events from (
    select (e.officer_id,e.action_type,e.event_date,e.created_at,e.rotation_sort_at,o.name)::alpha_private.rotation_entry as x
      from public.ot_events e join public.officers o on o.id=e.officer_id
      where not e.reversed and e.action_type in ('Training','Volunteer OT','Required OT','Vacation Return')
    union all
    select (o.id,'Initial',o.baseline_event_date,o.created_at,null::timestamptz,o.name)::alpha_private.rotation_entry
      from public.officers o where o.initial_new_hire and o.baseline_event_date is not null
  ) s;
  v_count := coalesce(array_length(v_events,1),0);
  -- Stable insertion sort using the application's full scheduling-block comparator.
  if v_count>1 then
    for i in 2..v_count loop
      v_key:=v_events[i]; j:=i-1;
      while j>=1 loop
        exit when alpha_private.compare_rotation(v_key,v_events[j])>=0;
        v_events[j+1]:=v_events[j]; j:=j-1;
      end loop;
      v_events[j+1]:=v_key;
    end loop;
  end if;
  for i in 1..v_count loop
    v_order:=array_append(array_remove(v_order,(v_events[i]).officer_id),(v_events[i]).officer_id);
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',o.id,'name',o.name,'crew',o.crew,'status',o.status,'base_order',o.base_order,
    'vacation_return_date',o.vacation_return_date,'called_off_date',o.called_off_date,
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
end $$;
revoke all on function public.alpha_list_summary() from public, anon, authenticated;
grant execute on function public.alpha_list_summary() to anon, authenticated;

create or replace function public.alpha_officer_history(p_officer_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
end $$;
revoke all on function public.alpha_officer_history(uuid) from public, anon, authenticated;
grant execute on function public.alpha_officer_history(uuid) to authenticated;

-- Existing authenticated write functions keep their role checks; triggers audit them atomically.
-- Mark the precise reversal action for future entries without changing target selection.
create or replace function public.alpha_apply_action_auth(p_officer_id uuid,p_action text,p_event_date date default current_date,p_vacation_return_date date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_role text; target_event uuid; target_date date; v_event_date date; prev_type text; prev_date date;
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
  elsif p_action='Unavailable Today' then
    update public.officers set temporarily_unavailable=true,temporarily_unavailable_date=v_event_date,updated_at=now() where id=p_officer_id;
  elsif p_action in ('Volunteer OT','Required OT','Training') then
    insert into public.ot_events(officer_id,action_type,event_date) values(p_officer_id,p_action,v_event_date);
    update public.officers set status='Active',vacation_return_date=null,temporarily_unavailable=false,temporarily_unavailable_date=null,
      called_off_date=case when p_action in ('Volunteer OT','Required OT') then null else called_off_date end,
      display_event_type=p_action,display_event_date=v_event_date,initial_new_hire=false,updated_at=now() where id=p_officer_id;
  elsif p_action='Undo OT' then
    select id into target_event from public.ot_events where officer_id=p_officer_id and not reversed and action_type in ('Volunteer OT','Required OT') order by created_at desc limit 1;
    if target_event is null then raise exception 'No OT event to undo'; end if;
    update public.ot_events set reversed=true,reversed_at=now() where id=target_event;
  elsif p_action='Called Off' then
    select id,event_date into target_event,target_date from public.ot_events where officer_id=p_officer_id and not reversed and action_type in ('Volunteer OT','Required OT') order by created_at desc limit 1;
    if target_event is null then raise exception 'No OT event to call off'; end if;
    update public.ot_events set reversed=true,reversed_at=now() where id=target_event;
    select e.action_type,e.event_date into prev_type,prev_date from public.ot_events e where e.officer_id=p_officer_id and not e.reversed and e.action_type in ('Volunteer OT','Required OT') order by e.event_date desc,e.created_at desc limit 1;
    if prev_date is null then
      select baseline_event_type,baseline_event_date into prev_type,prev_date from public.officers where id=p_officer_id;
      if prev_type not in ('Volunteer OT','Required OT') then prev_type:=null;prev_date:=null;end if;
    end if;
    update public.officers set called_off_date=target_date,display_event_type=prev_type,display_event_date=prev_date,updated_at=now() where id=p_officer_id;
  else raise exception 'Unsupported action'; end if;
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.alpha_apply_action_auth(uuid,text,date,date) from public,anon,authenticated;
grant execute on function public.alpha_apply_action_auth(uuid,text,date,date) to authenticated;

create or replace function public.process_vacation_returns() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; v_count integer:=0;
begin
  perform set_config('alpha.audit_system','vacation return scheduler',true);
  perform set_config('alpha.audit_action','Automatic Vacation Return',true);
  for r in select id,vacation_return_date from public.officers where status='Vacation' and vacation_return_date is not null
    and vacation_return_date <= current_date loop
    if not exists(select 1 from public.ot_events where officer_id=r.id and action_type='Vacation Return' and event_date=r.vacation_return_date and not reversed) then
      insert into public.ot_events(officer_id,action_type,event_date) values(r.id,'Vacation Return',r.vacation_return_date);
    end if;
    update public.officers set status='Active',vacation_return_date=null,updated_at=now() where id=r.id;
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;
revoke all on function public.process_vacation_returns() from public,anon,authenticated;
grant execute on function public.process_vacation_returns() to anon,authenticated;

commit;
