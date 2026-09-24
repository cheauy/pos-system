begin;
create table public.branch_bundle_recipes (
 like public.bundle_items including defaults including constraints,
 location_id uuid not null references public.business_locations(id),
 primary key(location_id,id)
);
insert into public.branch_bundle_recipes select i.*,s.location_id from public.bundle_items i join public.product_location_stock s on s.business_id=i.business_id and s.product_id=i.bundle_product_id;
alter table public.branch_bundle_recipes enable row level security;
create policy branch_recipe_read on public.branch_bundle_recipes for select to authenticated using(public.tenh_branch_setting_visible(business_id,location_id));
grant select on public.branch_bundle_recipes to authenticated;
create or replace function public.tenh_recipe_location() returns trigger language plpgsql set search_path='' as $$
begin new.location_id:=coalesce(new.location_id,public.tenh_request_branch(new.business_id));return new;end$$;
create trigger recipe_location before insert on public.branch_bundle_recipes for each row execute function public.tenh_recipe_location();
do $$declare columns text;definition text;f record;begin
 select string_agg(format('r.%I',column_name),',' order by ordinal_position) into columns from information_schema.columns where table_schema='public' and table_name='bundle_items';
 execute 'create view public.branch_bundle_items with(security_invoker=true) as select '||columns||' from public.branch_bundle_recipes r where public.tenh_branch_setting_visible(r.business_id,r.location_id)';
 select pg_get_functiondef('public.tenh_seed_branch_product()'::regprocedure) into definition;
 definition:=replace(definition,'return new;', 'insert into public.branch_bundle_recipes select i.*,new.location_id from public.bundle_items i where i.business_id=new.business_id and i.bundle_product_id=new.product_id on conflict do nothing; return new;');
 execute definition;
 for f in select oid,proname from pg_proc where pronamespace='public'::regnamespace and proname in ('tenh_manage_bundle','tenh_edit_bundle_contents','tenh_pack_bundle','tenh_create_packed_bundle','tenh_create_packed_bundle_with_image') loop
 definition:=pg_get_functiondef(f.oid);
 if f.proname not in ('tenh_create_packed_bundle','tenh_create_packed_bundle_with_image') then definition:=replace(definition,'public.bundle_items','public.branch_bundle_items');end if;
 if f.proname='tenh_pack_bundle' then
   definition:=replace(definition,'select * into bundle from public.products','select * into bundle from public.branch_products');
   definition:=replace(definition,'join public.products p on','join public.branch_products p on');
 elsif f.proname='tenh_create_packed_bundle' then
   definition:=replace(definition,'select * into p from public.products','select * into p from public.branch_products');
 elsif f.proname='tenh_create_packed_bundle_with_image' then
   definition:=replace(definition,'update public.products set image_url = v_url where id = v_id and business_id = p_business_id;', 'update public.products set image_url = v_url where id = v_id and business_id = p_business_id; update public.branch_product_details set image_url=v_url where id=v_id and business_id=p_business_id and location_id=p_branch_id;');
 elsif f.proname='tenh_manage_bundle' then
   definition:=replace(definition,'select * into p from public.products','select * into p from public.branch_products');
   definition:=replace(definition,'from public.products where business_id=p_business_id and id<>p_bundle_id','from public.branch_products where business_id=p_business_id and id<>p_bundle_id');
   definition:=replace(definition,'update public.products','update public.branch_products');
   definition:=replace(definition,'delete from public.products','delete from public.branch_products');
 elsif f.proname='tenh_edit_bundle_contents' then
   definition:=replace(definition,'select 1 from public.products where id=p_bundle_id and stock_quantity<>0','select 1 from public.branch_products where id=p_bundle_id and stock_quantity<>0');
   definition:=replace(definition,'product_id=p_bundle_id and quantity<>0','product_id=p_bundle_id and location_id=p_branch_id and quantity<>0');
   definition:=replace(definition,'Unpack all sets in every branch','Unpack all sets in this branch');
   definition:=replace(definition,'select * into component from public.products','select * into component from public.branch_products');
   definition:=replace(definition,'update public.products','update public.branch_products');
 end if;
 execute definition;
 end loop;
 select pg_get_functiondef('public.tenh_pos_catalog_scoped(uuid)'::regprocedure) into definition;
 definition:=replace(definition,'public.products p','public.branch_products p');execute definition;
 select pg_get_functiondef('public.tenh_pos_catalog_scoped_before_visibility(uuid)'::regprocedure) into definition;
 definition:=replace(definition,'FROM public.products p','FROM public.branch_products p');execute definition;
end$$;
grant select on public.branch_bundle_items to authenticated;
notify pgrst,'reload schema';
commit;
