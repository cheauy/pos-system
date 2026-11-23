-- Per-business API keys and outgoing product/inventory webhooks (e.g. TenhChat Social Inbox).
-- Runs at zero external infrastructure cost using hashed bearer keys, an RLS-locked
-- Postgres outbox, and HMAC-SHA256 signed HTTP deliveries.
begin;

create table if not exists public.business_api_keys (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  key_prefix text not null check (char_length(key_prefix) between 8 and 32),
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] not null default array['products:read']::text[],
  is_active boolean not null default true,
  last_used_at timestamptz,
  created_by uuid,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists business_api_keys_business_idx
  on public.business_api_keys(business_id, created_at desc);

create table if not exists public.business_webhooks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null default 'TenhChat Social Inbox' check (char_length(btrim(name)) between 1 and 80),
  target_url text not null check (char_length(target_url) <= 500 and target_url ~* '^https://'),
  signing_secret text not null check (char_length(signing_secret) >= 24),
  events text[] not null default array['product.created', 'product.updated', 'product.deleted', 'inventory.updated']::text[],
  is_active boolean not null default true,
  last_triggered_at timestamptz,
  last_status_code integer,
  last_error text,
  failure_count integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_webhooks_active_idx
  on public.business_webhooks(business_id)
  where is_active = true;

create table if not exists public.business_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references public.business_webhooks(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  event_type text not null,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'delivered', 'failed')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  response_status integer,
  response_body text,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists business_webhook_deliveries_due_idx
  on public.business_webhook_deliveries(status, next_attempt_at)
  where status in ('pending', 'processing');

create index if not exists business_webhook_deliveries_business_idx
  on public.business_webhook_deliveries(business_id, created_at desc);

alter table public.business_api_keys enable row level security;
alter table public.business_webhooks enable row level security;
alter table public.business_webhook_deliveries enable row level security;

revoke all on table
  public.business_api_keys,
  public.business_webhooks,
  public.business_webhook_deliveries
from public, anon, authenticated;

grant all on table
  public.business_api_keys,
  public.business_webhooks,
  public.business_webhook_deliveries
to service_role;

