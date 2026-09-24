begin;

-- A checkout is fulfilled by one active branch; clients cannot choose its branch.
create or replace function public.tenh_choose_online_branch(p_business uuid, p_checkout jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_location uuid; v_table uuid := nullif(p_checkout->>'p_table_token','')::uuid;
begin
 if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Server access required.'; end if;
 if jsonb_typeof(p_checkout->'p_items') is distinct from 'array' then raise exception 'Your cart is empty.'; end if;
 if jsonb_array_length(p_checkout->'p_items') not between 1 and 100 then raise exception 'Choose between 1 and 100 cart items.'; end if;
 if exists(select 1 from jsonb_array_elements(p_checkout->'p_items') i where
   nullif(i->>'productId','') is null or coalesce((i->>'quantity')::numeric,0) not between 1 and 999
   or (i->>'quantity')::numeric <> trunc((i->>'quantity')::numeric)) then raise exception 'Invalid product quantity.'; end if;
 select l.id into v_location from business_locations l
 where l.business_id=p_business and l.is_active and not coalesce(l.plan_disable_pending,false)
 -- Table records have no individual branch: preserve their existing fulfilment branch.
 and (v_table is null or (l.id=coalesce((select fulfillment_location_id from business_storefronts where business_id=p_business),(select id from business_locations where business_id=p_business and is_default and is_active limit 1))
   and exists(select 1 from business_tables t where t.business_id=p_business and t.public_token=v_table and t.is_active)))
 and (nullif(p_checkout->>'p_coupon_code','') is null or exists(select 1 from business_coupons c where c.business_id=p_business and c.location_id=l.id and c.is_active and upper(c.code)=upper(p_checkout->>'p_coupon_code')))
 and not exists (
   select 1 from (select (i->>'productId')::uuid id,sum((i->>'quantity')::numeric) quantity from jsonb_array_elements(p_checkout->'p_items') i group by 1) cart
   left join products p on p.id=cart.id and p.business_id=p_business
   left join product_location_stock s on s.product_id=p.id and s.location_id=l.id and s.business_id=p_business
   where p.id is null or not coalesce(p.is_active,false) or not coalesce(p.is_online,false)
   or s.product_id is null or cart.quantity>least(coalesce(s.quantity,0),coalesce(p.stock_quantity,0))
   or cart.quantity>999
   or (p.category_id is not null and not exists(select 1 from categories c where c.id=p.category_id and c.business_id=p_business and c.is_online and (c.branch_ids is null or l.id=any(c.branch_ids))))
 )
 order by l.is_default desc,l.id limit 1;
 if v_location is null then raise exception 'No branch can fulfil this cart together. Order these items separately or contact the store.'; end if;
 return v_location;
end $$;
revoke all on function public.tenh_choose_online_branch(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.tenh_choose_online_branch(uuid,jsonb) to service_role;

create or replace function public.place_branch_online_order(p_business_slug text,p_checkout jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_business uuid; v_location uuid; r record; v_stock integer; v_global integer; v_reserved jsonb:='[]'; v_result jsonb; v_store record;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Server access required.'; end if;
 select id into v_business from businesses where slug=p_business_slug and is_active for update;
 if v_business is null then raise exception 'Store not found.'; end if;
 -- Share-lock the status through commit so a saved closure cannot race a new order.
 select is_published,accept_online_orders into v_store from business_storefronts where business_id=v_business for share;
 if not found or not coalesce(v_store.is_published,false) then raise exception 'This online store is not published.'; end if;
 if not coalesce(v_store.accept_online_orders,false) then raise exception 'This store is not accepting online orders right now.'; end if;
 if jsonb_typeof(p_checkout->'p_items') is distinct from 'array' then raise exception 'Your cart is empty.'; end if;
 if jsonb_array_length(p_checkout->'p_items') not between 1 and 100 then raise exception 'Choose between 1 and 100 cart items.'; end if;
 -- Match the stock writers' product lock ordering before choosing a branch.
 perform 1 from products p where p.business_id=v_business and p.id in
   (select (i->>'productId')::uuid from jsonb_array_elements(p_checkout->'p_items') i) order by p.id for update;
 v_location:=public.tenh_choose_online_branch(v_business,p_checkout);
 perform public.tenh_assert_plan_branch(v_business,v_location);
 for r in select (i->>'productId')::uuid product_id,sum((i->>'quantity')::integer)::integer quantity from jsonb_array_elements(p_checkout->'p_items') i group by 1 order by 1 loop
  select stock_quantity into v_global from products where id=r.product_id and business_id=v_business;
  select quantity into v_stock from product_location_stock where product_id=r.product_id and location_id=v_location and business_id=v_business for update;
  if not found or r.quantity>least(v_global,v_stock) then raise exception 'Stock changed. Review your cart and try again.'; end if;
  v_reserved:=v_reserved||jsonb_build_object('id',r.product_id,'after',v_stock-r.quantity);
 end loop;
 perform set_config('tenh.online_branch',v_location::text,true);
 v_result:=public.place_online_order(p_business_slug=>p_business_slug,p_items=>p_checkout->'p_items',p_fulfillment_type=>p_checkout->>'p_fulfillment_type',p_guest_name=>p_checkout->>'p_guest_name',p_guest_phone=>p_checkout->>'p_guest_phone',p_guest_address=>p_checkout->>'p_guest_address',p_customer_note=>p_checkout->>'p_customer_note',p_table_token=>(p_checkout->>'p_table_token')::uuid,p_payment_method=>p_checkout->>'p_payment_method',p_payment_reference=>p_checkout->>'p_payment_reference',p_delivery_zone_id=>(p_checkout->>'p_delivery_zone_id')::uuid,p_requested_for=>(p_checkout->>'p_requested_for')::timestamptz,p_coupon_code=>p_checkout->>'p_coupon_code');
 if not exists(select 1 from orders where id=(v_result->>'orderId')::uuid and business_id=v_business and location_id=v_location) then raise exception 'Order fulfillment branch could not be verified.'; end if;
 perform set_config('tenh.online_branch','',true);
 for r in select value as item from jsonb_array_elements(v_reserved) loop
  update product_location_stock set quantity=(r.item->>'after')::integer,updated_at=now() where business_id=v_business and location_id=v_location and product_id=(r.item->>'id')::uuid;
 end loop;
 return v_result;
end $$;
revoke all on function public.place_branch_online_order(text,jsonb) from public,anon,authenticated;
grant execute on function public.place_branch_online_order(text,jsonb) to service_role;

-- Keep the existing checkout calculation and validation. Scope its CRM lookup and
-- new customer to the branch chosen above, preserving customers at other branches.
do $migration$
declare definition text; patched text;
begin
 select pg_get_functiondef(oid) into definition from pg_proc where pronamespace='public'::regnamespace and proname='place_online_order';
 definition:=replace(definition,chr(13),'');
 patched:=replace(definition, E'begin\n  if p_business_slug', E'begin\n  if coalesce(auth.role(),'''')<>''service_role'' or nullif(current_setting(''tenh.online_branch'',true),'''') is null then raise exception ''Use the store checkout.''; end if;\n  if p_business_slug');
 patched:=replace(patched, E'where business_id = v_business.id\n    and regexp_replace', E'where business_id = v_business.id\n    and location_id = current_setting(''tenh.online_branch'')::uuid\n    and regexp_replace');
 patched:=replace(patched, E'where business_id = v_business.id\n      and upper(code)', E'where business_id = v_business.id\n      and location_id = current_setting(''tenh.online_branch'')::uuid\n      and upper(code)');
 patched:=replace(patched, E'insert into public.customers (\n      owner_id,', E'insert into public.customers (\n      location_id,\n      owner_id,');
 patched:=replace(patched, E'values (\n      v_business.owner_id,', E'values (\n      current_setting(''tenh.online_branch'')::uuid,\n      v_business.owner_id,');
 if patched=definition or position('Use the store checkout.' in patched)=0 or position('location_id = current_setting' in patched)=0 then raise exception 'Checkout function changed; review migration before applying.'; end if;
 execute patched;
end $migration$;

commit;
