begin;
create table if not exists public.online_order_preferences (
 business_id uuid not null references public.businesses(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 receive_all_branches boolean not null default false,
 primary key(business_id,user_id)
);
alter table public.online_order_preferences enable row level security;
revoke all on public.online_order_preferences from public,anon,authenticated;

create or replace function public.tenh_receive_all_online_orders(p_business uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.tenh_user_permission_allowed(p_business,auth.uid(),'orders.view') and coalesce((select receive_all_branches from public.online_order_preferences where business_id=p_business and user_id=auth.uid()),false)
$$;
create or replace function public.tenh_set_online_order_scope(p_business uuid,p_all boolean) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform public.tenh_assert_effective_permission(p_business,'orders.view');
 perform public.tenh_request_branch(p_business);
 if p_all is null then raise exception 'Choose an order scope.';end if;
 insert into public.online_order_preferences(business_id,user_id,receive_all_branches) values(p_business,auth.uid(),p_all)
 on conflict(business_id,user_id) do update set receive_all_branches=excluded.receive_all_branches;
 return p_all;
end$$;

create or replace function public.tenh_incoming_online_orders(p_business uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b uuid; receive_all boolean; result jsonb;
begin
 perform public.tenh_assert_effective_permission(p_business,'orders.view');
 b:=public.tenh_request_branch(p_business);
 if b is null then raise exception 'Choose an operating branch.';end if;
 receive_all:=public.tenh_receive_all_online_orders(p_business);
 select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]'::jsonb) into result from (
 select o.id,o.order_number,o.order_source,o.location_id,l.name branch_name,o.fulfillment_type,o.online_status,
 o.guest_name,o.guest_phone,o.guest_address,o.customer_note,o.table_name,o.delivery_zone_name,o.requested_for,
 o.payment_method,o.payment_status,o.payment_reference,o.subtotal,o.discount,o.coupon_code,o.loyalty_points_earned,o.delivery_fee,o.total,o.created_at,
 (select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'product_name',i.product_name,'quantity',i.quantity,'unit_price',i.unit_price,
 'variant_label',i.variant_label,'selected_options',i.selected_options,'image_url',coalesce(p.variant_image_url,p.image_url)) order by i.id),'[]'::jsonb)
 from public.order_items i left join public.products p on p.id=i.product_id and p.business_id=o.business_id where i.order_id=o.id) order_items
 from public.orders o join public.business_locations l on l.id=o.location_id and l.business_id=o.business_id
 where o.business_id=p_business and l.is_active and not l.plan_disable_pending and
 ((o.location_id=b and o.order_source in ('online','qr')) or (receive_all and o.order_source='online'))
 order by o.created_at desc,o.id desc limit 100
 ) q;
 return jsonb_build_object('receiveAll',receive_all,'orders',result);
end$$;

