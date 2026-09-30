-- Close legacy table and PIN read/write paths after the new UI is live.
begin;
-- Complete history and baseline fields are only reachable inside vetted functions.
revoke all on public.officers,public.ot_events from public,anon,authenticated;
drop policy if exists "public read officers" on public.officers;
drop policy if exists "public read events" on public.ot_events;
revoke execute on function public.alpha_add_officer(text,text,text,text,date) from public,anon,authenticated;
revoke execute on function public.alpha_apply_action(text,uuid,text,date,date) from public,anon,authenticated;
revoke execute on function public.handle_new_user() from public,anon,authenticated;
revoke execute on function public.alpha_add_officer_auth(text,text,text,date) from public,anon,authenticated;
grant execute on function public.alpha_add_officer_auth(text,text,text,date) to authenticated;
commit;
