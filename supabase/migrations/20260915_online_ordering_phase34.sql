-- TENH POS Online Storefront - Phase 3 + 4
-- Customer cart/checkout, configurable options, online-order workflow,
-- real-time owner queue, store/table QR foundations.

-- ------------------------------------------------------------
-- Storefront checkout settings
-- ------------------------------------------------------------
alter table public.business_storefronts
  add column if not exists delivery_fee numeric(12,2) not null default 0;

alter table public.business_storefronts
  add column if not exists checkout_message text;

-- ------------------------------------------------------------
-- Product mode support used by the public storefront
-- ------------------------------------------------------------
alter table public.products
  add column if not exists product_type text not null default 'standard';

alter table public.products
  add column if not exists variant_group_id uuid;

update public.products
set product_type = 'standard'
where product_type is null;

alter table public.products
  alter column product_type set default 'standard';

create index if not exists products_variant_group_idx
  on public.products (business_id, variant_group_id)
  where variant_group_id is not null;

-- Configurable products keep their base product in products and their
-- selectable groups/options in the tables below.
create table if not exists public.product_option_groups (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  selection_type text not null default 'single',
  is_required boolean not null default false,
  min_selections integer not null default 0,
  max_selections integer not null default 1,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_option_groups_selection_type_check
    check (selection_type in ('single', 'multiple')),
  constraint product_option_groups_selection_count_check
    check (
      min_selections >= 0
      and max_selections >= 1
      and min_selections <= max_selections
    )
);

create table if not exists public.product_options (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  group_id uuid not null references public.product_option_groups(id) on delete cascade,
  name text not null,
  price_adjustment numeric(12,2) not null default 0,
  is_default boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_options_price_adjustment_check
    check (price_adjustment >= 0)
);

create index if not exists product_option_groups_product_idx
  on public.product_option_groups (business_id, product_id, sort_order);

create index if not exists product_options_product_group_idx
  on public.product_options (business_id, product_id, group_id, sort_order)
  where is_active = true;

-- Keep these tables server-controlled. Owner writes go through TENH server
-- actions after permission + tenant checks. Public reads are rendered server-side.
alter table public.product_option_groups enable row level security;
alter table public.product_options enable row level security;

-- ------------------------------------------------------------
-- Restaurant/cafe table QR codes
-- ------------------------------------------------------------
create table if not exists public.business_tables (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  public_token uuid not null default gen_random_uuid() unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name)
);

create index if not exists business_tables_business_idx
  on public.business_tables (business_id, is_active, name);

alter table public.business_tables enable row level security;

-- ------------------------------------------------------------
-- Existing orders remain the single source of truth for POS + online sales.
-- We add online-specific metadata without changing the current POS status enum.
-- ------------------------------------------------------------
alter table public.orders
  add column if not exists order_source text not null default 'pos';

alter table public.orders
  add column if not exists fulfillment_type text;

alter table public.orders
  add column if not exists online_status text;

alter table public.orders
  add column if not exists guest_name text;

alter table public.orders
  add column if not exists guest_phone text;

alter table public.orders
  add column if not exists guest_address text;

alter table public.orders
  add column if not exists customer_note text;

alter table public.orders
  add column if not exists table_id uuid references public.business_tables(id) on delete set null;

alter table public.orders
  add column if not exists table_name text;

alter table public.orders
  add column if not exists public_order_token uuid;

create unique index if not exists orders_public_order_token_idx
  on public.orders (public_order_token)
  where public_order_token is not null;

create index if not exists orders_business_source_created_idx
  on public.orders (business_id, order_source, created_at desc);

create index if not exists orders_business_online_status_idx
  on public.orders (business_id, online_status, created_at desc)
  where order_source in ('online', 'qr');

alter table public.order_items
  add column if not exists variant_label text;

alter table public.order_items
  add column if not exists selected_options jsonb not null default '[]'::jsonb;

comment on column public.orders.online_status is
  'Online workflow only: new, accepted, preparing, ready, completed, rejected.';

comment on column public.orders.order_source is
  'Order origin: pos, online, or qr.';

