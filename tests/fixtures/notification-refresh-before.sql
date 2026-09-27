CREATE OR REPLACE FUNCTION public.refresh_business_notifications(p_business_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text;
begin
  select bm.role::text into v_role
  from public.business_members bm
  where bm.business_id = p_business_id
    and bm.user_id = auth.uid()
    and bm.is_active = true
  limit 1;

  if v_role is null then
    raise exception 'Not authorized for this business.';
  end if;

  update public.business_notifications
  set is_active = false, updated_at = now()
  where business_id = p_business_id
    and notification_type in (
      'new_order','khqr_pending','low_stock','purchase_order','stock_transfer',
      'register_variance','credit_overdue','scheduled_order'
    );

  insert into public.business_notifications (
    business_id, notification_key, notification_type, severity, title, message,
    href, target_roles, source_table, source_id, occurred_at, is_active, metadata, updated_at
  )
  select
    o.business_id,
    'new-order:' || o.id::text,
    'new_order',
    'info',
    'New online order',
    coalesce(o.order_number, 'Order') || coalesce(' · ' || nullif(o.guest_name,''), ''),
    '/dashboard/orders/' || o.id::text,
    coalesce((select rs.target_roles from public.branch_notification_role_settings rs where rs.business_id=o.business_id and rs.location_id=o.location_id and rs.notification_type='new_order'), array['owner','admin','manager','cashier']::text[]),
    'orders', o.id, o.created_at, true,
    jsonb_build_object('branch_id',o.location_id,'order_number',o.order_number,'source',o.order_source), now()
  from public.orders o
  where o.business_id = p_business_id
    and o.order_source in ('online','qr')
    and coalesce(o.online_status,'new') = 'new'
    and o.created_at >= now() - interval '7 days'
  on conflict (business_id, notification_key) do update set
    title=excluded.title,message=excluded.message,href=excluded.href,
    severity=excluded.severity,target_roles=excluded.target_roles,
    occurred_at=excluded.occurred_at,is_active=true,metadata=excluded.metadata,updated_at=now();

  insert into public.business_notifications (
    business_id, notification_key, notification_type, severity, title, message,
    href, target_roles, source_table, source_id, occurred_at, is_active, metadata, updated_at
  )
  select
    o.business_id,
    'khqr:' || o.id::text,
    'khqr_pending','warning','KHQR payment needs verification',
    coalesce(o.order_number,'Order') || coalesce(' · Ref ' || nullif(o.payment_reference,''),''),
    '/dashboard/orders/' || o.id::text,
    coalesce((select rs.target_roles from public.branch_notification_role_settings rs where rs.business_id=o.business_id and rs.location_id=o.location_id and rs.notification_type='khqr_pending'), array['owner','admin','manager','cashier']::text[]),
    'orders',o.id,o.created_at,true,
    jsonb_build_object('branch_id',o.location_id,'payment_reference',o.payment_reference),now()
  from public.orders o
  where o.business_id=p_business_id and o.payment_status='pending_verification'
  on conflict (business_id, notification_key) do update set
    message=excluded.message,href=excluded.href,occurred_at=excluded.occurred_at,target_roles=excluded.target_roles,
    is_active=true,metadata=excluded.metadata,updated_at=now();

  insert into public.business_notifications (
    business_id, notification_key, notification_type, severity, title, message,
    href, target_roles, source_table, source_id, occurred_at, is_active, metadata, updated_at
  )
  select
    p.business_id,'low-stock:'||p.id::text||':'||p.location_id::text,'low_stock','warning','Low stock',
    p.name || ' · ' || greatest(coalesce(p.stock_quantity,0),0)::text || ' left',
    '/dashboard/inventory',coalesce((select rs.target_roles from public.branch_notification_role_settings rs where rs.business_id=p.business_id and rs.location_id=p.location_id and rs.notification_type='low_stock'), array['owner','admin','manager']::text[]),
    'products',p.id,now(),true,
    jsonb_build_object('branch_id',p.location_id,'stock',coalesce(p.stock_quantity,0),'threshold',coalesce(p.low_stock_quantity,0)),now()
  from (select d.id,d.business_id,d.name,d.is_active,d.low_stock_quantity,s.quantity stock_quantity,d.location_id from public.branch_product_details d join public.product_location_stock s on s.product_id=d.id and s.business_id=d.business_id and s.location_id=d.location_id where not d.branch_archived) p
  where p.business_id=p_business_id and p.is_active=true
    and coalesce(p.stock_quantity,0) <= coalesce(p.low_stock_quantity,0)
  on conflict (business_id, notification_key) do update set
    message=excluded.message,target_roles=excluded.target_roles,is_active=true,metadata=excluded.metadata,updated_at=now();

  insert into public.business_notifications (
    business_id, notification_key, notification_type, severity, title, message,
    href, target_roles, source_table, source_id, occurred_at, is_active, metadata, updated_at
  )
  select po.business_id,'po:'||po.id::text,'purchase_order','info','Purchase order awaiting receipt',
    po.po_number || ' · ' || initcap(po.status),
    '/dashboard/purchase-orders/'||po.id::text,coalesce((select rs.target_roles from public.branch_notification_role_settings rs where rs.business_id=po.business_id and rs.location_id=po.location_id and rs.notification_type='purchase_order'), array['owner','admin','manager']::text[]),
    'purchase_orders',po.id,po.updated_at,true,jsonb_build_object('branch_id',po.location_id,'status',po.status),now()
  from public.purchase_orders po
  where po.business_id=p_business_id and po.status in ('sent','partial')
  on conflict (business_id, notification_key) do update set
    message=excluded.message,target_roles=excluded.target_roles,is_active=true,occurred_at=excluded.occurred_at,metadata=excluded.metadata,updated_at=now();

  insert into public.business_notifications (
    business_id, notification_key, notification_type, severity, title, message,
    href, target_roles, source_table, source_id, occurred_at, is_active, metadata, updated_at
  )
  select st.business_id,'transfer:'||st.id::text,'stock_transfer','info','Stock transfer in transit',
    st.transfer_number,
    '/dashboard/stock-transfers',coalesce((select rs.target_roles from public.branch_notification_role_settings rs where rs.business_id=st.business_id and rs.location_id=st.destination_location_id and rs.notification_type='stock_transfer'), array['owner','admin','manager']::text[]),
    'stock_transfers',st.id,coalesce(st.sent_at,st.updated_at),true,jsonb_build_object('branch_id',st.destination_location_id,'status',st.status),now()
  from public.stock_transfers st
  where st.business_id=p_business_id and st.status='in_transit'
  on conflict (business_id, notification_key) do update set
    message=excluded.message,target_roles=excluded.target_roles,is_active=true,occurred_at=excluded.occurred_at,updated_at=now();

  insert into public.business_notifications (
    business_id, notification_key, notification_type, severity, title, message,
    href, target_roles, source_table, source_id, occurred_at, is_active, metadata, updated_at
  )
  select s.business_id,'register-variance:'||s.id::text,'register_variance','critical','Register variance',
    'Closed shift variance: ' || coalesce(s.variance,0)::text,
    '/dashboard/register',coalesce((select rs.target_roles from public.branch_notification_role_settings rs where rs.business_id=s.business_id and rs.location_id=s.location_id and rs.notification_type='register_variance'), array['owner','admin','manager']::text[]),
    'cash_register_shifts',s.id,coalesce(s.closed_at,s.opened_at),true,
    jsonb_build_object('branch_id',s.location_id,'variance',s.variance),now()
  from public.cash_register_shifts s
  where s.business_id=p_business_id and s.status='closed'
    and abs(coalesce(s.variance,0)) > 0.009
    and coalesce(s.closed_at,s.opened_at) >= now()-interval '7 days'
  on conflict (business_id, notification_key) do update set
    message=excluded.message,target_roles=excluded.target_roles,is_active=true,occurred_at=excluded.occurred_at,metadata=excluded.metadata,updated_at=now();

  insert into public.business_notifications (
    business_id, notification_key, notification_type, severity, title, message,
    href, target_roles, source_table, source_id, occurred_at, is_active, metadata, updated_at
  )
  select a.business_id,'credit-overdue:'||a.customer_id::text,'credit_overdue','critical','Customer credit overdue',
    coalesce(c.name,'Customer') || ' · Balance ' || a.balance::text,
    '/dashboard/customers/'||a.customer_id::text,coalesce((select rs.target_roles from public.branch_notification_role_settings rs where rs.business_id=a.business_id and rs.location_id=c.location_id and rs.notification_type='credit_overdue'), array['owner','admin','manager']::text[]),
    'customer_credit_accounts',a.customer_id,now(),true,
    jsonb_build_object('branch_id',c.location_id,'balance',a.balance,'due_date',a.payment_due_date),now()
  from public.customer_credit_accounts a
  join public.customers c on c.id=a.customer_id and c.business_id=a.business_id
  where a.business_id=p_business_id and a.balance>0
    and a.payment_due_date is not null and a.payment_due_date < current_date
  on conflict (business_id, notification_key) do update set
    message=excluded.message,target_roles=excluded.target_roles,is_active=true,metadata=excluded.metadata,updated_at=now();

  insert into public.business_notifications (
    business_id, notification_key, notification_type, severity, title, message,
    href, target_roles, source_table, source_id, occurred_at, is_active, metadata, updated_at
  )
  select o.business_id,'scheduled:'||o.id::text,'scheduled_order','warning','Scheduled order coming up',
    coalesce(o.order_number,'Order') || ' · ' || to_char(o.requested_for,'Mon DD HH24:MI'),
    '/dashboard/orders/'||o.id::text,coalesce((select rs.target_roles from public.branch_notification_role_settings rs where rs.business_id=o.business_id and rs.location_id=o.location_id and rs.notification_type='scheduled_order'), array['owner','admin','manager','cashier']::text[]),
    'orders',o.id,o.requested_for,true,jsonb_build_object('branch_id',o.location_id,'requested_for',o.requested_for),now()
  from public.orders o
  where o.business_id=p_business_id and o.requested_for between now() and now()+interval '2 hours'
    and coalesce(o.online_status,'new') not in ('completed','rejected')
  on conflict (business_id, notification_key) do update set
    message=excluded.message,target_roles=excluded.target_roles,is_active=true,occurred_at=excluded.occurred_at,metadata=excluded.metadata,updated_at=now();
end;
$function$

