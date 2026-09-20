-- Read-only inspection of the connected database; this does not apply migrations.
-- Run in the intended development project. No credentials or customer data returned.
SELECT signature, to_regprocedure(signature) IS NOT NULL AS installed
FROM (VALUES
 ('public.tenh_request_branch(uuid)'),
 ('public.tenh_pos_checkout_registered(uuid,jsonb)'),
 ('public.tenh_pos_checkout(uuid,jsonb)'),
 ('public.tenh_pos_checkout_status(uuid,uuid)'),
 ('public.tenh_run_branch_stock(uuid,text,jsonb)'),
 ('public.tenh_register_payment_parts(jsonb,text,numeric,numeric)'),
 ('public.tenh_lock_register_business(uuid,uuid)'),
 ('public.tenh_close_register_accounted(uuid,uuid,numeric,text)'),
 ('public.tenh_update_online_order_status(uuid,uuid,text,text)')
) AS required(signature);
-- Definition presence alone is NOT proof of correct behavior or a full migration.
SELECT n.nspname AS schema, p.proname AS function, p.prosecdef AS security_definer
FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN (
 'tenh_pos_checkout_registered','tenh_close_register_accounted',
 'tenh_register_payment_parts','tenh_lock_register_business','tenh_update_online_order_status'
) ORDER BY p.proname;
