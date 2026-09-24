begin;
do $$declare d text;f record;begin
 select pg_get_functiondef('public.tenh_adjust_branch_stock(uuid,uuid,uuid,text,integer,text,text,uuid,integer)'::regprocedure) into d;
 d:=replace(d,'and business_id = p_business_id and is_active for update','and business_id = p_business_id for update');
 d:=replace(d,'select quantity into v_before from public.product_location_stock',
 'if not exists(select 1 from public.branch_product_details where business_id=p_business_id and id=p_product_id and location_id=p_location_id and is_active and not branch_archived) then raise exception ''This product is unavailable in this branch.'';end if; select quantity into v_before from public.product_location_stock');
 execute d;
 select pg_get_functiondef('public.tenh_choose_online_branch(uuid,jsonb)'::regprocedure) into d;
 d:=replace(d,'or s.product_id is null or cart.quantity>', 'or not exists(select 1 from public.branch_product_details d where d.business_id=p_business and d.id=p.id and d.location_id=l.id and d.is_active and not d.branch_archived) or s.product_id is null or cart.quantity>');
 if position('branch_product_details' in d)=0 then raise exception 'Review online fulfillment branch validation before applying.';end if;
 execute d;
 select pg_get_functiondef('public.tenh_pack_bundle(uuid,uuid,uuid,integer,uuid)'::regprocedure) into d;
 d:=replace(d,'insert into public.stock_adjustments(', 'perform set_config(''tenh.adjustment_branch'',p_branch_id::text,true); insert into public.stock_adjustments(');
 d:=replace(d,'return p_bundle_id;', 'perform set_config(''tenh.adjustment_branch'','''',true); return p_bundle_id;');
 execute d;
 -- Legacy core checkout is called only by guarded POS wrappers, never directly.
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in ('checkout_order','checkout_order_with_options') loop
  execute format('revoke execute on function %s from public,anon,authenticated',f.signature);
 end loop;
end$$;
notify pgrst,'reload schema';
commit;
