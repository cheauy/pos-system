begin;
set local lock_timeout='5s';
-- Renewal duration changes use the existing owner/payment locks, pricing and
-- promotion snapshot. No capacity or effective date is changed.
do $$
declare source text; patched text;
begin
  source:=pg_get_functiondef('public.update_pending_subscription_billing_term(uuid,uuid,uuid,integer)'::regprocedure);
  if position('o.order_kind not in (''reactivation'',''renewal'')' in source)>0 then return; end if;
  patched:=replace(source,
    'o.order_kind is distinct from ''reactivation''',
    '(o.order_kind is null or o.order_kind not in (''reactivation'',''renewal''))');
  if patched=source then raise exception 'Unexpected subscription duration function; no changes applied.'; end if;
  patched:=replace(patched,'Create a fresh reactivation checkout to change the billing term.',
    'Create a fresh renewal or reactivation checkout to change the billing term.');
  execute patched;
end $$;
-- Rollback: restore the previous reactivation-only order-kind guard.
notify pgrst, 'reload schema';
commit;