create or replace function public.tenh_queue_business_webhook_event(
  p_business_id uuid,
  p_event_type text,
  p_entity_id text,
  p_payload jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hook record;
  v_existing_id uuid;
  v_queued integer := 0;
begin
  if p_business_id is null or p_event_type is null then
    return 0;
  end if;

  for v_hook in
    select w.id
    from public.business_webhooks w
    where w.business_id = p_business_id
      and w.is_active = true
      and (p_event_type = any(w.events) or '*' = any(w.events))
  loop
    v_existing_id := null;

    if p_entity_id is not null then
      select d.id
      into v_existing_id
      from public.business_webhook_deliveries d
      where d.webhook_id = v_hook.id
        and d.status = 'pending'
        and d.event_type = p_event_type
        and d.entity_id = p_entity_id
      order by d.created_at desc
      limit 1
      for update skip locked;
    end if;

    if v_existing_id is not null then
      update public.business_webhook_deliveries
      set payload = coalesce(p_payload, '{}'::jsonb),
          next_attempt_at = now()
      where id = v_existing_id;
    else
      insert into public.business_webhook_deliveries (
        webhook_id,
        business_id,
        event_type,
        entity_id,
        payload,
        status,
        next_attempt_at
      ) values (
        v_hook.id,
        p_business_id,
        p_event_type,
        p_entity_id,
        coalesce(p_payload, '{}'::jsonb),
        'pending',
        now()
      );
    end if;

    v_queued := v_queued + 1;
  end loop;

  return v_queued;
end;
$$;

revoke all on function public.tenh_queue_business_webhook_event(uuid, text, text, jsonb)
from public, anon, authenticated;
grant execute on function public.tenh_queue_business_webhook_event(uuid, text, text, jsonb)
to service_role;

create or replace function public.tenh_products_webhook_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_event text;
  v_entity_id text;
  v_payload jsonb;
begin
  v_business_id := coalesce(new.business_id, old.business_id);
  if v_business_id is null then
    return coalesce(new, old);
  end if;

  -- Fast O(1) exit when the business has no active webhooks configured.
  if not exists (
    select 1
    from public.business_webhooks w
    where w.business_id = v_business_id
      and w.is_active = true
  ) then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    v_event := 'product.created';
    v_entity_id := coalesce(new.variant_group_id::text, new.id::text);
    v_payload := jsonb_build_object(
      'product_id', new.id,
      'variant_group_id', new.variant_group_id,
      'sku', new.sku,
      'name', new.name,
      'is_active', new.is_active
    );
  elsif tg_op = 'DELETE' then
    v_event := 'product.deleted';
    v_entity_id := coalesce(old.variant_group_id::text, old.id::text);
    v_payload := jsonb_build_object(
      'product_id', old.id,
      'variant_group_id', old.variant_group_id,
      'sku', old.sku,
      'name', old.name,
      'deleted', true
    );
  else
    if new.name is not distinct from old.name
       and new.sku is not distinct from old.sku
       and new.barcode is not distinct from old.barcode
       and new.description is not distinct from old.description
       and new.selling_price is not distinct from old.selling_price
       and new.category_id is not distinct from old.category_id
       and new.image_url is not distinct from old.image_url
       and new.variant_image_url is not distinct from old.variant_image_url
       and new.size is not distinct from old.size
       and new.color is not distinct from old.color
       and new.is_active is not distinct from old.is_active
       and new.is_online is not distinct from old.is_online
       and new.product_type is not distinct from old.product_type
       and new.variant_group_id is not distinct from old.variant_group_id
       and (to_jsonb(new) -> 'image_urls') is not distinct from (to_jsonb(old) -> 'image_urls')
    then
      if new.stock_quantity is distinct from old.stock_quantity then
        v_event := 'inventory.updated';
      else
        return new;
      end if;
    elsif old.is_active = true and new.is_active = false then
      v_event := 'product.deleted';
    else
      v_event := 'product.updated';
    end if;

    v_entity_id := coalesce(new.variant_group_id::text, new.id::text);
    v_payload := jsonb_build_object(
      'product_id', new.id,
      'variant_group_id', new.variant_group_id,
      'sku', new.sku,
      'name', new.name,
      'is_active', new.is_active
    );
  end if;

  perform public.tenh_queue_business_webhook_event(
    v_business_id,
    v_event,
    v_entity_id,
    v_payload
  );

  return coalesce(new, old);
end;
$$;

revoke all on function public.tenh_products_webhook_trigger()
from public, anon, authenticated;
grant execute on function public.tenh_products_webhook_trigger()
to service_role;

drop trigger if exists tenh_products_webhook_after_change on public.products;
create trigger tenh_products_webhook_after_change
after insert or update or delete on public.products
for each row execute function public.tenh_products_webhook_trigger();

create or replace function public.tenh_location_stock_webhook_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_product_id uuid;
  v_group_id uuid;
begin
  if tg_op = 'UPDATE' and new.quantity is not distinct from old.quantity then
    return new;
  end if;

  v_business_id := coalesce(new.business_id, old.business_id);
  v_product_id := coalesce(new.product_id, old.product_id);

  if v_business_id is null or v_product_id is null then
    return coalesce(new, old);
  end if;

  if not exists (
    select 1
    from public.business_webhooks w
    where w.business_id = v_business_id
      and w.is_active = true
      and ('inventory.updated' = any(w.events) or '*' = any(w.events))
  ) then
    return coalesce(new, old);
  end if;

  select p.variant_group_id
  into v_group_id
  from public.products p
  where p.id = v_product_id
    and p.business_id = v_business_id;

  perform public.tenh_queue_business_webhook_event(
    v_business_id,
    'inventory.updated',
    coalesce(v_group_id::text, v_product_id::text),
    jsonb_build_object(
      'product_id', v_product_id,
      'variant_group_id', v_group_id,
      'location_id', coalesce(new.location_id, old.location_id),
      'quantity', case when tg_op = 'DELETE' then 0 else new.quantity end
    )
  );

  return coalesce(new, old);
end;
$$;

revoke all on function public.tenh_location_stock_webhook_trigger()
from public, anon, authenticated;
grant execute on function public.tenh_location_stock_webhook_trigger()
to service_role;

drop trigger if exists tenh_location_stock_webhook_after_change on public.product_location_stock;
create trigger tenh_location_stock_webhook_after_change
after insert or update or delete on public.product_location_stock
for each row execute function public.tenh_location_stock_webhook_trigger();

create or replace function public.tenh_claim_webhook_deliveries(
  p_business_id uuid default null,
  p_limit integer default 25
)
returns table (
  delivery_id uuid,
  webhook_id uuid,
  business_id uuid,
  target_url text,
  signing_secret text,
  event_type text,
  entity_id text,
  payload jsonb,
  attempt_count integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
begin
  -- Recover deliveries left in processing after an interrupted worker timeout.
  update public.business_webhook_deliveries d
  set status = case when d.attempt_count >= 3 then 'failed' else 'pending' end,
      next_attempt_at = case when d.attempt_count >= 3 then d.next_attempt_at else now() + interval '30 seconds' end,
      response_body = coalesce(d.response_body, 'Delivery worker timed out before completion.')
  where d.status = 'processing'
    and d.claimed_at < now() - interval '5 minutes'
    and (p_business_id is null or d.business_id = p_business_id);

  -- Keep table storage bounded on free-tier Postgres by pruning old finished logs.
  delete from public.business_webhook_deliveries
  where id in (
    select old_d.id
    from public.business_webhook_deliveries old_d
    where old_d.status in ('delivered', 'failed')
      and old_d.created_at < now() - interval '14 days'
    order by old_d.created_at asc
    limit 100
  );

  return query
  with due as (
    select d.id
    from public.business_webhook_deliveries d
    join public.business_webhooks w on w.id = d.webhook_id
    where d.status = 'pending'
      and d.next_attempt_at <= now()
      and w.is_active = true
      and (p_business_id is null or d.business_id = p_business_id)
    order by d.next_attempt_at asc, d.created_at asc
    limit v_limit
    for update of d skip locked
  ),
  claimed as (
    update public.business_webhook_deliveries d
    set status = 'processing',
        attempt_count = d.attempt_count + 1,
        claimed_at = now()
    from due
    where d.id = due.id
    returning d.*
  )
  select
    c.id as delivery_id,
    c.webhook_id,
    c.business_id,
    w.target_url,
    w.signing_secret,
    c.event_type,
    c.entity_id,
    c.payload,
    c.attempt_count,
    c.created_at
  from claimed c
  join public.business_webhooks w on w.id = c.webhook_id;
end;
$$;

revoke all on function public.tenh_claim_webhook_deliveries(uuid, integer)
from public, anon, authenticated;
grant execute on function public.tenh_claim_webhook_deliveries(uuid, integer)
to service_role;

notify pgrst, 'reload schema';
commit;
