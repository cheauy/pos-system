begin;
set local lock_timeout='5s';
set local statement_timeout='90s';
alter table public.business_coupons
 add column if not exists is_automatic boolean not null default false,
 add column if not exists apply_pos boolean not null default false,
 add column if not exists apply_online boolean not null default true,
 add column if not exists product_ids uuid[];
alter table public.branch_pos_settings add column if not exists enable_coupons boolean not null default false;
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='public.business_coupons'::regclass and conname='automatic_promotion_conditions') then
  alter table public.business_coupons add constraint automatic_promotion_conditions check(not is_automatic or (minimum_order=0 and usage_limit is null and per_customer_limit is null));
 end if;
end$$;

create or replace function public.tenh_product_sale_price(p_business uuid,p_branch uuid,p_channel text,p_product uuid,p_price numeric)
returns numeric language sql stable security definer set search_path='' as $$
 select round(greatest(0,p_price-coalesce(max(least(p_price,
   case when c.discount_type='percentage' then round(p_price*c.discount_value/100,2) else c.discount_value end,
   coalesce(c.max_discount,p_price))),0)),2)
 from public.business_coupons c where c.business_id=p_business and c.is_active and c.is_automatic
 and ((p_channel='pos' and c.apply_pos and c.location_id=p_branch) or (p_channel='online' and c.apply_online))
 and (c.starts_at is null or c.starts_at<=now()) and (c.ends_at is null or c.ends_at>=now())
 and (c.product_ids is null or p_product=any(c.product_ids));
$$;
revoke all on function public.tenh_product_sale_price(uuid,uuid,text,uuid,numeric) from public,anon,authenticated;
grant execute on function public.tenh_product_sale_price(uuid,uuid,text,uuid,numeric) to service_role;

create or replace function public.tenh_pos_priced_product(p_product public.products)
returns public.products language plpgsql security definer set search_path='' as $$
declare result public.products;
begin
 result:=public.tenh_operating_product(p_product);
 result.selling_price:=public.tenh_product_sale_price(result.business_id,public.tenh_request_branch(result.business_id),'pos',result.id,result.selling_price);
 return result;
end$$;
revoke all on function public.tenh_pos_priced_product(public.products) from public,anon,authenticated;

-- Only trusted callers pass priced lines; the public preview below builds them.
create or replace function public.tenh_coupon_quote(p_business uuid,p_branch uuid,p_channel text,p_code text,p_lines jsonb,p_customer uuid,p_check_customer boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.business_coupons%rowtype; subtotal numeric; eligible numeric; discount numeric; enabled boolean;
begin
 if p_channel='pos' then
   select enable_coupons into enabled from public.branch_pos_settings where business_id=p_business and location_id=p_branch for share;
 else
   select enable_coupons into enabled from public.business_storefronts where business_id=p_business for share;
 end if;
 if not coalesce(enabled,false) then raise exception 'Coupon codes are disabled for this channel.';end if;
 select * into c from public.business_coupons where business_id=p_business and location_id=p_branch
 and upper(code)=upper(btrim(p_code)) and is_active and not is_automatic
 and ((p_channel='pos' and apply_pos) or (p_channel='online' and apply_online))
 and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>=now()) for update;
 if not found then raise exception 'This coupon is invalid or expired.';end if;
 select coalesce(sum((l->>'subtotal')::numeric),0),coalesce(sum((l->>'subtotal')::numeric)
 filter(where c.product_ids is null or (l->>'productId')::uuid=any(c.product_ids)),0)
 into subtotal,eligible from jsonb_array_elements(p_lines) l;
 if subtotal<c.minimum_order then raise exception 'This coupon requires a minimum order of %.',c.minimum_order;end if;
 if eligible<=0 then raise exception 'Add an eligible product to use this coupon.';end if;
 if c.usage_limit is not null and c.usage_count>=c.usage_limit then raise exception 'This coupon has reached its usage limit.';end if;
 if c.per_customer_limit is not null and p_check_customer then
  if p_customer is null then raise exception 'Select a customer to use this limited coupon.';end if;
  if (select count(*) from public.coupon_redemptions where coupon_id=c.id and customer_id=p_customer)>=c.per_customer_limit
   then raise exception 'This customer has reached the coupon usage limit.';end if;
 end if;
 discount:=least(eligible,coalesce(c.max_discount,eligible),case when c.discount_type='percentage' then round(eligible*c.discount_value/100,2) else c.discount_value end);
 return jsonb_build_object('id',c.id,'code',c.code,'discount',discount);
