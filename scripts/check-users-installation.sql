-- READ ONLY: run in the intended development project's SQL Editor after migration.
-- Does not show passwords, tokens, password fingerprints, or personal user data.
select proname as function_name,
       prosecdef as security_definer,
       has_function_privilege('authenticated',oid,'EXECUTE') as browser_can_execute,
       has_function_privilege('service_role',oid,'EXECUTE') as server_can_execute
from pg_catalog.pg_proc where pronamespace='public'::regnamespace
  and proname like 'tenh_users_%' order by proname;
-- Expect browser_can_execute=false and server_can_execute=true for all these RPCs.
select c.relname as table_name,t.tgname as trigger_name,t.tgenabled as enabled
from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid
where t.tgname in ('aa_tenh_users_membership_fields_guard','zz_tenh_users_revision_guard',
                  'zz_tenh_users_seat_guard','aa_tenh_users_open_register_guard')
  and not t.tgisinternal order by c.relname,t.tgname;
-- Expect all four guards enabled (O). This is not an end-to-end checkout/login test.
select role, count(*) as membership_count
from public.business_members group by role order by role;
