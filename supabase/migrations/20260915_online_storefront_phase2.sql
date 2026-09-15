-- TENH POS Online Storefront - Phase 2
-- Adds business storefront settings plus per-product/category online visibility.

create table if not exists public.business_storefronts (
  business_id uuid primary key
    references public.businesses(id) on delete cascade,

  business_type text not null default 'general',
  is_published boolean not null default false,
  accept_online_orders boolean not null default false,
  template_key text not null default 'modern',

  display_name text,
  description text,
  logo_url text,
  banner_url text,
  primary_color text not null default '#2563EB',

  phone text,
  address text,
  currency text not null default 'USD',

  allow_pickup boolean not null default true,
  allow_delivery boolean not null default false,
  allow_dine_in boolean not null default false,

  minimum_order numeric(12,2) not null default 0,
  estimated_minutes integer,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint business_storefronts_business_type_check
    check (
      business_type in (
        'general',
        'restaurant',
        'cafe',
        'milk_tea',
        'fashion',
        'shoes',
        'accessories',
        'beauty',
        'electronics',
        'grocery',
        'other'
      )
    ),

  constraint business_storefronts_primary_color_check
    check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),

  constraint business_storefronts_minimum_order_check
    check (minimum_order >= 0),

  constraint business_storefronts_estimated_minutes_check
    check (estimated_minutes is null or estimated_minutes between 1 and 1440)
);

alter table public.products
  add column if not exists is_online boolean not null default true;

alter table public.products
  add column if not exists online_sort_order integer not null default 0;

alter table public.categories
  add column if not exists is_online boolean not null default true;

alter table public.categories
  add column if not exists online_sort_order integer not null default 0;

create index if not exists products_business_online_idx
  on public.products (business_id, is_online, is_active, online_sort_order);

create index if not exists categories_business_online_idx
  on public.categories (business_id, is_online, online_sort_order);

-- Existing businesses receive a private storefront configuration.
insert into public.business_storefronts (business_id)
select id
from public.businesses
on conflict (business_id) do nothing;

-- Public media bucket. Uploads are performed only from server actions after
-- TENH permission checks, using the service-role client.
insert into storage.buckets (id, name, public)
values ('storefront-media', 'storefront-media', true)
on conflict (id) do update
set public = excluded.public;

comment on table public.business_storefronts is
  'Public online-store configuration for each TENH POS business.';

comment on column public.products.is_online is
  'Whether this product is visible on the public TENH online storefront.';

comment on column public.categories.is_online is
  'Whether this category is visible on the public TENH online storefront.';

-- Keep storefront settings server-controlled. Public rendering and owner writes
-- are performed through TENH server code after tenant/permission checks.
alter table public.business_storefronts enable row level security;

-- Automatically create private storefront settings for future businesses.
create or replace function public.create_default_business_storefront()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.business_storefronts (business_id)
  values (new.id)
  on conflict (business_id) do nothing;

  return new;
end;
$$;

drop trigger if exists create_default_business_storefront_trigger
  on public.businesses;

create trigger create_default_business_storefront_trigger
after insert on public.businesses
for each row
execute function public.create_default_business_storefront();