-- ------------------------------------------------------------
-- Atomic public checkout.
-- The browser never supplies trusted prices/totals. This function resolves
-- the tenant, locks products, validates stock/options, calculates totals,
-- creates order/items, then decrements stock in one database transaction.
-- ------------------------------------------------------------
create or replace function public.place_online_order(
  p_business_slug text,
  p_items jsonb,
  p_fulfillment_type text,
  p_guest_name text,
  p_guest_phone text,
  p_guest_address text default null,
  p_customer_note text default null,
  p_table_token uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.businesses%rowtype;
  v_store public.business_storefronts%rowtype;
  v_table public.business_tables%rowtype;
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_quantity integer;
  v_option_ids uuid[];
  v_selected_options jsonb;
  v_option_total numeric(12,2);
  v_unit_price numeric(12,2);
  v_line_subtotal numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_delivery_fee numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_group record;
  v_group_selection_count integer;
  v_invalid_option_count integer;
  v_variant_label text;
  v_computed_items jsonb := '[]'::jsonb;
  v_computed jsonb;
  v_order_id uuid;
  v_order_number text;
  v_public_token uuid;
  v_order_source text := 'online';
begin
  if p_business_slug is null or btrim(p_business_slug) = '' then
    raise exception 'Store not found.';
  end if;

  select *
    into v_business
  from public.businesses
  where slug = lower(btrim(p_business_slug))
  limit 1;

  if not found then
    raise exception 'Store not found.';
  end if;

  if not v_business.is_active then
    raise exception 'This business is currently unavailable.';
  end if;

  if v_business.subscription_expires_at is not null
     and v_business.subscription_expires_at <= now() then
    raise exception 'This business subscription has expired.';
  end if;

  select *
    into v_store
  from public.business_storefronts
  where business_id = v_business.id
  limit 1;

  if not found or not v_store.is_published then
    raise exception 'This online store is not published.';
  end if;

  if not v_store.accept_online_orders then
    raise exception 'This store is not accepting online orders right now.';
  end if;

  if p_fulfillment_type not in ('pickup', 'delivery', 'dine_in') then
    raise exception 'Invalid fulfillment type.';
  end if;

  if p_fulfillment_type = 'pickup' and not v_store.allow_pickup then
    raise exception 'Pickup is not available.';
  end if;

  if p_fulfillment_type = 'delivery' and not v_store.allow_delivery then
    raise exception 'Delivery is not available.';
  end if;

  if p_fulfillment_type = 'dine_in' and not v_store.allow_dine_in then
    raise exception 'Dine in ordering is not available.';
  end if;

  if p_guest_name is null or char_length(btrim(p_guest_name)) < 2 then
    raise exception 'Please enter your name.';
  end if;

  if p_guest_phone is null or char_length(btrim(p_guest_phone)) < 5 then
    raise exception 'Please enter a valid phone number.';
  end if;

  if p_fulfillment_type = 'delivery'
     and (p_guest_address is null or char_length(btrim(p_guest_address)) < 4) then
    raise exception 'Please enter a delivery address.';
  end if;

  if p_table_token is not null then
    select *
      into v_table
    from public.business_tables
    where business_id = v_business.id
      and public_token = p_table_token
      and is_active = true
    limit 1;

    if not found then
      raise exception 'This table QR code is no longer valid.';
    end if;

    v_order_source := 'qr';

    if p_fulfillment_type <> 'dine_in' then
      raise exception 'Table QR orders must use dine in.';
    end if;
  elsif p_fulfillment_type = 'dine_in' then
    raise exception 'Please scan a valid table QR code for dine in ordering.';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty.';
  end if;

  if jsonb_array_length(p_items) > 100 then
    raise exception 'Too many items in one order.';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    begin
      v_product_id := (v_item ->> 'productId')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception when others then
      raise exception 'The cart contains invalid product data.';
    end;

    if v_quantity is null or v_quantity < 1 or v_quantity > 999 then
      raise exception 'Invalid product quantity.';
    end if;

    select *
      into v_product
    from public.products
    where id = v_product_id
      and business_id = v_business.id
      and is_active = true
      and is_online = true
    for update;

    if not found then
      raise exception 'A product in your cart is no longer available.';
    end if;

    if coalesce(v_product.stock_quantity, 0) < v_quantity then
      raise exception 'Not enough stock for %.', v_product.name;
    end if;

    select coalesce(
      array_agg(value::uuid),
      array[]::uuid[]
    )
    into v_option_ids
    from jsonb_array_elements_text(
      coalesce(v_item -> 'optionIds', '[]'::jsonb)
    );

    select count(*)
      into v_invalid_option_count
    from unnest(v_option_ids) option_id
    left join public.product_options po
      on po.id = option_id
      and po.business_id = v_business.id
      and po.product_id = v_product.id
      and po.is_active = true
    where po.id is null;

    if v_invalid_option_count > 0 then
      raise exception 'A selected product option is no longer available.';
    end if;

    if coalesce(v_product.product_type, 'standard') = 'configurable' then
      for v_group in
        select *
        from public.product_option_groups
        where business_id = v_business.id
          and product_id = v_product.id
        order by sort_order, created_at
      loop
        select count(*)
          into v_group_selection_count
        from public.product_options po
        where po.group_id = v_group.id
          and po.id = any(v_option_ids)
          and po.is_active = true;

        if v_group.is_required and v_group_selection_count = 0 then
          raise exception 'Please choose an option for %.', v_group.name;
        end if;

        if v_group_selection_count < v_group.min_selections
           or v_group_selection_count > v_group.max_selections then
          raise exception 'Invalid selection count for %.', v_group.name;
        end if;
      end loop;
    elsif cardinality(v_option_ids) > 0 then
      raise exception 'This product does not support configurable options.';
    end if;

    select
      coalesce(sum(po.price_adjustment), 0),
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', po.id,
            'name', po.name,
            'priceAdjustment', po.price_adjustment,
            'groupId', po.group_id
          ) order by pog.sort_order, po.sort_order, po.created_at
        ) filter (where po.id is not null),
        '[]'::jsonb
      )
    into v_option_total, v_selected_options
    from public.product_options po
    left join public.product_option_groups pog
      on pog.id = po.group_id
    where po.id = any(v_option_ids)
      and po.business_id = v_business.id
      and po.product_id = v_product.id
      and po.is_active = true;

    v_unit_price := round(
      (coalesce(v_product.selling_price, 0) + coalesce(v_option_total, 0))::numeric,
      2
    );

    v_line_subtotal := round(
      (v_unit_price * v_quantity)::numeric,
      2
    );

    v_subtotal := v_subtotal + v_line_subtotal;

    v_variant_label := nullif(
      concat_ws(
        ' / ',
        nullif(btrim(coalesce(v_product.color, '')), ''),
        nullif(btrim(coalesce(v_product.size, '')), '')
      ),
      ''
    );

    v_computed_items := v_computed_items || jsonb_build_array(
      jsonb_build_object(
        'productId', v_product.id,
        'productName', v_product.name,
        'quantity', v_quantity,
        'unitPrice', v_unit_price,
        'subtotal', v_line_subtotal,
        'variantLabel', v_variant_label,
        'selectedOptions', v_selected_options
      )
    );
  end loop;

  if v_subtotal < coalesce(v_store.minimum_order, 0) then
    raise exception 'Minimum order is %.', v_store.minimum_order;
  end if;

  if p_fulfillment_type = 'delivery' then
    v_delivery_fee := coalesce(v_store.delivery_fee, 0);
  end if;

  v_total := round((v_subtotal + v_delivery_fee)::numeric, 2);
  v_order_number := 'WEB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  v_public_token := gen_random_uuid();

  insert into public.orders (
    owner_id,
    business_id,
    customer_id,
    order_number,
    subtotal,
    discount,
    delivery_fee,
    total,
    payment_method,
    amount_paid,
    change_amount,
    remaining_balance,
    status,
    order_source,
    fulfillment_type,
    online_status,
    guest_name,
    guest_phone,
    guest_address,
    customer_note,
    table_id,
    table_name,
    public_order_token,
    created_at,
    updated_at
  )
  values (
    v_business.owner_id,
    v_business.id,
    null,
    v_order_number,
    v_subtotal,
    0,
    v_delivery_fee,
    v_total,
    'cod',
    0,
    0,
    v_total,
    'new',
    v_order_source,
    p_fulfillment_type,
    'new',
    left(btrim(p_guest_name), 120),
    left(btrim(p_guest_phone), 60),
    case when p_guest_address is null then null else left(btrim(p_guest_address), 500) end,
    case when p_customer_note is null then null else left(btrim(p_customer_note), 1000) end,
    case when p_table_token is null then null else v_table.id end,
    case when p_table_token is null then null else v_table.name end,
    v_public_token,
    now(),
    now()
  )
  returning id into v_order_id;

  for v_computed in
    select value from jsonb_array_elements(v_computed_items)
  loop
    insert into public.order_items (
      order_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      subtotal,
      variant_label,
      selected_options
    )
    values (
      v_order_id,
      (v_computed ->> 'productId')::uuid,
      v_computed ->> 'productName',
      (v_computed ->> 'quantity')::integer,
      (v_computed ->> 'unitPrice')::numeric,
      (v_computed ->> 'subtotal')::numeric,
      nullif(v_computed ->> 'variantLabel', ''),
      coalesce(v_computed -> 'selectedOptions', '[]'::jsonb)
    );

    update public.products
    set stock_quantity = stock_quantity - (v_computed ->> 'quantity')::integer,
        updated_at = now()
    where id = (v_computed ->> 'productId')::uuid
      and business_id = v_business.id;
  end loop;

  return jsonb_build_object(
    'orderId', v_order_id,
    'orderNumber', v_order_number,
    'publicToken', v_public_token,
    'subtotal', v_subtotal,
    'deliveryFee', v_delivery_fee,
    'total', v_total,
    'currency', v_store.currency,
    'onlineStatus', 'new'
  );
end;
$$;

revoke all on function public.place_online_order(
  text, jsonb, text, text, text, text, text, uuid
) from public;

grant execute on function public.place_online_order(
  text, jsonb, text, text, text, text, text, uuid
) to anon, authenticated, service_role;

-- Supabase Realtime is used by the owner queue. If orders is already in the
-- publication this block does nothing. The UI also polls as a fallback.
do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
exception when insufficient_privilege then
  raise notice 'Could not add orders to supabase_realtime publication. Polling fallback will still work.';
end;
$$;
