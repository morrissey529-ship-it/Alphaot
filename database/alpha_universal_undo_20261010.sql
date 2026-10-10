-- Alpha OT universal Undo Last Change, deployed October 10, 2026.
-- Applicable to live Alpha OT and the separate Beta Supabase database.
-- New user-initiated changes only: earlier operations are not retroactively undoable.
--
-- The database groups changes by PostgreSQL transaction ID, so a
-- multi-officer batch, manual reorder, status change, Training-calendar move,
-- newly added officer, seniority edit or access-role edit forms one reversible
-- action. The whole undo is one database transaction; partial undo fails safely.
-- Undo of newly inserted OT/Training events sets reversed=true instead of
-- erasing their history; audit rows are retained.
-- Role policy: Admin or Editor. Editors can undo only their own most recent
-- action. Admins can undo the most recent action by any authorized user.
-- Automatic background returns and anonymous reads are not undoable actions.
-- The previous state is restored only while data still matches the saved
-- after-state. The caller must confirm the latest preview transaction ID.
-- Preserve this migration and alpha-undo-v1.js during a company handoff.

create table if not exists alpha_private.undo_change_log(
  id bigint generated always as identity primary key,
  transaction_id bigint not null,
  actor_id uuid not null,
  table_name text not null,
  row_key text not null,
  operation text not null check(operation in ('INSERT','UPDATE','DELETE')),
  before_row jsonb, after_row jsonb, action_label text,
  happened_at timestamptz not null default clock_timestamp()
);
create index if not exists alpha_undo_log_recent
  on alpha_private.undo_change_log(id desc);
create index if not exists alpha_undo_log_txid
  on alpha_private.undo_change_log(transaction_id);
alter table alpha_private.undo_change_log enable row level security;
revoke all on alpha_private.undo_change_log from public,anon,authenticated;

create table if not exists alpha_private.undo_completed(
  transaction_id bigint primary key,
  original_actor uuid not null, undone_by uuid not null,
  undone_at timestamptz not null default clock_timestamp(),
  change_count integer not null
);
alter table alpha_private.undo_completed enable row level security;
revoke all on alpha_private.undo_completed from public,anon,authenticated;

CREATE OR REPLACE FUNCTION alpha_private.capture_undo_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid:=auth.uid();
 v_key text;
 v_table text:=tg_table_schema||'.'||tg_table_name;
 v_prev jsonb;
 v_next jsonb;
 v_label text;
begin
 if v_actor is null or current_setting('alpha.undo_in_progress',true)='on' then
   return coalesce(new,old);
 end if;
 v_prev:=case when tg_op='INSERT' then null else to_jsonb(old) end;
 v_next:=case when tg_op='DELETE' then null else to_jsonb(new) end;
 v_key:=coalesce(v_next,v_prev)->>
   case when tg_table_name='alpha_training_schedule' then 'officer_id' else 'id' end;
 v_label:=nullif(current_setting('alpha.audit_action',true),'');
 if v_label is null then
   v_label:=case
     when tg_table_name='ot_events' then
       coalesce(v_next->>'action_type',v_prev->>'action_type','OT change')
     when tg_table_name='manual_reorders' then 'Manual list reorder'
     when tg_table_name='alpha_training_schedule' then 'Training calendar date'
     when tg_table_name='seniority' then 'Seniority change'
     when tg_table_name='profiles' then 'Access permission'
     when tg_table_name='officers' and tg_op='INSERT' then 'Add officer'
     else 'Officer change'
   end;
 end if;
 insert into alpha_private.undo_change_log(
  transaction_id,actor_id,table_name,row_key,operation,
  before_row,after_row,action_label
 ) values (txid_current(),v_actor,v_table,v_key,tg_op,v_prev,v_next,v_label);
 return coalesce(new,old);
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

drop trigger if exists alpha_undo_officers on public.officers;
create trigger alpha_undo_officers after insert or update or delete on public.officers
  for each row execute function alpha_private.capture_undo_change();
drop trigger if exists alpha_undo_ot_events on public.ot_events;
create trigger alpha_undo_ot_events after insert or update or delete on public.ot_events
  for each row execute function alpha_private.capture_undo_change();
drop trigger if exists alpha_undo_manual_reorders on alpha_private.manual_reorders;
create trigger alpha_undo_manual_reorders after insert or update or delete on alpha_private.manual_reorders
  for each row execute function alpha_private.capture_undo_change();
drop trigger if exists alpha_undo_training_calendar on public.alpha_training_schedule;
create trigger alpha_undo_training_calendar after insert or update or delete on public.alpha_training_schedule
  for each row execute function alpha_private.capture_undo_change();
drop trigger if exists alpha_undo_seniority on public.seniority;
create trigger alpha_undo_seniority after insert or update or delete on public.seniority
  for each row execute function alpha_private.capture_undo_change();
drop trigger if exists alpha_undo_profiles on public.profiles;
create trigger alpha_undo_profiles after update on public.profiles
  for each row execute function alpha_private.capture_undo_change();

revoke all on function public.alpha_undo_preview() from public,anon,authenticated;
grant execute on function public.alpha_undo_preview() to authenticated;
revoke all on function public.alpha_undo_last_change(bigint) from public,anon,authenticated;
grant execute on function public.alpha_undo_last_change(bigint) to authenticated;
