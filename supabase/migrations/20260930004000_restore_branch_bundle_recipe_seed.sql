begin;

-- Preserve gallery-safe column mapping and restore branch recipe seeding.
create or replace function public.tenh_seed_branch_product() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.branch_product_details
  select (jsonb_populate_record(null::public.branch_product_details,
    to_jsonb(p)||jsonb_build_object('location_id',new.location_id,'branch_archived',false))).*
  from public.products p where p.id=new.product_id and p.business_id=new.business_id
  on conflict do nothing;

  insert into public.branch_bundle_recipes
    (id,business_id,bundle_product_id,component_product_id,quantity,selected_options,location_id)
  select i.id,i.business_id,i.bundle_product_id,i.component_product_id,i.quantity,i.selected_options,new.location_id
  from public.bundle_items i
  where i.business_id=new.business_id and i.bundle_product_id=new.product_id
    and not exists (
      select 1 from public.branch_bundle_recipes r
      where r.business_id=new.business_id and r.bundle_product_id=new.product_id and r.location_id=new.location_id
    )
  on conflict do nothing;
  return new;
end$$;

-- Recover only missing recipes; never merge the original items into edited recipes.
insert into public.branch_bundle_recipes
  (id,business_id,bundle_product_id,component_product_id,quantity,selected_options,location_id)
select i.id,i.business_id,i.bundle_product_id,i.component_product_id,i.quantity,i.selected_options,s.location_id
from public.bundle_items i
join public.product_location_stock s on s.business_id=i.business_id and s.product_id=i.bundle_product_id
join public.branch_product_details d on d.business_id=s.business_id and d.id=s.product_id and d.location_id=s.location_id
where not d.branch_archived and d.product_type='bundle'
  and not exists (
    select 1 from public.branch_bundle_recipes r
    where r.business_id=s.business_id and r.bundle_product_id=s.product_id and r.location_id=s.location_id
  )
on conflict do nothing;

notify pgrst, 'reload schema';
commit;
