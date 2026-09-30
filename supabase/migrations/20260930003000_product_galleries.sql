begin;
alter table public.products add column if not exists image_urls text[] not null default '{}';
alter table public.branch_product_details add column if not exists image_urls text[] not null default '{}';
alter table public.products add constraint product_gallery_max_eight check (cardinality(image_urls) <= 8);
alter table public.branch_product_details add constraint branch_product_gallery_max_eight check (cardinality(image_urls) <= 8);

-- Seed by column name, not physical column position: branch-only columns precede new catalog columns.
create or replace function public.tenh_seed_branch_product() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.branch_product_details
  select (jsonb_populate_record(null::public.branch_product_details,
    to_jsonb(p)||jsonb_build_object('location_id',new.location_id,'branch_archived',false))).*
  from public.products p where p.id=new.product_id and p.business_id=new.business_id
  on conflict do nothing;
  return new;
end$$;

do $$declare columns text;begin
  select string_agg(case when column_name='stock_quantity' then 's.quantity stock_quantity' else format('d.%I',column_name) end,',' order by ordinal_position)
  into columns from information_schema.columns where table_schema='public' and table_name='products';
  execute 'create or replace view public.branch_products with(security_invoker=true) as select '||columns||
    ' from public.branch_product_details d join public.product_location_stock s on s.product_id=d.id and s.business_id=d.business_id and s.location_id=d.location_id where not d.branch_archived and public.tenh_branch_setting_visible(d.business_id,d.location_id)';
end$$;
notify pgrst, 'reload schema';
commit;
