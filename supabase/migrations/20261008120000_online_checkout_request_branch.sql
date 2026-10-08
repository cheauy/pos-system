-- Guest storefront checkout runs as service_role (no auth.uid()) inside
-- place_branch_online_order, which sets tenh.online_branch. The orders and
-- order_items guards call tenh_request_branch, which raised 'Sign in again.'
-- for every guest order. Trust the online branch only for service_role.
DO $$
DECLARE src text;
BEGIN
  SELECT pg_get_functiondef('public.tenh_request_branch(uuid)'::regprocedure) INTO src;
  IF position('tenh.online_branch' in src) > 0 THEN RETURN; END IF;
  src := replace(src,
    E'  IF auth.uid() IS NULL THEN\n    RAISE EXCEPTION ''Sign in again.'' USING ERRCODE=''42501'';',
    E'  IF auth.uid() IS NULL AND coalesce(auth.role(),'''')=''service_role''\n     AND nullif(current_setting(''tenh.online_branch'',true),'''') IS NOT NULL THEN\n    RETURN current_setting(''tenh.online_branch'')::uuid;\n  END IF;\n\n  IF auth.uid() IS NULL THEN\n    RAISE EXCEPTION ''Sign in again.'' USING ERRCODE=''42501'';');
  IF position('tenh.online_branch' in src) = 0 THEN
    RAISE EXCEPTION 'tenh_request_branch body changed; patch by hand.';
  END IF;
  EXECUTE src;
END $$;
