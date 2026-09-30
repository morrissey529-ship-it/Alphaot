-- Manual list corrections are replayed between the events that preceded and followed them.
begin;
create table if not exists alpha_private.list_state (
  singleton boolean primary key default true check (singleton), revision bigint not null default 0
);
insert into alpha_private.list_state(singleton) values(true) on conflict do nothing;
alter table alpha_private.list_state enable row level security;
revoke all on alpha_private.list_state from public, anon, authenticated;

create table if not exists alpha_private.manual_reorders (
  id bigint generated always as identity primary key,
  officer_id uuid not null,
  anchor_id uuid not null,
  placement text not null check (placement in ('before','after')),
  crew text not null,
  status text not null,
  actor_id uuid not null,
  happened_at timestamptz not null default clock_timestamp()
);
create index if not exists manual_reorders_time on alpha_private.manual_reorders(happened_at,id);
alter table alpha_private.manual_reorders enable row level security;
revoke all on alpha_private.manual_reorders from public, anon, authenticated;

create table if not exists alpha_private.action_clock (
  source_table text not null, source_id uuid not null,
  happened_at timestamptz not null default clock_timestamp(),
  primary key(source_table,source_id)
);
alter table alpha_private.action_clock enable row level security;
revoke all on alpha_private.action_clock from public,anon,authenticated;

create or replace function alpha_private.lock_list_state() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from alpha_private.list_state where singleton for update;
  return null;
end $$;
revoke all on function alpha_private.lock_list_state() from public,anon,authenticated;
drop trigger if exists alpha_lock_officers on public.officers;
create trigger alpha_lock_officers before insert or update or delete on public.officers
for each statement execute function alpha_private.lock_list_state();
drop trigger if exists alpha_lock_events on public.ot_events;
create trigger alpha_lock_events before insert or update or delete on public.ot_events
for each statement execute function alpha_private.lock_list_state();

create or replace function alpha_private.record_action_clock() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into alpha_private.action_clock(source_table,source_id) values(tg_table_name,new.id);
  return new;
end $$;
revoke all on function alpha_private.record_action_clock() from public,anon,authenticated;
drop trigger if exists alpha_clock_officers on public.officers;
create trigger alpha_clock_officers after insert on public.officers
for each row execute function alpha_private.record_action_clock();
drop trigger if exists alpha_clock_events on public.ot_events;
create trigger alpha_clock_events after insert on public.ot_events
for each row execute function alpha_private.record_action_clock();

create or replace function alpha_private.bump_list_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update alpha_private.list_state set revision=revision+1 where singleton;
  return null;
end $$;
revoke all on function alpha_private.bump_list_revision() from public, anon, authenticated;
drop trigger if exists alpha_revision_officers on public.officers;
create trigger alpha_revision_officers after insert or update or delete on public.officers
for each statement execute function alpha_private.bump_list_revision();
drop trigger if exists alpha_revision_events on public.ot_events;
create trigger alpha_revision_events after insert or update or delete on public.ot_events
for each statement execute function alpha_private.bump_list_revision();

create or replace function alpha_private.replay_segment(p_order uuid[], p_after timestamptz, p_until timestamptz)
returns uuid[] language plpgsql security definer set search_path = '' as $$
declare v_events alpha_private.rotation_entry[]; v_key alpha_private.rotation_entry; n integer; i integer; j integer;
begin
  select array_agg(x order by (x).created_at,(x).officer_id) into v_events from (
    select (e.officer_id,e.action_type,e.event_date,coalesce(c.happened_at,e.created_at),e.rotation_sort_at,o.name)::alpha_private.rotation_entry x
    from public.ot_events e join public.officers o on o.id=e.officer_id
    left join alpha_private.action_clock c on c.source_table='ot_events' and c.source_id=e.id
    where not e.reversed and e.action_type in ('Training','Volunteer OT','Required OT','Vacation Return')
      and (p_after is null or coalesce(c.happened_at,e.created_at)>p_after) and (p_until is null or coalesce(c.happened_at,e.created_at)<=p_until)
    union all
    select (o.id,'Initial',o.baseline_event_date,coalesce(c.happened_at,o.created_at),null::timestamptz,o.name)::alpha_private.rotation_entry
    from public.officers o left join alpha_private.action_clock c on c.source_table='officers' and c.source_id=o.id
    where o.initial_new_hire and o.baseline_event_date is not null
      and (p_after is null or coalesce(c.happened_at,o.created_at)>p_after) and (p_until is null or coalesce(c.happened_at,o.created_at)<=p_until)
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
  return p_order;
end $$;
revoke all on function alpha_private.replay_segment(uuid[],timestamptz,timestamptz) from public,anon,authenticated;

create or replace function alpha_private.rotation_order() returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare v_order uuid[]; v_after timestamptz; v_move record; v_at integer;
begin
  select array_agg(id order by base_order,id) into v_order from public.officers;
  for v_move in select * from alpha_private.manual_reorders order by happened_at,id loop
    v_order:=alpha_private.replay_segment(v_order,v_after,v_move.happened_at);
    if v_move.officer_id=any(v_order) and v_move.anchor_id=any(v_order) then
      v_order:=array_remove(v_order,v_move.officer_id);
      v_at:=array_position(v_order,v_move.anchor_id);
      if v_move.placement='after' then v_at:=v_at+1; end if;
      v_order:=v_order[1:v_at-1] || array[v_move.officer_id] || v_order[v_at:array_length(v_order,1)];
    end if;
    v_after:=v_move.happened_at;
  end loop;
  return alpha_private.replay_segment(v_order,v_after,null);
end $$;
revoke all on function alpha_private.rotation_order() from public,anon,authenticated;

create or replace function public.alpha_list_summary() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_order uuid[]; v_events alpha_private.rotation_entry[]; v_key alpha_private.rotation_entry;
  v_count integer; i integer; j integer; v_today date;
  v_result jsonb; v_revision bigint;
begin
  v_today := (now() at time zone 'America/Chicago')::date;
  v_order:=alpha_private.rotation_order();
  select revision into v_revision from alpha_private.list_state where singleton;
  select coalesce(jsonb_agg(jsonb_build_object(
    'revision',v_revision,'id',o.id,'name',o.name,'crew',o.crew,'status',o.status,'base_order',o.base_order,
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
revoke all on function public.alpha_list_summary() from public,anon,authenticated;
grant execute on function public.alpha_list_summary() to anon,authenticated;

create or replace function public.alpha_manual_reorder(
  p_officer_id uuid,p_anchor_id uuid,p_placement text,p_expected_revision bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
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
end $$;
revoke all on function public.alpha_manual_reorder(uuid,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.alpha_manual_reorder(uuid,uuid,text,bigint) to authenticated;
commit;
