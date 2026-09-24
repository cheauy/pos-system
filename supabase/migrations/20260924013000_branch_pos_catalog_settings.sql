begin;
-- Patch installed calculation functions in place; preserve the proven payment,
-- register, rounding and retry logic surrounding these catalog/settings reads.
do $$declare f record; definition text; original text;begin
 for f in select oid,proname from pg_proc where pronamespace='public'::regnamespace and proname in
 ('tenh_pos_catalog_before_currency','tenh_pos_catalog','tenh_pos_checkout','tenh_pos_checkout_before_currency','tenh_pos_settings','tenh_pos_currency_settings','tenh_save_currency_format','checkout_order_with_options') loop
 original:=pg_get_functiondef(f.oid);definition:=original;
 if f.proname='tenh_pos_catalog_before_currency' then
   definition:=replace(definition,'from public.products p left join','from public.branch_products p left join');
   definition:=replace(definition,'o.business_id=p_business_id and o.status=', 'o.business_id=p_business_id and o.location_id=public.tenh_request_branch(p_business_id) and o.status=');
   definition:=replace(definition,'select to_jsonb(s) into v_store from public.business_storefronts s where s.business_id=p_business_id;',
     'select to_jsonb(s) into v_store from public.business_storefronts s where s.business_id=p_business_id; v_store:=coalesce(v_store,''{}''::jsonb)||coalesce((select to_jsonb(bs) from public.branch_pos_settings bs where bs.business_id=p_business_id and bs.location_id=public.tenh_request_branch(p_business_id)),''{}''::jsonb);');
 elsif f.proname in ('tenh_pos_catalog','tenh_pos_checkout','tenh_pos_checkout_before_currency') then
   definition:=replace(definition,'select * into v_store from public.business_storefronts where business_id=p_business_id for share;',
     'select * into v_store from public.business_storefronts where business_id=p_business_id for share; v_store:=jsonb_populate_record(v_store,(select to_jsonb(bs) from public.branch_pos_settings bs where bs.business_id=p_business_id and bs.location_id=public.tenh_request_branch(p_business_id)));');
   definition:=replace(definition,'select * into v_store from public.business_storefronts where business_id=p_business_id;',
     'select * into v_store from public.business_storefronts where business_id=p_business_id; v_store:=jsonb_populate_record(v_store,(select to_jsonb(bs) from public.branch_pos_settings bs where bs.business_id=p_business_id and bs.location_id=public.tenh_request_branch(p_business_id)));');
   if f.proname='tenh_pos_checkout_before_currency' then
     definition:=replace(definition,'if not found then raise exception ''A cart product is no longer available.''; end if;',
       'if not found then raise exception ''A cart product is no longer available.''; end if; v_product:=public.tenh_operating_product(v_product);');
   end if;
 elsif f.proname in ('tenh_pos_settings','tenh_pos_currency_settings','tenh_save_currency_format') then
   definition:=replace(definition,'public.business_storefronts','public.branch_pos_settings');
   definition:=replace(definition,'where business_id=p_business_id','where business_id=p_business_id and location_id=public.tenh_request_branch(p_business_id)');
   definition:=replace(definition,'from public.products where business_id=p_business_id and location_id=public.tenh_request_branch(p_business_id)','from public.product_location_stock where business_id=p_business_id and location_id=public.tenh_request_branch(p_business_id)');
 elsif f.proname='checkout_order_with_options' then
   definition:=replace(definition,'v_requested_quantity :=', 'v_product:=public.tenh_operating_product(v_product); v_requested_quantity :=');
 end if;
 if definition=original then raise exception 'Branch patch did not match %. Review the installed function before proceeding.',f.proname;end if;
 execute definition;
 end loop;
end$$;
notify pgrst,'reload schema';
commit;
