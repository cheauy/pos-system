CREATE OR REPLACE FUNCTION public.assign_pos_order_to_location(p_business_id uuid, p_order_id uuid, p_location_id uuid, p_shift_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_item record; v_role text; v_shift public.cash_register_shifts%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select bm.role::text into v_role from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid() and bm.is_active=true limit 1;
  if v_role is null then raise exception 'Not authorized for this business.'; end if;
  if not exists(select 1 from public.business_locations where id=p_location_id and business_id=p_business_id and is_active=true) then raise exception 'Branch not found.'; end if;
  if not exists(select 1 from public.orders where id=p_order_id and business_id=p_business_id) then raise exception 'Order not found.'; end if;
  if p_shift_id is not null then
    select * into v_shift from public.cash_register_shifts where id=p_shift_id and business_id=p_business_id and location_id=p_location_id and status='open';
    if not found then raise exception 'Open register shift does not match this branch.'; end if;
    if v_role='cashier' and v_shift.opened_by<>auth.uid() then raise exception 'Cashier shift mismatch.'; end if;
  end if;
  update public.orders set location_id=p_location_id,register_shift_id=p_shift_id where id=p_order_id and business_id=p_business_id;
  for v_item in select oi.product_id,sum(oi.quantity)::integer qty from public.order_items oi join public.products p on p.id=oi.product_id and p.business_id=p_business_id where oi.order_id=p_order_id and oi.product_id is not null group by oi.product_id loop
    insert into public.product_location_stock(business_id,location_id,product_id,quantity) values(p_business_id,p_location_id,v_item.product_id,0) on conflict(location_id,product_id) do nothing;
    update public.product_location_stock set quantity=greatest(0,quantity-v_item.qty),updated_at=now() where business_id=p_business_id and location_id=p_location_id and product_id=v_item.product_id;
  end loop;
end;
$function$
