-- Include canceled future assignments in admin review.
begin;
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

commit;
