begin;
set local lock_timeout='5s';
alter table public.products add column if not exists is_pos boolean not null default true;

create or replace function public.tenh_manage_bundle(p_business_id uuid,p_branch_id uuid,p_bundle_id uuid,p_action text,p_input jsonb,p_expected timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare p public.products%rowtype; t text; used boolean;
begin
 if p_action is null or p_action not in ('edit','pos','online','delete') then raise exception 'Choose a valid bundle action.';end if;
 perform public.tenh_assert_effective_permission(p_business_id,case when p_action='delete' then 'products.disable' else 'products.update' end);
 if public.tenh_request_branch(p_business_id) is not null and public.tenh_request_branch(p_business_id)<>p_branch_id then raise exception 'This branch is not assigned to your account.';end if;
 perform public.tenh_assert_plan_branch(p_business_id,p_branch_id);
 select * into p from public.products where id=p_bundle_id and business_id=p_business_id and product_type='bundle' for update;
 if not found then raise exception 'Bundle not found.';end if;
 if p.updated_at is distinct from p_expected then raise exception 'This bundle changed. Refresh and try again.';end if;
 if p_action='edit' then
  if length(trim(coalesce(p_input->>'name',''))) not between 2 and 160 or length(trim(coalesce(p_input->>'sku',''))) not between 1 and 100 then raise exception 'Enter a name and SKU.';end if;
  if coalesce(p_input->>'price','') !~ '^\d+(\.\d{1,2})?$' or (p_input->>'price')::numeric>99999999.99 then raise exception 'Enter a valid price.';end if;
  if length(coalesce(p_input->>'description',''))>2000 then raise exception 'Description must be under 2,000 characters.';end if;
  if nullif(p_input->>'categoryId','') is not null and not exists(select 1 from public.categories where business_id=p_business_id and id=(p_input->>'categoryId')::uuid) then raise exception 'Choose a category in this business.';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||lower(trim(p_input->>'sku')),20260924));
  if exists(select 1 from public.products where business_id=p_business_id and id<>p_bundle_id and lower(sku)=lower(trim(p_input->>'sku'))) then raise exception 'This SKU is already in use.';end if;
  update public.products set name=trim(p_input->>'name'),sku=trim(p_input->>'sku'),selling_price=(p_input->>'price')::numeric,description=nullif(p_input->>'description',''),category_id=nullif(p_input->>'categoryId','')::uuid,updated_at=clock_timestamp() where id=p.id;
 elsif p_action in ('pos','online') then
  if jsonb_typeof(p_input->'enabled') is distinct from 'boolean' then raise exception 'Choose a valid visibility setting.';end if;
  if (p_input->>'enabled')::boolean and not p.is_active then raise exception 'Activate this product in Products before showing it for sale.';end if;
  if p_action='pos' then update public.products set is_pos=(p_input->>'enabled')::boolean,updated_at=clock_timestamp() where id=p.id;
  else update public.products set is_online=(p_input->>'enabled')::boolean,updated_at=clock_timestamp() where id=p.id;end if;
 else
  if p.stock_quantity<>0 or exists(select 1 from public.product_location_stock where product_id=p.id and business_id=p_business_id and quantity<>0) then raise exception 'Unpack or transfer remaining stock before deleting. You can hide this bundle instead.';end if;
  foreach t in array array['order_items','return_items','purchase_items','purchase_order_items','stock_transfer_items','inventory_movements','stock_adjustments'] loop
   if exists(select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='product_id') then
    execute format('select exists(select 1 from public.%I where product_id=$1)',t) into used using p.id;
    if used then raise exception 'This bundle has transaction history. Turn off POS and Online visibility to keep the history safe.';end if;
   end if;
  end loop;
  if exists(select 1 from public.tenh_pos_holds where business_id=p_business_id and draft::text like '%'||p.id::text||'%') then raise exception 'This bundle is in a held sale. Remove it from that sale before deleting.';end if;
  delete from public.products where id=p.id;
 end if;
 insert into public.audit_logs(business_id,user_id,action,entity_type,entity_id,description,metadata)
 values(p_business_id,auth.uid(),case when p_action='delete' then 'delete' else 'update' end,'product',p.id,'Bundle '||p_action||': '||p.name,jsonb_build_object('branchId',p_branch_id,'changes',p_input));
end;$$;
revoke all on function public.tenh_manage_bundle(uuid,uuid,uuid,text,jsonb,timestamptz) from public,anon;
grant execute on function public.tenh_manage_bundle(uuid,uuid,uuid,text,jsonb,timestamptz) to authenticated;

-- Keep POS visibility independent of active/online status. Reuse the existing
-- scoped catalogue and registered checkout, including branch and payment guards.
do $$begin
 if to_regprocedure('public.tenh_pos_catalog_scoped_before_visibility(uuid)') is null then
  alter function public.tenh_pos_catalog_scoped(uuid) rename to tenh_pos_catalog_scoped_before_visibility;
 end if;
end;$$;
create or replace function public.tenh_pos_catalog_scoped(p_business_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; items jsonb;
begin
 result:=public.tenh_pos_catalog_scoped_before_visibility(p_business_id);
 select coalesce(jsonb_agg(item),'[]') into items from jsonb_array_elements(result->'products') item
 where exists(select 1 from public.products p where p.id=(item->>'id')::uuid and p.business_id=p_business_id and p.is_pos);
 return jsonb_set(result,'{products}',items);
end;$$;
create or replace function public.tenh_pos_visible_order_item()
returns trigger language plpgsql security definer set search_path='' as $$
declare visible boolean;
begin
 if exists(select 1 from public.orders where id=new.order_id and coalesce(order_source,'pos')='pos') then
  select is_pos into visible from public.products where id=new.product_id for share;
  if visible=false then raise exception 'An item is hidden from POS. Remove it or refresh the catalogue.';end if;
 end if;
 return new;
end;$$;
-- Validate new sale lines only; completed-sale retries and returns are unchanged.
drop trigger if exists tenh_pos_visible_order_item on public.order_items;
create trigger tenh_pos_visible_order_item before insert on public.order_items for each row execute function public.tenh_pos_visible_order_item();
revoke all on function public.tenh_pos_catalog_scoped_before_visibility(uuid) from public,anon,authenticated;
revoke all on function public.tenh_pos_catalog_scoped(uuid) from public,anon;
grant execute on function public.tenh_pos_catalog_scoped(uuid) to authenticated;
commit;
