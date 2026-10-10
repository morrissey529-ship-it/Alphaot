-- Alpha OT, October 10, 2026
-- Calendar call-off status display (both Production and Beta).
-- Returns active Volunteer/Required OT records plus only reversed OT
-- events known to be Called Off according to the audit trail or
-- the matching officer called_off_date / called_off_event_type fields.
-- An ordinary Undo OT or correction is not shown as Called Off.
-- This function does not write events or alter the rotation.
-- Frontends show Called Off as gray struck-through names in the
-- clicked calendar day and in newest-first monthly OT history.
--
-- Caution: an 'assigned' record does not prove actual attendance.

CREATE OR REPLACE FUNCTION public.alpha_calendar_ot(p_from date, p_through date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb;
begin
 if p_from is null or p_through is null or p_through<p_from
    or p_through-p_from>62 then
   raise exception 'Choose a valid calendar range of no more than 63 days'
     using errcode='22023';
 end if;
 select coalesce(jsonb_agg(
    jsonb_build_object(
      'date',e.event_date,
      'name',o.name,
      'code',case e.action_type when 'Required OT' then 'R' else 'V' end,
      'status',case when e.reversed then 'called_off' else 'assigned' end
    )
    order by e.event_date,
       case e.action_type when 'Volunteer OT' then 0 else 1 end,
       e.created_at,e.id
 ),'[]'::jsonb)
 into v_result
 from public.ot_events e
 join public.officers o on o.id=e.officer_id
 where e.action_type in ('Volunteer OT','Required OT')
   and e.event_date between p_from and p_through
   and (
     not e.reversed
     or (
       e.reversed
       and (
         exists (
           select 1 from alpha_private.audit_log a
           where a.source_table='ot_events' and a.source_id=e.id
             and a.before_value->>'reversed'='false'
             and a.after_value->>'reversed'='true'
             and a.action_label ~* 'call(ed)?[[:space:]-]*off'
         )
         or (o.called_off_date=e.event_date
             and o.called_off_event_type=e.action_type)
       )
     )
   );
 return v_result;
end $function$;
