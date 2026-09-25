begin;
set local lock_timeout='5s';

create table if not exists public.subscription_promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  plan_key text check (plan_key in ('solo','small_team','growth','custom')),
  term_months integer check (term_months in (1,3,6,12)),
  discount_percent numeric(5,2) not null check (discount_percent between 1 and 90),
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  apply_new boolean not null default true,
  apply_existing boolean not null default true,
  enabled boolean not null default true,
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  check (apply_new or apply_existing)
);
alter table public.subscription_promotions enable row level security;
revoke all on public.subscription_promotions from public, anon, authenticated;
grant select, insert, update on public.subscription_promotions to service_role;

create table if not exists public.subscription_order_discounts (
  order_id uuid primary key references public.subscription_orders(id) on delete cascade,
  plan_key text not null,
  term_months integer not null,
  order_kind text not null,
  discount_percent numeric not null check(discount_percent between 0 and 90),
  quoted_at timestamptz not null default now()
);
alter table public.subscription_order_discounts enable row level security;
revoke all on public.subscription_order_discounts from public, anon, authenticated, service_role;
grant select on public.subscription_order_discounts to service_role;

-- Discounts replace the ordinary term discount only when better. They never
-- reduce existing payments or change remaining-time upgrade proration.
create or replace function public.tenh_subscription_discount(p_plan_key text, p_term_months integer, p_order_kind text)
returns numeric language sql stable security definer set search_path='' as $$
  select case when p_term_months=0 then 0 else greatest(
    case p_term_months when 3 then 5 when 6 then 8 when 12 then 10 else 0 end,
    coalesce((select max(discount_percent) from public.subscription_promotions
      where enabled and (plan_key is null or plan_key=p_plan_key)
        and (term_months is null or term_months=p_term_months)
        and (now() at time zone 'Asia/Phnom_Penh')::date between starts_on and ends_on
        and ((p_order_kind='activation' and apply_new)
          or (p_order_kind in ('upgrade','renewal','reactivation') and apply_existing))
    ),0)) end;
$$;
revoke all on function public.tenh_subscription_discount(text,integer,text) from public, anon, authenticated;
grant execute on function public.tenh_subscription_discount(text,integer,text) to service_role;

create or replace function public.tenh_record_subscription_discount(p_order_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare o public.subscription_orders%rowtype; expected numeric;
begin
  select * into o from public.subscription_orders where id=p_order_id for update;
  if not found or o.status is distinct from 'pending_payment'
    or o.payment_method is not null or o.payment_provider is not null
    or o.payway_tran_id is not null or o.proof_path is not null then
    raise exception 'Discount quote is locked after payment starts.';
  end if;
  expected:=public.tenh_subscription_discount(o.plan_key,o.term_months,o.order_kind);
  if o.discount_percent is distinct from expected then raise exception 'Discount quote is invalid.'; end if;
  insert into public.subscription_order_discounts(order_id,plan_key,term_months,order_kind,discount_percent)
    values(o.id,o.plan_key,o.term_months,o.order_kind,expected)
    on conflict(order_id) do update set plan_key=excluded.plan_key,term_months=excluded.term_months,
      order_kind=excluded.order_kind,discount_percent=excluded.discount_percent,quoted_at=now();
end $$;
revoke all on function public.tenh_record_subscription_discount(uuid) from public, anon, authenticated, service_role;

create or replace function public.tenh_locked_subscription_discount(p_order_id uuid)
returns numeric language plpgsql stable security definer set search_path='' as $$
declare o public.subscription_orders%rowtype; quote public.subscription_order_discounts%rowtype;
begin
  select * into o from public.subscription_orders where id=p_order_id;
  if not found then raise exception 'Subscription order not found.'; end if;
  select * into quote from public.subscription_order_discounts where order_id=o.id;
  if found then
    if quote.plan_key is distinct from o.plan_key or quote.term_months is distinct from o.term_months
      or quote.order_kind is distinct from o.order_kind then raise exception 'Discount quote no longer matches this order.'; end if;
    return quote.discount_percent;
  end if;
  -- Orders issued before this migration retain their original term discounts.
  return case o.term_months when 3 then 5 when 6 then 8 when 12 then 10 else 0 end;
end $$;
revoke all on function public.tenh_locked_subscription_discount(uuid) from public, anon, authenticated, service_role;

-- Replace only the discount expression in the installed quote functions.
-- Abort atomically if their structure has changed; preserve all payment locks,
-- owner validation, capacity limits, proration, and activation behavior.
do $$
declare signature text; source text; patched text; expression text;
begin
  foreach signature in array array[
    'public.create_safe_subscription_order(uuid,uuid,text,integer,integer,integer,uuid[],uuid[])',
    'public.update_pending_upgrade_billing_term(uuid,uuid,uuid,integer)',
    'public.update_pending_subscription_billing_term(uuid,uuid,uuid,integer)'
  ] loop
    source:=pg_get_functiondef(signature::regprocedure);
    if position('public.tenh_subscription_discount(' in source)>0 then continue; end if;
    expression:=case
      when signature like 'public.create_safe%' then 'v_discount:=public.tenh_subscription_discount(p_plan_key,p_term_months,v_kind);'
      when signature like 'public.update_pending_upgrade%' then 'v_discount:=public.tenh_subscription_discount(o.plan_key,p_term_months,o.order_kind);'
      else 'discount:=public.tenh_subscription_discount(o.plan_key,p_term_months,o.order_kind);' end;
    patched:=regexp_replace(source,'(v_discount|discount)\s*:=\s*case p_term_months\s+when 3 then 5\s+when 6 then 8\s+when 12 then 10\s+else 0\s+end;',expression,'i');
    if patched=source then raise exception 'Subscription quote structure changed: %',signature; end if;
    if signature like 'public.create_safe%' then
      if position('return query select v_id' in patched)=0 then raise exception 'Missing quote return: %',signature; end if;
      patched:=replace(patched,'return query select v_id','perform public.tenh_record_subscription_discount(v_id); return query select v_id');
    else
      if position('return query select o.id' in patched)=0 then raise exception 'Missing quote return: %',signature; end if;
      patched:=replace(patched,'return query select o.id','perform public.tenh_record_subscription_discount(o.id); return query select o.id');
    end if;
    execute patched;
  end loop;

  foreach signature in array array[
    'public.review_safe_subscription_order(uuid,text,uuid,text,text)',
    'public.confirm_payway_subscription_order(uuid,uuid,text,numeric,text,text,text,text,jsonb)'
  ] loop
    source:=pg_get_functiondef(signature::regprocedure);
    if position('public.tenh_locked_subscription_discount(' in source)>0 then continue; end if;
    patched:=regexp_replace(source,'v_discount\s*:=\s*case o.term_months\s+when 3 then 5\s+when 6 then 8\s+when 12 then 10\s+else 0\s+end;',
      'v_discount:=public.tenh_locked_subscription_discount(o.id);','i');
    if patched=source then raise exception 'Payment review structure changed: %',signature; end if;
    execute patched;
  end loop;
end $$;
notify pgrst, 'reload schema';
commit;
