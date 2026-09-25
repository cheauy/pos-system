begin;

-- A failed apply rolls back the entire legacy operation, including order creation.
create or replace function public.apply_business_changes_with_credits(
  p_business_id uuid, p_requesting_user_id uuid, p_old_slug text, p_requested_slug text,
  p_old_business_type text, p_requested_business_type text, p_old_product_mode text,
  p_requested_product_mode text, p_change_url boolean, p_change_business_mode boolean
) returns table(order_id uuid, order_status text, total_amount numeric, included_url_change boolean, included_business_mode_change boolean)
language plpgsql security definer set search_path=public as $$
declare result record;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Server action required.'; end if;
  select * into result from public.create_business_change_order_with_entitlement(
    p_business_id,p_requesting_user_id,p_old_slug,p_requested_slug,p_old_business_type,
    p_requested_business_type,p_old_product_mode,p_requested_product_mode,p_change_url,p_change_business_mode
  );
  if result.order_status is distinct from 'applied' or result.total_amount is distinct from 0::numeric then
    raise exception 'Not enough credits. Buy the required credits, then apply your changes.';
  end if;
  return query select result.order_id,result.order_status,result.total_amount,result.included_url_change,result.included_business_mode_change;
end;$$;

-- Buying a credit never changes settings or consumes an existing allowance.
create or replace function public.buy_business_change_credit(p_business_id uuid,p_requesting_user_id uuid,p_credit_type text)
returns uuid language plpgsql security definer set search_path=public as $$
declare b public.businesses%rowtype; business_type text; checkout_id uuid;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Server action required.'; end if;
  if p_credit_type is null or p_credit_type not in ('url','mode') then raise exception 'Select a valid credit type.'; end if;
  if not exists(select 1 from public.business_members where business_id=p_business_id and user_id=p_requesting_user_id and role='owner' and is_active=true) then
    raise exception 'Only the business owner can buy credits.';
  end if;
  select * into b from public.businesses where id=p_business_id for update;
  if not found then raise exception 'Business was not found.'; end if;
  if exists(select 1 from public.business_change_orders where business_id=p_business_id and
    (status in ('payment_submitted','under_review') or (status='pending_payment' and payment_provider='aba_payway'))) then
    raise exception 'Finish or cancel your existing payment before buying another credit.';
  end if;
  select id into checkout_id from public.business_change_orders where business_id=p_business_id
    and status='pending_payment' and credit_purchase and change_url=(p_credit_type='url')
    and change_business_mode=(p_credit_type='mode') order by created_at desc limit 1;
  if checkout_id is not null then return checkout_id; end if;
  update public.business_change_orders set status='cancelled',cancelled_at=now(),updated_at=now()
    where business_id=p_business_id and status='pending_payment';
  select bs.business_type into business_type from public.business_storefronts bs where bs.business_id=p_business_id;
  business_type:=coalesce(business_type,case b.product_mode when 'variant' then 'fashion' when 'configurable' then 'milk_tea' else 'general' end);
  insert into public.business_change_orders(business_id,requested_by_user_id,old_slug,requested_slug,
    old_business_type,requested_business_type,old_product_mode,requested_product_mode,change_url,change_business_mode,
    included_url_change,included_business_mode_change,unit_price,total_amount,currency,status,credit_purchase)
  values(p_business_id,p_requesting_user_id,b.slug,b.slug,business_type,business_type,b.product_mode,b.product_mode,
    p_credit_type='url',p_credit_type='mode',false,false,5,5,'USD','pending_payment',true)
  returning id into checkout_id;
  return checkout_id;
end;$$;

revoke all on function public.apply_business_changes_with_credits(uuid,uuid,text,text,text,text,text,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.apply_business_changes_with_credits(uuid,uuid,text,text,text,text,text,text,boolean,boolean) to service_role;
revoke all on function public.buy_business_change_credit(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.buy_business_change_credit(uuid,uuid,text) to service_role;
notify pgrst, 'reload schema';
commit;