end$$;
revoke all on function public.tenh_coupon_quote(uuid,uuid,text,text,jsonb,uuid,boolean) from public,anon,authenticated;
grant execute on function public.tenh_coupon_quote(uuid,uuid,text,text,jsonb,uuid,boolean) to service_role;

create or replace function public.tenh_preview_online_coupon(p_business uuid,p_branch uuid,p_code text,p_items jsonb,p_phone text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb; product public.products%rowtype; lines jsonb:='[]'; unit numeric; extra numeric; quantity integer; customer uuid;
begin
 if auth.role()<>'service_role' then raise exception 'Server access required.';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Invalid cart.';end if;
 for item in select value from jsonb_array_elements(p_items) loop
  quantity:=(item->>'quantity')::integer;
  if quantity is null or quantity not between 1 and 999 then raise exception 'Invalid quantity.';end if;
  select * into product from public.products where business_id=p_business and id=(item->>'productId')::uuid and is_active and is_online;
  if not found then raise exception 'Product unavailable.';end if;
  select coalesce(sum(price_adjustment),0) into extra from public.product_options
  where business_id=p_business and product_id=product.id and is_active and id in(select value::uuid from jsonb_array_elements_text(coalesce(item->'optionIds','[]')));
  unit:=round(public.tenh_product_sale_price(p_business,p_branch,'online',product.id,product.selling_price)+extra,2);
  lines:=lines||jsonb_build_array(jsonb_build_object('productId',product.id,'subtotal',unit*quantity));
 end loop;
 select id into customer from public.customers where business_id=p_business and location_id=p_branch and phone=btrim(p_phone) limit 1;
 -- Preview may lack a customer's identity; final checkout enforces their limit.
 return public.tenh_coupon_quote(p_business,p_branch,'online',p_code,lines,customer,false);
end$$;
revoke all on function public.tenh_preview_online_coupon(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.tenh_preview_online_coupon(uuid,uuid,text,jsonb,text) to service_role;

-- Promotion editors may change only these four POS promotion fields. All other
-- branch settings retain their existing business-settings permission checks.
do $guard$ declare d text; anchor text:='perform public.tenh_assert_effective_permission(new.business_id,''business.update'');';begin
 d:=pg_get_functiondef('public.tenh_guard_branch_setting()'::regprocedure);
 if position('TENH_PROMOTION_SETTINGS_V1' in d)=0 then
  if position(anchor in d)=0 then raise exception 'Branch settings permission anchor missing';end if;
  d:=replace(d,anchor,$replacement$
  -- TENH_PROMOTION_SETTINGS_V1
  if tg_table_name='branch_pos_settings' and tg_op='UPDATE'
    and (to_jsonb(new)-array['enable_coupons','loyalty_enabled','loyalty_spend_per_point','loyalty_minimum_order','updated_at'])
      = (to_jsonb(old)-array['enable_coupons','loyalty_enabled','loyalty_spend_per_point','loyalty_minimum_order','updated_at'])
    and public.tenh_user_permission_allowed(new.business_id,auth.uid(),'storefront.update') then
    perform public.tenh_assert_effective_permission(new.business_id,'storefront.update');
  else
    perform public.tenh_assert_effective_permission(new.business_id,'business.update');
  end if;
  $replacement$);
  execute d;
 end if;
end $guard$;

create or replace function public.tenh_save_promotion_settings(p_business uuid,p_branch uuid,p_settings jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare spend numeric:=(p_settings->>'spend')::numeric; minimum numeric:=(p_settings->>'minimum')::numeric;
begin
 perform public.tenh_assert_effective_permission(p_business,'storefront.update');
 if p_branch is distinct from public.tenh_request_branch(p_business) then raise exception 'The branch changed. Reload settings.';end if;
 if spend is null or minimum is null or spend<=0 or minimum<0 or spend>999999999 or minimum>999999999 or spend::text='NaN' or minimum::text='NaN' then raise exception 'Enter valid earning rates.';end if;
 update public.branch_pos_settings set enable_coupons=(p_settings->>'posCoupons')::boolean,loyalty_enabled=(p_settings->>'posLoyalty')::boolean,
 loyalty_spend_per_point=spend,loyalty_minimum_order=minimum where business_id=p_business and location_id=p_branch;
 if not found then raise exception 'Branch promotion settings unavailable. Reload settings.';end if;
 update public.business_storefronts set enable_coupons=(p_settings->>'onlineCoupons')::boolean,loyalty_enabled=(p_settings->>'onlineLoyalty')::boolean,
 loyalty_spend_per_point=spend,loyalty_minimum_order=minimum,updated_at=now() where business_id=p_business;
 if not found then raise exception 'Online settings unavailable.';end if;
end$$;
revoke all on function public.tenh_save_promotion_settings(uuid,uuid,jsonb) from public,anon;
grant execute on function public.tenh_save_promotion_settings(uuid,uuid,jsonb) to authenticated;

-- Installed checkout functions are patched below with checked anchors. Every
-- update runs in this transaction; a mismatched version rolls everything back.

do $patch$ declare f record; d text; before_patch text; old_text text; new_text text; begin
 if (select count(distinct proname) from pg_proc where pronamespace='public'::regnamespace and proname in ('tenh_pos_checkout_before_currency','checkout_order_with_options','place_online_order','tenh_choose_online_branch','sync_order_loyalty_points'))<>5 then
  raise exception 'Required checkout functions are missing. Promotion migration was not applied.';
 end if;
 for f in select oid,proname from pg_proc where pronamespace='public'::regnamespace and proname in ('tenh_pos_checkout_before_currency','checkout_order_with_options','place_online_order','tenh_choose_online_branch','sync_order_loyalty_points') loop
d:=replace(pg_get_functiondef(f.oid),E'\r\n',E'\n'); if position('TENH_PROMOTIONS_V1' in d)>0 then continue; end if; before_patch:=d;
 if f.proname='tenh_pos_checkout_before_currency' then
old_text:=$old$v_discount_type text;$old$;new_text:=$new$v_coupon_quote jsonb; v_promo_lines jsonb:='[]'; v_discount_type text;$new$;
old_text:=replace(old_text,E'\r\n',E'\n');
if position(old_text in d)=0 then raise exception 'Promotion patch does not match %',f.proname;end if;d:=replace(d,old_text,new_text);
old_text:=$old$public.tenh_operating_product(v_product)$old$;new_text:=$new$public.tenh_pos_priced_product(v_product)$new$;
old_text:=replace(old_text,E'\r\n',E'\n');
if position(old_text in d)=0 then raise exception 'Promotion patch does not match %',f.proname;end if;d:=replace(d,old_text,new_text);
old_text:=$old$v_calculated_subtotal:=v_calculated_subtotal+v_unit*v_qty;$old$;new_text:=$new$v_calculated_subtotal:=v_calculated_subtotal+v_unit*v_qty; v_promo_lines:=v_promo_lines||jsonb_build_array(jsonb_build_object('productId',v_product.id,'subtotal',v_unit*v_qty));$new$;
old_text:=replace(old_text,E'\r\n',E'\n');
if position(old_text in d)=0 then raise exception 'Promotion patch does not match %',f.proname;end if;d:=replace(d,old_text,new_text);
old_text:=$old$v_derived_discount:=case when v_discount_type='percent' then round(v_calculated_subtotal*v_discount_value/100,2) else v_discount_value end;$old$;new_text:=$new$v_derived_discount:=case when v_discount_type='percent' then round(v_calculated_subtotal*v_discount_value/100,2) else v_discount_value end;
  if nullif(btrim(p_input->>'couponCode'),'') is not null then
    v_coupon_quote:=public.tenh_coupon_quote(p_business_id,v_branch,'pos',p_input->>'couponCode',v_promo_lines,v_customer);
    v_derived_discount:=(v_coupon_quote->>'discount')::numeric;
  end if;$new$;
old_text:=replace(old_text,E'\r\n',E'\n');
if position(old_text in d)=0 then raise exception 'Promotion patch does not match %',f.proname;end if;d:=replace(d,old_text,new_text);
old_text:=$old$  return v_receipt;$old$;new_text:=$new$  if v_coupon_quote is not null then
    insert into public.coupon_redemptions(business_id,coupon_id,order_id,customer_id,discount_amount)
    values(p_business_id,(v_coupon_quote->>'id')::uuid,v_order,v_customer,v_discount);
    update public.business_coupons set usage_count=usage_count+1,updated_at=now() where id=(v_coupon_quote->>'id')::uuid;
    v_receipt:=v_receipt||jsonb_build_object('couponCode',v_coupon_quote->>'code');
    update public.orders set coupon_id=(v_coupon_quote->>'id')::uuid,coupon_code=v_coupon_quote->>'code',coupon_discount=v_discount,
      pos_checkout=jsonb_set(pos_checkout,'{receipt}',v_receipt) where id=v_order;
  end if;
  return v_receipt;$new$;
old_text:=replace(old_text,E'\r\n',E'\n');
if position(old_text in d)=0 then raise exception 'Promotion patch does not match %',f.proname;end if;d:=replace(d,old_text,new_text);
end if;
 if f.proname='checkout_order_with_options' then
old_text:=$old$public.tenh_operating_product(v_product)$old$;new_text:=$new$public.tenh_pos_priced_product(v_product)$new$;
old_text:=replace(old_text,E'\r\n',E'\n');
if position(old_text in d)=0 then raise exception 'Promotion patch does not match %',f.proname;end if;d:=replace(d,old_text,new_text);
end if;
 if f.proname='place_online_order' then
old_text:=$old$v_coupon public.business_coupons%rowtype;$old$;new_text:=$new$v_coupon public.business_coupons%rowtype; v_coupon_quote jsonb;$new$;
old_text:=replace(old_text,E'\r\n',E'\n');
if position(old_text in d)=0 then raise exception 'Promotion patch does not match %',f.proname;end if;d:=replace(d,old_text,new_text);
old_text:=$old$    v_unit_price := round($old$;new_text:=$new$    v_product.selling_price:=public.tenh_product_sale_price(v_business.id,current_setting('tenh.online_branch')::uuid,'online',v_product.id,v_product.selling_price);
    v_unit_price := round($new$;
old_text:=replace(old_text,E'\r\n',E'\n');
if position(old_text in d)=0 then raise exception 'Promotion patch does not match %',f.proname;end if;d:=replace(d,old_text,new_text);
old_text:=$old$  if v_coupon_code is not null then
    if not coalesce(v_store.enable_coupons, true) then
      raise exception 'Coupons are not enabled for this store.';
    end if;

    select *
      into v_coupon
    from public.business_coupons
    where business_id = v_business.id
      and location_id = current_setting('tenh.online_branch')::uuid
      and upper(code) = v_coupon_code
      and is_active = true
      and (starts_at is null or starts_at <= now())
      and (ends_at is null or ends_at >= now())
    limit 1
    for update;

    if not found then
      raise exception 'This coupon is invalid or expired.';
    end if;

    if v_subtotal < coalesce(v_coupon.minimum_order, 0) then
      raise exception 'This coupon requires a minimum order of %.', v_coupon.minimum_order;
    end if;

    if v_coupon.usage_limit is not null
       and v_coupon.usage_count >= v_coupon.usage_limit then
      raise exception 'This coupon has reached its usage limit.';
    end if;

    if v_coupon.per_customer_limit is not null then
      select count(*)
        into v_customer_coupon_uses
      from public.coupon_redemptions
      where coupon_id = v_coupon.id
        and customer_id = v_customer_id;

      if v_customer_coupon_uses >= v_coupon.per_customer_limit then
        raise exception 'You have already used this coupon the maximum number of times.';
      end if;
    end if;

    if v_coupon.discount_type = 'percentage' then
      v_coupon_discount := round((v_subtotal * v_coupon.discount_value / 100)::numeric, 2);
    else
      v_coupon_discount := least(v_subtotal, v_coupon.discount_value);
    end if;

    if v_coupon.max_discount is not null then
      v_coupon_discount := least(v_coupon_discount, v_coupon.max_discount);
    end if;

    v_coupon_discount := greatest(0, least(v_coupon_discount, v_subtotal));
  end if;

$old$;new_text:=$new$  if v_coupon_code is not null then
    v_coupon_quote:=public.tenh_coupon_quote(v_business.id,current_setting('tenh.online_branch')::uuid,'online',v_coupon_code,v_computed_items,v_customer_id);
    select * into v_coupon from public.business_coupons where id=(v_coupon_quote->>'id')::uuid;
    v_coupon_discount:=(v_coupon_quote->>'discount')::numeric;
  end if;

$new$;
old_text:=replace(old_text,E'\r\n',E'\n');
if position(old_text in d)=0 then raise exception 'Promotion patch does not match %',f.proname;end if;d:=replace(d,old_text,new_text);
end if;
 if f.proname='tenh_choose_online_branch' then
old_text:=$old$and c.is_active and upper(c.code)$old$;new_text:=$new$and c.is_active and c.apply_online and not c.is_automatic and upper(c.code)$new$;
old_text:=replace(old_text,E'\r\n',E'\n');
if position(old_text in d)=0 then raise exception 'Promotion patch does not match %',f.proname;end if;d:=replace(d,old_text,new_text);
end if;
 if f.proname='sync_order_loyalty_points' then
old_text:=$old$  if new.status =$old$;new_text:=$new$  if coalesce(new.order_source,'pos') not in ('online','qr') then
    v_store:=jsonb_populate_record(v_store,coalesce((select to_jsonb(s) from public.branch_pos_settings s where s.business_id=new.business_id and s.location_id=new.location_id),'{"loyalty_enabled":false}'::jsonb));
  end if;

  if new.status =$new$;
old_text:=replace(old_text,E'\r\n',E'\n');
if position(old_text in d)=0 then raise exception 'Promotion patch does not match %',f.proname;end if;d:=replace(d,old_text,new_text);
old_text:=$old$greatest(coalesce(new.total, 0) - coalesce(new.delivery_fee, 0), 0)$old$;new_text:=$new$greatest(coalesce(new.subtotal, 0) - coalesce(new.discount, 0), 0)$new$;
old_text:=replace(old_text,E'\r\n',E'\n');
if position(old_text in d)=0 then raise exception 'Promotion patch does not match %',f.proname;end if;d:=replace(d,old_text,new_text);
end if;
d:=replace(d,'AS $function$',E'AS $function$\n-- TENH_PROMOTIONS_V1'); execute d;end loop;end $patch$;
do $guard$ declare d text; old_text text:=' if not exists(select 1 from orders where id=(v_result->>''orderId'')::uuid';begin
 d:=pg_get_functiondef('public.place_branch_online_order(text,jsonb)'::regprocedure);
 if position('TENH_PROMOTION_TOTAL_V1' in d)=0 then
  old_text:=replace(old_text,E'\r\n',E'\n');
if position(old_text in d)=0 then raise exception 'Online subtotal guard anchor missing';end if;
  d:=replace(d,old_text,$replacement$
 -- TENH_PROMOTION_TOTAL_V1
 if p_checkout->>'p_expected_subtotal' is not null and (p_checkout->>'p_expected_subtotal')::numeric is distinct from (v_result->>'subtotal')::numeric then
  raise exception 'Product prices or promotions changed. Refresh the store and review your cart.';
 end if;
 if not exists(select 1 from orders where id=(v_result->>'orderId')::uuid$replacement$);
 execute d;
 end if;
end $guard$;
notify pgrst,'reload schema';
commit;
