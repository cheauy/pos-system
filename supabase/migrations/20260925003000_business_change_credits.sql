-- Paid credits are permanent, single-use, and isolated from subscription capacity/expiry.
begin;
alter table public.business_change_orders
 add column if not exists credit_purchase boolean not null default false,
 add column if not exists used_url_credit boolean not null default false,
 add column if not exists used_mode_credit boolean not null default false,
 add column if not exists payment_method text,
 add column if not exists payway_tran_id text,
 add column if not exists payway_started_at timestamptz,
 add column if not exists payway_verified_at timestamptz,
 add column if not exists payway_payload jsonb,
 add column if not exists payment_expires_at timestamptz,
 add column if not exists payment_expired_at timestamptz,
 add column if not exists manual_bank_name text,
 add column if not exists manual_account_name text,
 add column if not exists manual_account_number text,
 add column if not exists manual_qr_image_url text;
alter table public.business_change_orders drop constraint if exists business_change_orders_status_check;
alter table public.business_change_orders add constraint business_change_orders_status_check check(status in ('pending_payment','payment_submitted','paid','applied','cancelled','failed','under_review'));
create unique index if not exists business_change_payway_transaction on public.business_change_orders(payway_tran_id) where payway_tran_id is not null;
create table if not exists public.business_change_credits(
 purchase_order_id uuid primary key references public.business_change_orders(id),
 business_id uuid not null references public.businesses(id) on delete cascade,
 url_remaining integer not null check(url_remaining in (0,1)),
 mode_remaining integer not null check(mode_remaining in (0,1)),
 created_at timestamptz not null default now()
);
create index if not exists business_change_credit_balance on public.business_change_credits(business_id) where url_remaining>0 or mode_remaining>0;
alter table public.business_change_credits enable row level security;
revoke all on public.business_change_credits from anon,authenticated;
grant all on public.business_change_credits to service_role;

