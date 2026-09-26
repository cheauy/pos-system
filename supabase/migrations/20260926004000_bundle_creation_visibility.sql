begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
-- Save channel visibility in the same transaction as the recipe, image and
-- idempotency record. Missing fields retain legacy RPC behavior.
do $$declare d text; old_columns text:='low_stock_quantity,is_active,is_online)';
 old_values text:=',0,1,true,false);';
begin
 d:=pg_get_functiondef('public.tenh_create_packed_bundle(uuid,uuid,uuid,jsonb)'::regprocedure);
 if position('TENH_BUNDLE_VISIBILITY_V1' in d)>0 then return;end if;
 if position(old_columns in d)=0 or position(old_values in d)=0 then
  raise exception 'Bundle creation does not match the expected version. No changes were applied.';
 end if;
 d:=replace(d,old_columns,'low_stock_quantity,is_active,is_online,is_pos)');
 d:=replace(d,old_values,$new$,0,1,
   (coalesce((p_input->>'isPos')::boolean,true) or coalesce((p_input->>'isOnline')::boolean,false)),
   coalesce((p_input->>'isOnline')::boolean,false),coalesce((p_input->>'isPos')::boolean,true));$new$);
 d:=replace(d,'AS $function$',E'AS $function$\n-- TENH_BUNDLE_VISIBILITY_V1');
 execute d;
end$$;
notify pgrst,'reload schema';
commit;
