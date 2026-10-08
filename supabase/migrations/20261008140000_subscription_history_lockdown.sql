-- "Super admin manage subscription history" was FOR ALL TO public USING (true)
-- WITH CHECK (true), so the anon key could read and rewrite every tenant's
-- billing history. Super-admin pages use service_role and every writer is a
-- service_role-only SECURITY DEFINER function, so no client role needs writes.
-- Members keep read access to their own business via the existing policy.
begin;
drop policy if exists "Super admin manage subscription history" on public.subscription_history;
revoke insert, update, delete, truncate on public.subscription_history from public, anon, authenticated;
revoke select on public.subscription_history from anon;
commit;