CREATE OR REPLACE FUNCTION public.complete_business_change_order(p_order_id uuid, p_payment_reference text, p_payment_provider text DEFAULT 'external'::text)
 RETURNS TABLE(business_id uuid, new_slug text, new_business_type text, order_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order public.business_change_orders%rowtype;
  v_business public.businesses%rowtype;
  v_current_business_type text;
  v_reference text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Server verification required.'; end if;
  select bco.*
  into v_order
  from public.business_change_orders as bco
  where bco.id = p_order_id
  for update;

  if not found then
    raise exception 'Business change order was not found.';
  end if;

  if v_order.credit_purchase then
    if v_order.status not in ('pending_payment','payment_submitted','paid') then raise exception 'Order is not payable.'; end if;
    if nullif(btrim(p_payment_reference),'') is null then raise exception 'Verified payment reference required.'; end if;
    insert into public.business_change_credits(purchase_order_id,business_id,url_remaining,mode_remaining)
      values(v_order.id,v_order.business_id,v_order.change_url::int,v_order.change_business_mode::int)
      on conflict (purchase_order_id) do nothing;
    update public.business_change_orders set status='paid',payment_reference=p_payment_reference,payment_provider=p_payment_provider,paid_at=coalesce(paid_at,now()),updated_at=now() where id=v_order.id;
    return query select v_order.business_id,v_order.old_slug,v_order.old_business_type,'paid'::text;
    return;
  end if;
  if v_order.status = 'applied' then
    return query
    select
      v_order.business_id,
      v_order.requested_slug,
      v_order.requested_business_type,
      v_order.status;
    return;
  end if;

  if v_order.status not in ('pending_payment', 'payment_submitted', 'paid') then
    raise exception
      'Business change order is not payable/applicable in status %.',
      v_order.status;
  end if;

  v_reference := nullif(btrim(coalesce(p_payment_reference, '')), '');

  if v_reference is null then
    raise exception 'A verified payment reference is required.';
  end if;

  select b.*
  into v_business
  from public.businesses as b
  where b.id = v_order.business_id
  for update;

  if not found then
    raise exception 'Business was not found.';
  end if;

  select bs.business_type
  into v_current_business_type
  from public.business_storefronts as bs
  where bs.business_id = v_order.business_id
  for update;

  -- Prevent a stale paid order from overwriting a newer business change.
  if v_business.slug <> v_order.old_slug then
    raise exception
      'The store URL changed after this order was created. Create a new change order.';
  end if;

  if v_business.product_mode <> v_order.old_product_mode then
    raise exception
      'The product mode changed after this order was created. Create a new change order.';
  end if;

  if coalesce(v_current_business_type, '') <>
     coalesce(v_order.old_business_type, '') then
    raise exception
      'The business type changed after this order was created. Create a new change order.';
  end if;

  if v_order.change_url then
    if exists (
      select 1
      from public.businesses as other_business
      where lower(other_business.slug) = lower(v_order.requested_slug)
        and other_business.id <> v_order.business_id
    ) then
      raise exception
        'The requested TENH POS store address is no longer available.';
    end if;
  end if;

  update public.businesses as b
  set
    slug = case
      when v_order.change_url then v_order.requested_slug
      else b.slug
    end,
    product_mode = case
      when v_order.change_business_mode then v_order.requested_product_mode
      else b.product_mode
    end,
    updated_at = now()
  where b.id = v_order.business_id;

  if v_order.change_business_mode then
    insert into public.business_storefronts (
      business_id,
      business_type,
      updated_at
    ) values (
      v_order.business_id,
      v_order.requested_business_type,
      now()
    )
    on conflict on constraint business_storefronts_pkey
    do update set
      business_type = excluded.business_type,
      updated_at = excluded.updated_at;
  end if;

  update public.business_change_orders as bco
  set
    status = 'applied',
    payment_provider = left(
      coalesce(nullif(btrim(p_payment_provider), ''), 'external'),
      80
    ),
    payment_reference = v_reference,
    paid_at = coalesce(bco.paid_at, now()),
    applied_at = now(),
    updated_at = now()
  where bco.id = v_order.id;

  return query
  select
    v_order.business_id,
    case
      when v_order.change_url then v_order.requested_slug
      else v_order.old_slug
    end,
    case
      when v_order.change_business_mode then v_order.requested_business_type
      else v_order.old_business_type
    end,
    'applied'::text;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.create_business_change_order_with_entitlement(p_business_id uuid, p_requesting_user_id uuid, p_old_slug text, p_requested_slug text, p_old_business_type text, p_requested_business_type text, p_old_product_mode text, p_requested_product_mode text, p_change_url boolean, p_change_business_mode boolean)
 RETURNS TABLE(order_id uuid, order_status text, total_amount numeric, included_url_change boolean, included_business_mode_change boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_business public.businesses%rowtype;
  v_role text;
  v_url_credit uuid;
  v_mode_credit uuid;
  v_current_business_type text;
  v_url_used integer := 0;
  v_mode_used integer := 0;
  v_include_url boolean := false;
  v_include_mode boolean := false;
  v_total numeric := 0;
  v_order_id uuid;
  v_status text := 'pending_payment';
  v_month_start timestamptz := (date_trunc('month', now() at time zone 'Asia/Phnom_Penh') at time zone 'Asia/Phnom_Penh');
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Server action required.'; end if;
  if not (coalesce(p_change_url,false) or coalesce(p_change_business_mode,false)) then
    raise exception 'There are no changes to continue with.';
  end if;

  select bm.role::text
  into v_role
  from public.business_members bm
  where bm.business_id = p_business_id
    and bm.user_id = p_requesting_user_id
    and bm.is_active = true
  limit 1;

  if v_role is distinct from 'owner' then
    raise exception 'Only the business owner can request business changes.';
  end if;

  select * into v_business
  from public.businesses
  where id = p_business_id
  for update;

  if not found then
    raise exception 'Business was not found.';
  end if;

  if v_business.slug <> p_old_slug or v_business.product_mode <> p_old_product_mode then
    raise exception 'Business settings changed. Refresh and try again.';
  end if;

  select bs.business_type
  into v_current_business_type
  from public.business_storefronts bs
  where bs.business_id = p_business_id;

  if coalesce(v_current_business_type,'') <> coalesce(p_old_business_type,'') then
    raise exception 'Business mode changed. Refresh and try again.';
  end if;

  if p_change_url and exists (
    select 1 from public.businesses b
    where lower(b.slug) = lower(p_requested_slug)
      and b.id <> p_business_id
  ) then
    raise exception 'This TENH POS store address is already in use.';
  end if;

  if exists (
    select 1 from public.business_change_orders o
    where o.business_id = p_business_id
      and (o.status = 'payment_submitted' or (o.status='pending_payment' and o.payment_provider='aba_payway'))
  ) then
    raise exception 'A business-change payment is already under review. Wait for that review before creating another change request.';
  end if;

  update public.business_change_orders
  set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where business_id = p_business_id
    and status = 'pending_payment';

  if v_business.subscription_status = 'active'
     and v_business.subscription_plan_key in ('growth','custom') then
    select
      count(*) filter (where o.included_url_change and not o.used_url_credit),
      count(*) filter (where o.included_business_mode_change and not o.used_mode_credit)
    into v_url_used, v_mode_used
    from public.business_change_orders o
    where o.business_id = p_business_id
      and not o.credit_purchase
      and o.created_at >= v_month_start
      and o.status in ('pending_payment','payment_submitted','paid','applied');

    if p_change_url
       and v_url_used < coalesce(v_business.free_url_changes_per_month,0) then
      v_include_url := true;
    end if;

    if p_change_business_mode
       and v_mode_used < coalesce(v_business.free_business_mode_changes_per_month,0) then
      v_include_mode := true;
    end if;
  end if;

  if p_change_url and not v_include_url then
    select purchase_order_id into v_url_credit from public.business_change_credits where business_id=p_business_id and url_remaining=1 order by created_at,purchase_order_id limit 1 for update;
    v_include_url:=v_url_credit is not null;
  end if;
  if p_change_business_mode and not v_include_mode then
    select purchase_order_id into v_mode_credit from public.business_change_credits where business_id=p_business_id and mode_remaining=1 order by created_at,purchase_order_id limit 1 for update;
    v_include_mode:=v_mode_credit is not null;
  end if;
  v_total := 5 * (
    (case when p_change_url and not v_include_url then 1 else 0 end) +
    (case when p_change_business_mode and not v_include_mode then 1 else 0 end)
  );

  insert into public.business_change_orders (
    business_id,
    requested_by_user_id,
    old_slug,
    requested_slug,
    old_business_type,
    requested_business_type,
    old_product_mode,
    requested_product_mode,
    change_url,
    change_business_mode,
    included_url_change,
    included_business_mode_change,
    unit_price,
    total_amount,
    currency,
    status,credit_purchase,used_url_credit,used_mode_credit
  ) values (
    p_business_id,
    p_requesting_user_id,
    p_old_slug,
    p_requested_slug,
    p_old_business_type,
    p_requested_business_type,
    p_old_product_mode,
    p_requested_product_mode,
    p_change_url and (v_total=0 or not v_include_url),
    p_change_business_mode and (v_total=0 or not v_include_mode),
    v_total=0 and v_include_url,
    v_total=0 and v_include_mode,
    5.00,
    v_total,
    'USD',
    case when v_total = 0 then 'paid' else 'pending_payment' end,
    v_total>0,v_total=0 and v_url_credit is not null,v_total=0 and v_mode_credit is not null
  ) returning id into v_order_id;

  if v_total = 0 then
    update public.business_change_credits set url_remaining=0 where purchase_order_id=v_url_credit;
    update public.business_change_credits set mode_remaining=0 where purchase_order_id=v_mode_credit;
    perform * from public.complete_business_change_order(
      v_order_id,
      'subscription-included:' || v_order_id::text,
      'subscription_entitlement'
    );
    v_status := 'applied';
  else
    v_status := 'pending_payment';
  end if;

  return query
  select v_order_id, v_status, v_total, v_include_url, v_include_mode;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.review_business_change_order(p_order_id uuid, p_decision text, p_admin_user_id uuid, p_admin_email text, p_review_note text DEFAULT NULL::text)
 RETURNS TABLE(business_id uuid, order_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order public.business_change_orders%rowtype;
  v_decision text;
  v_note text;
  v_internal_reference text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Server review required.'; end if;
  v_decision := lower(btrim(coalesce(p_decision, '')));
  v_note := nullif(btrim(coalesce(p_review_note, '')), '');

  if v_decision not in ('approve', 'reject') then
    raise exception 'Decision must be approve or reject.';
  end if;

  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'Review note is too long.';
  end if;

  if v_decision = 'reject' and (v_note is null or char_length(v_note) < 3) then
    raise exception 'A rejection reason is required.';
  end if;

  select *
  into v_order
  from public.business_change_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Business change order was not found.';
  end if;

  if v_decision = 'approve' and v_order.status in ('applied','paid') then
    return query select v_order.business_id, v_order.status;
    return;
  end if;

  if v_decision = 'reject' and v_order.status = 'cancelled' and v_order.reviewed_at is not null then
    return query select v_order.business_id, v_order.status;
    return;
  end if;

  if v_order.status <> 'payment_submitted' then
    raise exception 'Only a customer-submitted payment can be manually reviewed.';
  end if;

  if v_decision = 'approve' then
    if nullif(btrim(coalesce(v_order.payment_note, '')), '') is null then
      raise exception 'A customer payment note is required before approval.';
    end if;

    if v_order.proof_bucket is null or v_order.proof_path is null then
      raise exception 'Customer payment proof is required before approval.';
    end if;

    -- Legacy orders may already have a real reference. New orders use an internal
    -- immutable reference because customers no longer need to type one manually.
    v_internal_reference := coalesce(
      nullif(btrim(coalesce(v_order.payment_reference, '')), ''),
      'manual-proof:' || v_order.id::text
    );

    perform *
    from public.complete_business_change_order(
      v_order.id,
      v_internal_reference,
      'manual_admin'
    );

    update public.business_change_orders
    set
      reviewed_at = now(),
      reviewed_by_user_id = p_admin_user_id,
      reviewed_by_email = left(nullif(btrim(coalesce(p_admin_email, '')), ''), 320),
      review_note = v_note,
      updated_at = now()
    where id = v_order.id;

    return query select v_order.business_id, case when v_order.credit_purchase then 'paid' else 'applied' end;
    return;
  end if;

  update public.business_change_orders
  set
    status = 'cancelled',
    cancelled_at = coalesce(cancelled_at, now()),
    reviewed_at = now(),
    reviewed_by_user_id = p_admin_user_id,
    reviewed_by_email = left(nullif(btrim(coalesce(p_admin_email, '')), ''), 320),
    review_note = v_note,
    updated_at = now()
  where id = v_order.id;

  return query select v_order.business_id, 'cancelled'::text;
end;
$function$
;

create or replace function public.confirm_payway_business_change_order(p_business_id uuid,p_order_id uuid,p_tran_id text,p_amount numeric,p_currency text,p_apv text default null,p_payment_type text default null,p_bank_ref text default null,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.business_change_orders%rowtype;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Server verification required.';end if;
 select * into o from public.business_change_orders where id=p_order_id and business_id=p_business_id for update;
 if not found or not o.credit_purchase or o.payway_tran_id is distinct from p_tran_id or o.payment_provider is distinct from 'aba_payway' or o.payway_started_at is null then raise exception 'Payment order mismatch.';end if;
 if o.total_amount is distinct from p_amount or o.currency is distinct from upper(p_currency) then raise exception 'Payment amount or currency mismatch.';end if;
 if o.status='paid' and o.payway_verified_at is not null then return jsonb_build_object('status','approved');end if;
 if o.status<>'pending_payment' then raise exception 'Order is not pending.';end if;
 if o.payment_expired_at is not null or o.payment_expires_at<=now() then raise exception 'Payment window expired. Review required.';end if;
 perform * from public.complete_business_change_order(o.id,p_tran_id,'aba_payway');
 update public.business_change_orders set payway_verified_at=now(),payway_payload=p_payload where id=o.id;
 return jsonb_build_object('status','approved');
end;$$;
revoke all on function public.confirm_payway_business_change_order(uuid,uuid,text,numeric,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.confirm_payway_business_change_order(uuid,uuid,text,numeric,text,text,text,text,jsonb) to service_role;
revoke all on function public.complete_business_change_order(uuid,text,text) from public,anon,authenticated;
revoke all on function public.create_business_change_order_with_entitlement(uuid,uuid,text,text,text,text,text,text,boolean,boolean) from public,anon,authenticated;
revoke all on function public.review_business_change_order(uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.complete_business_change_order(uuid,text,text) to service_role;
grant execute on function public.create_business_change_order_with_entitlement(uuid,uuid,text,text,text,text,text,text,boolean,boolean) to service_role;
grant execute on function public.review_business_change_order(uuid,text,uuid,text,text) to service_role;
commit;
