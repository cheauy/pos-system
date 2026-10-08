-- These SECURITY DEFINER functions perform no caller or tenant check and were
-- executable by anon/authenticated through PostgREST. Every app caller uses the
-- service role (customers/actions.ts, lib/subscriptions/expire-businesses.ts,
-- api/internal/subscriptions/purge), so only service_role keeps EXECUTE.
revoke all on function public.adjust_customer_loyalty_points(uuid,uuid,integer,text) from public,anon,authenticated;
revoke all on function public.change_business_staff_limit(uuid,integer) from public,anon,authenticated;
revoke all on function public.disable_expired_businesses() from public,anon,authenticated;
revoke all on function public.expire_due_businesses() from public,anon,authenticated;
revoke all on function public.process_subscription_expirations(integer) from public,anon,authenticated;
grant execute on function public.adjust_customer_loyalty_points(uuid,uuid,integer,text) to service_role;
grant execute on function public.change_business_staff_limit(uuid,integer) to service_role;
grant execute on function public.disable_expired_businesses() to service_role;
grant execute on function public.expire_due_businesses() to service_role;
grant execute on function public.process_subscription_expirations(integer) to service_role;
