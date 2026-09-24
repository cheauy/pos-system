begin;
-- Shared products remain the online catalog and stock identity. These rows hold
-- independently editable branch catalog details; historical sale snapshots stay intact.
create table if not exists public.branch_product_details (
 like public.products including defaults including constraints,
 location_id uuid not null references public.business_locations(id),
 branch_archived boolean not null default false,
 primary key(location_id,id),
 foreign key(id) references public.products(id) on delete cascade
);
insert into public.branch_product_details select p.*,s.location_id from public.products p
join public.product_location_stock s on s.product_id=p.id and s.business_id=p.business_id on conflict do nothing;

create or replace function public.tenh_seed_branch_product() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into branch_product_details select p.*,new.location_id from products p where p.id=new.product_id and p.business_id=new.business_id on conflict do nothing;
 return new;
end$$;
create trigger tenh_seed_branch_product after insert on public.product_location_stock for each row execute function public.tenh_seed_branch_product();
alter table public.branch_product_details enable row level security;
create policy branch_product_read on public.branch_product_details for select to authenticated using(public.tenh_branch_setting_visible(business_id,location_id));
grant select on public.branch_product_details to authenticated;
revoke insert,update,delete on public.branch_product_details from public,anon,authenticated;

-- Keep the products row shape so existing calculations can use the branch catalog.
do $$declare columns text;begin
 select string_agg(case when column_name='stock_quantity' then 's.quantity as stock_quantity' else format('d.%I',column_name) end,',' order by ordinal_position)
 into columns from information_schema.columns where table_schema='public' and table_name='products';
 execute 'create or replace view public.branch_products with(security_invoker=true) as select '||columns||
 ' from public.branch_product_details d join public.product_location_stock s on s.product_id=d.id and s.business_id=d.business_id and s.location_id=d.location_id
 where not d.branch_archived and public.tenh_branch_setting_visible(d.business_id,d.location_id)';
end$$;
grant select,update,delete on public.branch_products to authenticated;

create or replace function public.tenh_write_branch_product() returns trigger language plpgsql security definer set search_path=public as $$
declare b uuid; payload jsonb; target public.branch_product_details%rowtype; columns text;
begin
 b:=public.tenh_request_branch(old.business_id);
 if b is null then raise exception 'Choose an operating branch.';end if;
 if tg_op='DELETE' then perform public.tenh_assert_effective_permission(old.business_id,'products.disable');
 elsif (to_jsonb(new)-array['is_active','is_online','is_pos','updated_at'])=(to_jsonb(old)-array['is_active','is_online','is_pos','updated_at']) and public.tenh_user_permission_allowed(old.business_id,auth.uid(),'products.disable') then null;
 else perform public.tenh_assert_effective_permission(old.business_id,'products.update');end if;
 perform public.tenh_assert_plan_branch(old.business_id,b);
 if exists(select 1 from public.business_locations where id=b and plan_disable_pending) then raise exception 'This branch is closing after a plan change.';end if;
 if tg_op='DELETE' then
   if old.stock_quantity<>0 then raise exception 'Set branch stock to zero before deleting this product.';end if;
   update public.branch_product_details set branch_archived=true,is_active=false,is_pos=false,is_online=false,updated_at=now() where business_id=old.business_id and id=old.id and location_id=b;
   return old;
 end if;
 if new.id is distinct from old.id or new.business_id is distinct from old.business_id or new.owner_id is distinct from old.owner_id
 or new.stock_quantity is distinct from old.stock_quantity or new.product_type is distinct from old.product_type
 or new.variant_group_id is distinct from old.variant_group_id or new.bundle_stock_mode is distinct from old.bundle_stock_mode then
   raise exception 'Use the stock or bundle workflow to change quantities or product structure.';
 end if;
 if nullif(btrim(new.name),'') is null or new.cost_price<0 or new.selling_price<0 or new.cost_price::text in ('NaN','Infinity','-Infinity') or new.selling_price::text in ('NaN','Infinity','-Infinity') then raise exception 'Enter a name and valid product prices.';end if;
 if new.category_id is not null and not exists(select 1 from categories where id=new.category_id and business_id=new.business_id and (branch_ids is null or b=any(branch_ids))) then raise exception 'Choose a category available to this branch.';end if;
 if exists(select 1 from branch_product_details where business_id=new.business_id and location_id=b and id<>new.id and is_active and (nullif(new.sku,'')=sku or nullif(new.barcode,'')=barcode)) then raise exception 'This SKU or barcode already exists in this branch.';end if;
 payload:=to_jsonb(new)||jsonb_build_object('location_id',b,'updated_at',now());
 select * into target from jsonb_populate_record(null::public.branch_product_details,payload);
 select string_agg(format('%I=($1).%I',column_name,column_name),',') into columns from information_schema.columns
 where table_schema='public' and table_name='products' and column_name not in ('id','business_id','owner_id','stock_quantity','created_at');
 execute 'update public.branch_product_details set '||columns||' where business_id=$2 and location_id=$3 and id=$4' using target,old.business_id,b,old.id;
 new.updated_at:=target.updated_at;
 return new;
end$$;
create trigger branch_product_write instead of update or delete on public.branch_products for each row execute function public.tenh_write_branch_product();

-- Typed, checked branch details for trusted SQL calculations. Shared online checkout
-- continues to read products and never applies these branch prices.
create or replace function public.tenh_operating_product(p_product public.products) returns public.products
language plpgsql stable security definer set search_path='' as $$
declare b uuid; details public.products;
begin
 b:=public.tenh_request_branch(p_product.business_id);
 if b is null then raise exception 'Choose an operating branch.';end if;
 select (jsonb_populate_record(null::public.products,to_jsonb(d)-'location_id')).* into details from public.branch_product_details d
 where d.business_id=p_product.business_id and d.id=p_product.id and d.location_id=b and not d.branch_archived;
 if not found or not details.is_active or not coalesce(details.is_pos,true) then raise exception 'Product is unavailable in this branch.';end if;
 details.stock_quantity:=p_product.stock_quantity;
 return details;
end$$;
revoke all on function public.tenh_operating_product(public.products) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
