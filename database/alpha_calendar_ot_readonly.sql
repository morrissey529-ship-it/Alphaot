-- Read-only OT calendar lookup (deployed Oct 7, 2026).
-- Calendar-only: does not update OT events, rotation, list order, or status.
-- Only returns valid Volunteer/Required OT date, name, V/R. Called-off/reversed
-- events are intentionally excluded. Range capped at 63 calendar days per call.

create or replace function public.alpha_calendar_ot(p_from date, p_through date)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_result jsonb;
begin
  if p_from is null or p_through is null or p_through < p_from or p_through-p_from > 62 then
    raise exception 'Choose a valid calendar range of no more than 63 days'
      using errcode='22023';
  end if;
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', e.event_date,
        'name', o.name,
        'code', case e.action_type when 'Required OT' then 'R' else 'V' end
      )
      order by e.event_date,
               case e.action_type when 'Volunteer OT' then 0 else 1 end,
               e.created_at, e.id
    ), '[]'::jsonb
  ) into v_result
  from public.ot_events e
  join public.officers o on o.id=e.officer_id
  where not e.reversed
    and e.action_type in ('Volunteer OT','Required OT')
    and e.event_date between p_from and p_through;
  return v_result;
end $$;

revoke all on function public.alpha_calendar_ot(date,date) from public, anon, authenticated;
grant execute on function public.alpha_calendar_ot(date,date) to anon, authenticated;