CREATE OR REPLACE FUNCTION public.tenh_request_branch(p_business uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  h jsonb:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  requested uuid;
  membership_role text;
  assigned uuid;
  header_business uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in again.' USING ERRCODE='42501';
  END IF;

  SELECT m.role::text,m.default_location_id
    INTO membership_role,assigned
  FROM public.business_members m
  WHERE m.business_id=p_business
    AND m.user_id=auth.uid()
    AND m.is_active=true
    AND coalesce(m.team_password_required,false)=false
  LIMIT 1;

  IF membership_role IS NULL THEN
    RAISE EXCEPTION 'Business access is unavailable.' USING ERRCODE='42501';
  END IF;

  IF nullif(h->>'x-tenh-business-id','') IS NOT NULL THEN
    BEGIN
      header_business:=(h->>'x-tenh-business-id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid business context.' USING ERRCODE='42501';
    END;
    IF header_business IS DISTINCT FROM p_business THEN
      RAISE EXCEPTION 'Invalid business context.' USING ERRCODE='42501';
    END IF;
  END IF;

  IF nullif(h->>'x-tenh-branch-id','') IS NOT NULL THEN
    BEGIN
      requested:=(h->>'x-tenh-branch-id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Invalid operating branch.' USING ERRCODE='42501';
    END;
  END IF;

  -- Set only inside the checked online-order action; never accepted from HTTP headers.
  IF nullif(current_setting('tenh.online_order_scope',true),'') IS NOT NULL THEN
    SELECT o.location_id INTO requested FROM public.orders o
    JOIN public.business_locations l ON l.id=o.location_id AND l.business_id=o.business_id AND l.is_active AND NOT l.plan_disable_pending
    WHERE o.id=current_setting('tenh.online_order_scope')::uuid AND o.business_id=p_business AND o.order_source='online'
      AND public.tenh_receive_all_online_orders(p_business)
      AND public.tenh_user_permission_allowed(p_business,auth.uid(),'orders.view');
    IF requested IS NULL THEN RAISE EXCEPTION 'Online order access is unavailable.' USING ERRCODE='42501'; END IF;
    RETURN requested;
  END IF;

  IF membership_role='owner' THEN
    IF requested IS NULL THEN RETURN NULL; END IF;
    IF NOT EXISTS(
      SELECT 1 FROM public.business_locations l
      WHERE l.id=requested AND l.business_id=p_business AND l.is_active=true
    ) THEN
      RAISE EXCEPTION 'Invalid operating branch.' USING ERRCODE='42501';
    END IF;
    RETURN requested;
  END IF;

  IF assigned IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.business_locations l
    WHERE l.id=assigned AND l.business_id=p_business AND l.is_active=true
  ) THEN
    RAISE EXCEPTION 'Your assigned branch is unavailable. Ask the Owner to assign an active branch.' USING ERRCODE='42501';
  END IF;

  IF requested IS NOT NULL AND requested IS DISTINCT FROM assigned THEN
    RAISE EXCEPTION 'This branch is not assigned to your account.' USING ERRCODE='42501';
  END IF;
  RETURN assigned;
END;
$function$
;

create or replace function public.tenh_incoming_order_action(p_business uuid,p_order uuid,p_action text,p_status text,p_expected text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid; target public.orders%rowtype; result jsonb;
begin
 perform public.tenh_assert_effective_permission(p_business,'orders.view');
 perform public.tenh_assert_effective_permission(p_business,case when p_action='status' and p_status='rejected' then 'orders.cancel' else 'orders.update' end);
 b:=public.tenh_request_branch(p_business);
 select * into target from public.orders where id=p_order and business_id=p_business and order_source in ('online','qr');
 if not found or b is null then raise exception 'Online order not found.';end if;
 if target.location_id is distinct from b then
   if target.order_source <> 'online' or not public.tenh_receive_all_online_orders(p_business) then raise exception 'This order belongs to another branch.' using errcode='42501';end if;
   perform set_config('tenh.online_order_scope',p_order::text,true);
 end if;
 perform public.tenh_lock_checkout_branch(p_business,target.location_id);
 if exists(select 1 from public.business_locations where id=target.location_id and plan_disable_pending) then raise exception 'This branch is closing.';end if;
 if p_action='status' then
   result:=public.tenh_update_online_order_status(p_business,p_order,p_status,p_expected);
 elsif p_action='payment' then
   select * into target from public.orders where id=p_order and business_id=p_business for update;
   if p_status is null or p_status not in ('pending_verification','paid','unpaid') or target.payment_method<>'khqr' then raise exception 'Invalid KHQR payment status.';end if;
   if target.status in ('cancelled','refunded') then raise exception 'A cancelled or returned order cannot be marked paid.';end if;
   if target.payment_status is distinct from p_status then
     if target.payment_status is distinct from p_expected then raise exception 'Payment changed. Refresh before updating.';end if;
     if target.payment_status='paid' then raise exception 'Use the refund workflow to reverse a recorded payment.';end if;
     update public.orders set payment_status=p_status,amount_paid=case when p_status='paid' then total else 0 end,
       remaining_balance=case when p_status='paid' then 0 else total end,change_amount=0,updated_at=now()
       where id=p_order and business_id=p_business;
   end if;
   result:=jsonb_build_object('orderId',p_order,'paymentStatus',p_status);
 else raise exception 'Invalid order action.';end if;
 perform set_config('tenh.online_order_scope','',true);
 return result;
end$$;

revoke all on function public.tenh_receive_all_online_orders(uuid),public.tenh_set_online_order_scope(uuid,boolean),public.tenh_incoming_online_orders(uuid),public.tenh_incoming_order_action(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.tenh_receive_all_online_orders(uuid),public.tenh_set_online_order_scope(uuid,boolean),public.tenh_incoming_online_orders(uuid),public.tenh_incoming_order_action(uuid,uuid,text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
