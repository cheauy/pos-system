begin;

alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('new','pending','in_progress','completed','cancelled','refunded'));

-- Keep the existing permission, subscription, version, payment and audit guards.
-- Refuse to patch a different function body rather than silently weaken them.
do $$
declare source text;
begin
  source := pg_get_functiondef('public.tenh_manage_order(uuid,uuid,timestamptz,text,jsonb)'::regprocedure);
  if position('v_order.status::text=''new'' and v_next in (''pending'',''completed'')' in source)=0
    or position('v_order.status::text=''pending'' and v_next=''completed''' in source)=0
    or position('v_order.online_status=''preparing'' and v_next=''ready''' in source)=0 then
    raise exception 'Order status procedure changed; review this migration before applying.';
  end if;
  source := replace(source,'v_order.status::text=''new'' and v_next in (''pending'',''completed'')',
    'v_order.status::text=''new'' and v_next=''pending''');
  source := replace(source,'v_order.status::text=''pending'' and v_next=''completed''',
    'v_order.status::text=''pending'' and v_next=''in_progress'') or (v_order.status::text=''in_progress'' and v_next=''completed''');
  source := replace(source,'v_order.online_status=''preparing'' and v_next=''ready''',
    'v_order.online_status=''preparing'' and v_next in (''ready'',''completed'')');
  source := replace(source,'v_order.status::text in (''new'',''pending'')',
    'v_order.status::text in (''new'',''pending'',''in_progress'')');
  source := replace(source,'v_order.status::text not in (''new'',''pending'',''cancelled'')',
    'v_order.status::text not in (''new'',''pending'',''in_progress'',''cancelled'')');
  execute source;

  source := pg_get_functiondef('public.cancel_order(uuid,text)'::regprocedure);
  if source !~ $rx$'new'\s*,\s*'pending'\s*,\s*'completed'$rx$ then
    raise exception 'Cancel order procedure changed; review this migration before applying.';
  end if;
  source := regexp_replace(source,$rx$'new'\s*,\s*'pending'\s*,\s*'completed'$rx$,
    $rx$'new', 'pending', 'in_progress', 'completed'$rx$);
  execute source;

  source := pg_get_functiondef('public.tenh_orders_workspace(uuid,jsonb)'::regprocedure);
  if position('''all'',''new'',''pending'',''completed'',''cancelled'',''refunded''' in source)=0
    or position('case when returned.order_id is not null then ''refunded'' else o.status::text end as status' in source)=0
    or position('''pending'',count(*) filter(where status=''pending'')' in source)=0 then
    raise exception 'Order list procedure changed; review this migration before applying.';
  end if;
  source := replace(source,'''all'',''new'',''pending'',''completed'',''cancelled'',''refunded''',
    '''all'',''new'',''pending'',''in_progress'',''completed'',''cancelled'',''refunded''');
  source := replace(source,
    'case when returned.order_id is not null then ''refunded'' else o.status::text end as status',
    'case when returned.order_id is not null then ''refunded'' when o.status::text=''pending'' and o.order_source in (''online'',''qr'') and o.online_status in (''preparing'',''ready'') then ''in_progress'' else o.status::text end as status');
  source := replace(source,'''pending'',count(*) filter(where status=''pending'')',
    '''pending'',count(*) filter(where status=''pending''),''in_progress'',count(*) filter(where status=''in_progress'')');
  source := replace(source,'status in (''new'',''pending'')',
    'status in (''new'',''pending'',''in_progress'')');
  execute source;
end $$;

create or replace function public.tenh_cancel_order_item(
  p_business_id uuid, p_order_id uuid, p_item_id uuid,
  p_expected_updated_at timestamptz, p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  sale public.orders%rowtype;
  line public.order_items%rowtype;
  product public.products%rowtype;
  before_stock integer;
  remaining integer;
  reason text := nullif(btrim(p_reason),'');
begin
  perform public.tenh_assert_effective_permission(p_business_id,'orders.cancel');
  if reason is null or length(reason)>500 then raise exception 'Enter a cancellation reason (1–500 characters).'; end if;
  select location_id into sale.location_id from public.orders where id=p_order_id and business_id=p_business_id;
  if sale.location_id is null or public.tenh_request_branch(p_business_id) is distinct from sale.location_id then
    raise exception 'Switch to the order branch before cancelling an item.' using errcode='42501';
  end if;
  perform public.tenh_lock_checkout_branch(p_business_id,sale.location_id);
  select * into sale from public.orders where id=p_order_id and business_id=p_business_id for update;
  if not found or sale.archived_at is not null then raise exception 'Order not found.'; end if;
  if sale.updated_at is distinct from p_expected_updated_at then
    raise exception 'This order changed. Refresh before cancelling an item.' using errcode='40001';
  end if;
  if sale.order_source not in ('online','qr') or sale.status not in ('new','pending','in_progress')
    or sale.pos_checkout is not null or sale.amount_paid<>0 or sale.change_amount<>0
    or sale.payment_status in ('paid','refunded','pending_verification')
    or nullif(sale.payment_reference,'') is not null or sale.payment_method='credit'
    or coalesce(sale.credit_amount,0)<>0 or coalesce(sale.loyalty_points_earned,0)<>0
    or coalesce(sale.discount,0)<>0 or coalesce(sale.coupon_discount,0)<>0
    or sale.coupon_id is not null or sale.remaining_balance is distinct from sale.total
    or sale.total is distinct from sale.subtotal+coalesce(sale.delivery_fee,0)
    or exists(select 1 from public.returns where order_id=sale.id and business_id=p_business_id) then
    raise exception 'This order has payment or pricing history. Use Return items / check refund, or cancel the whole unpaid order.';
  end if;
  select * into line from public.order_items where id=p_item_id and order_id=p_order_id for update;
  if not found then raise exception 'This item was already removed. Refresh the order.'; end if;
  if line.product_id is null then raise exception 'This item needs manual review before stock can be restored.'; end if;
  select * into product from public.products where id=line.product_id and business_id=p_business_id for update;
  if not found or product.product_type='bundle' then
    raise exception 'Bundle or unavailable product stock needs a full order cancellation.';
  end if;
  select count(*) into remaining from public.order_items where order_id=p_order_id;
  if remaining=1 then
    perform public.tenh_run_branch_stock(p_business_id,'cancel_order',
      jsonb_build_object('p_order_id',p_order_id,'p_reason',reason));
    update public.orders set online_status='rejected',updated_at=clock_timestamp() where id=p_order_id;
  else
    select quantity into before_stock from public.product_location_stock
      where business_id=p_business_id and location_id=sale.location_id and product_id=line.product_id for update;
    if not found then raise exception 'Branch stock is unavailable; nothing was cancelled.'; end if;
    update public.products set stock_quantity=stock_quantity+line.quantity,updated_at=clock_timestamp()
      where id=line.product_id and business_id=p_business_id;
    update public.product_location_stock set quantity=quantity+line.quantity,updated_at=clock_timestamp()
      where business_id=p_business_id and location_id=sale.location_id and product_id=line.product_id;
    insert into public.inventory_movements(business_id,owner_id,product_id,order_id,movement_type,quantity,stock_before,stock_after,note)
      values(p_business_id,auth.uid(),line.product_id,p_order_id,'order_cancelled',line.quantity,before_stock,before_stock+line.quantity,
        'Item cancelled: '||reason);
    delete from public.order_items where id=line.id and order_id=p_order_id;
    update public.orders set subtotal=subtotal-line.subtotal,total=total-line.subtotal,
      remaining_balance=remaining_balance-line.subtotal,updated_at=clock_timestamp() where id=p_order_id;
  end if;
  insert into public.audit_logs(business_id,user_id,action,entity_type,entity_id,description,metadata)
    values(p_business_id,auth.uid(),'cancel','order',p_order_id,
      'Cancelled item '||line.product_name||' on order '||sale.order_number,
      jsonb_build_object('itemId',line.id,'productId',line.product_id,'quantity',line.quantity,
        'subtotal',line.subtotal,'reason',reason,'wholeOrder',remaining=1));
  return jsonb_build_object('orderId',p_order_id,'itemId',p_item_id,'wholeOrder',remaining=1);
end $$;
revoke all on function public.tenh_cancel_order_item(uuid,uuid,uuid,timestamptz,text) from public,anon;
grant execute on function public.tenh_cancel_order_item(uuid,uuid,uuid,timestamptz,text) to authenticated;

notify pgrst, 'reload schema';
commit;
