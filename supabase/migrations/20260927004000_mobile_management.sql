begin;
-- Durable outcomes keep interrupted mobile saves from creating duplicate records.
create table if not exists public.mobile_management_requests(
  business_id uuid not null references public.businesses(id) on delete cascade,
  request_id uuid not null, user_id uuid not null, branch_id uuid not null,
  operation text not null, input jsonb not null, result jsonb,
  created_at timestamptz not null default now(), primary key(business_id,request_id)
);
alter table public.mobile_management_requests enable row level security;
revoke all on public.mobile_management_requests from public,anon,authenticated;

create or replace function public.tenh_mobile_management(p_business_id uuid,p_branch_id uuid,p_request_id uuid,p_operation text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare saved public.mobile_management_requests%rowtype; v_result jsonb; permission text; target uuid;
  item jsonb; product public.branch_product_details%rowtype; transfer public.stock_transfers%rowtype;
  store public.business_storefronts%rowtype; supplier public.suppliers%rowtype;
  v_total numeric:=0; v_quantity integer; price numeric; cost numeric; threshold integer; category uuid;
  mode text; kind text; row_id uuid; ids jsonb:='[]'; option_group jsonb; option_item jsonb; group_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to continue.' using errcode='42501'; end if;
  permission:=case p_operation when 'product-create' then 'products.create' when 'product-edit' then 'products.update'
    when 'bundle-create' then 'products.create' when 'bundle-edit' then 'products.update' when 'bundle-toggle' then 'products.update' when 'bundle-pack' then 'products.stock_adjust'
    when 'bundle-delete' then 'products.disable' when 'purchase-create' then 'purchases.create' when 'transfer-save' then 'transfers.manage' when 'storefront-save' then 'storefront.update' end;
  if permission is null then raise exception 'Unsupported operation.'; end if;
  perform public.tenh_assert_effective_permission(p_business_id,permission);
  if p_branch_id is null or public.tenh_request_branch(p_business_id) is distinct from p_branch_id then raise exception 'Your operating branch changed.' using errcode='42501'; end if;
  perform public.tenh_assert_plan_branch(p_business_id,p_branch_id);
  if not exists(select 1 from business_locations where id=p_branch_id and business_id=p_business_id and is_active and not coalesce(plan_disable_pending,false)) then raise exception 'This branch is unavailable.'; end if;
  if p_request_id is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>65536 then raise exception 'Invalid save request.'; end if;
  insert into public.mobile_management_requests(business_id,request_id,user_id,branch_id,operation,input)
    values(p_business_id,p_request_id,auth.uid(),p_branch_id,p_operation,p_input) on conflict do nothing;
  select * into saved from public.mobile_management_requests where business_id=p_business_id and request_id=p_request_id for update;
  if saved.user_id<>auth.uid() or saved.branch_id<>p_branch_id or saved.operation<>p_operation or saved.input<>p_input then raise exception 'This request belongs to different details.'; end if;
  if saved.result is not null then return saved.result; end if;
  begin
    if nullif(p_input->>'imageUrl','') is not null then
      if p_input->>'imagePath' is null
        or p_input->>'imagePath' !~ ('^'||p_business_id::text||'/'||auth.uid()::text||'/'||p_request_id::text||'-[0-9a-f]{64}\.(jpg|png|webp)$')
        or p_input->>'imageUrl' !~ '^https://[^/]+/storage/v1/object/public/product-images/'
        or right(p_input->>'imageUrl',length('/storage/v1/object/public/product-images/'||(p_input->>'imagePath'))) <> '/storage/v1/object/public/product-images/'||(p_input->>'imagePath')
        or not exists(select 1 from storage.objects where bucket_id='product-images' and name=p_input->>'imagePath') then raise exception 'Upload a valid product image before saving.'; end if;
    end if;
    if p_operation='bundle-create' then
      item:=p_input||jsonb_build_object('sellingPrice',p_input->>'price','isPos',coalesce((p_input->>'showPos')::boolean,true),'isOnline',coalesce((p_input->>'showOnline')::boolean,true));
      if nullif(p_input->>'imageUrl','') is not null then
        target:=public.tenh_create_packed_bundle_with_image(p_business_id,p_branch_id,p_request_id,item);
      else target:=public.tenh_create_packed_bundle(p_business_id,p_branch_id,p_request_id,item); end if;
      update products set is_pos=coalesce((p_input->>'showPos')::boolean,true),is_online=coalesce((p_input->>'showOnline')::boolean,true),is_active=coalesce((p_input->>'showPos')::boolean,true) or coalesce((p_input->>'showOnline')::boolean,true) where business_id=p_business_id and id=target;
      update branch_product_details set is_pos=coalesce((p_input->>'showPos')::boolean,true),is_online=coalesce((p_input->>'showOnline')::boolean,true),is_active=coalesce((p_input->>'showPos')::boolean,true) or coalesce((p_input->>'showOnline')::boolean,true) where business_id=p_business_id and location_id=p_branch_id and id=target;
      v_result:=jsonb_build_object('success',true,'id',target);
    elsif p_operation in ('bundle-edit','bundle-toggle','bundle-delete') then
      if p_operation='bundle-toggle' and (p_input->>'action') not in ('pos','online') then raise exception 'Invalid display setting.'; end if;
      perform public.tenh_manage_bundle(p_business_id,p_branch_id,(p_input->>'id')::uuid,case when p_operation='bundle-edit' then 'edit' when p_operation='bundle-delete' then 'delete' else p_input->>'action' end,p_input,(p_input->>'expected')::timestamptz);
      v_result:=jsonb_build_object('success',true);
    elsif p_operation='bundle-pack' then
      perform public.tenh_pack_bundle(p_business_id,p_branch_id,(p_input->>'id')::uuid,(p_input->>'quantity')::integer,p_request_id);
      v_result:=jsonb_build_object('success',true);
    elsif p_operation in ('product-create','product-edit') then
      if length(btrim(coalesce(p_input->>'name','')))<2 or length(p_input->>'name')>160 then raise exception 'Enter a product name (2–160 characters).'; end if;
      category:=nullif(p_input->>'categoryId','')::uuid;
      if category is not null and not exists(select 1 from categories where id=category and business_id=p_business_id and (branch_ids is null or p_branch_id=any(branch_ids))) then raise exception 'Choose a category in this branch.'; end if;
      if p_operation='product-edit' then
        target:=(p_input->>'id')::uuid;
        select * into product from branch_product_details where business_id=p_business_id and location_id=p_branch_id and id=target and not branch_archived for update;
        if not found or product.product_type='bundle' then raise exception 'Product not found. Use the bundle editor for bundles.'; end if;
        if product.updated_at is distinct from (p_input->>'expected')::timestamptz then raise exception 'Product changed. Reload before saving.'; end if;
      end if;
      if p_operation='product-create' then
        select product_mode into mode from businesses where id=p_business_id;
        kind:=coalesce(p_input->>'type','standard');
        if coalesce(mode,'') not in ('standard','variant','configurable') or kind not in ('standard','variant','configurable') or (mode='variant' and kind<>'variant') or (mode='configurable' and kind<>'configurable') or (mode='standard' and kind='configurable') then raise exception 'Choose the product type for this business.'; end if;
        if jsonb_typeof(p_input->'variants') is distinct from 'array' or jsonb_array_length(p_input->'variants') not between 1 and 40 then raise exception 'Add 1–40 product rows.'; end if;
        if kind<>'variant' and jsonb_array_length(p_input->'variants')<>1 then raise exception 'Use one row for this product type.'; end if;
        if kind='variant' and (select count(distinct (lower(btrim(value->>'size')),lower(btrim(value->>'color')))) from jsonb_array_elements(p_input->'variants'))<>jsonb_array_length(p_input->'variants') then raise exception 'Each size and colour combination must be unique.'; end if;
      end if;
      for item in select value from jsonb_array_elements(case when p_operation='product-edit' then jsonb_build_array(p_input) else p_input->'variants' end) loop
        if length(btrim(coalesce(item->>'sku','')))<1 or length(item->>'sku')>80 then raise exception 'Enter a SKU (up to 80 characters).'; end if;
        price:=(item->>'price')::numeric; cost:=(item->>'cost')::numeric; threshold:=(item->>'lowStock')::integer;
        if price is null or cost is null or threshold is null or price not between 0 and 999999999 or cost not between 0 and 999999999 or threshold not between 0 and 999999 or price<>round(price,2) or cost<>round(cost,2) then raise exception 'Enter valid prices and low-stock quantity.'; end if;
        if (kind='variant' or product.product_type='variant') and (nullif(btrim(item->>'size'),'') is null or nullif(btrim(item->>'color'),'') is null) then raise exception 'Each variant needs size and colour.'; end if;
        if p_operation='product-create' then
          if kind='variant' and (nullif(btrim(item->>'size'),'') is null or nullif(btrim(item->>'color'),'') is null) then raise exception 'Each variant needs size and colour.'; end if;
          if exists(select 1 from products where business_id=p_business_id and (lower(sku)=lower(item->>'sku') or barcode=coalesce(nullif(item->>'barcode',''),item->>'sku'))) then raise exception 'SKU or barcode already exists.'; end if;
          row_id:=gen_random_uuid();
          insert into products(id,business_id,owner_id,category_id,name,sku,barcode,description,cost_price,selling_price,stock_quantity,low_stock_quantity,is_active,is_pos,is_online,product_type,variant_group_id,size,color,image_url)
          values(row_id,p_business_id,auth.uid(),category,btrim(p_input->>'name'),btrim(item->>'sku'),coalesce(nullif(item->>'barcode',''),item->>'sku'),p_input->>'description',cost,price,0,threshold,true,coalesce((p_input->>'showPos')::boolean,true),coalesce((p_input->>'showOnline')::boolean,true),kind,case when kind='variant' then p_request_id else null end,nullif(item->>'size',''),nullif(item->>'color',''),nullif(p_input->>'imageUrl',''));
          insert into product_location_stock(business_id,location_id,product_id,quantity,low_stock_threshold) values(p_business_id,p_branch_id,row_id,0,threshold) on conflict(location_id,product_id) do nothing;
          ids:=ids||jsonb_build_array(row_id);
        else
          update branch_products set name=btrim(p_input->>'name'),sku=btrim(item->>'sku'),barcode=coalesce(nullif(item->>'barcode',''),item->>'sku'),description=p_input->>'description',category_id=category,cost_price=cost,selling_price=price,low_stock_quantity=threshold,size=nullif(item->>'size',''),color=nullif(item->>'color',''),is_pos=coalesce((p_input->>'showPos')::boolean,true),is_online=coalesce((p_input->>'showOnline')::boolean,true),is_active=coalesce((p_input->>'active')::boolean,true),variant_image_url=case when p_input ? 'imageUrl' then nullif(p_input->>'imageUrl','') else product.variant_image_url end,image_url=case when p_input ? 'imageUrl' then nullif(p_input->>'imageUrl','') else product.image_url end where business_id=p_business_id and id=target;
          ids:=jsonb_build_array(target);
        end if;
      end loop;
      if p_operation='product-create' and kind='configurable' then
        if jsonb_typeof(p_input->'groups') is distinct from 'array' or jsonb_array_length(p_input->'groups') not between 1 and 12 then raise exception 'Add 1–12 option groups.'; end if;
        for option_group in select value from jsonb_array_elements(p_input->'groups') loop
          if nullif(btrim(option_group->>'name'),'') is null or jsonb_typeof(option_group->'options') is distinct from 'array' or jsonb_array_length(option_group->'options') not between 1 and 30 then raise exception 'Each option group needs a name and 1–30 options.'; end if;
          group_id:=gen_random_uuid();
          insert into product_option_groups(id,business_id,product_id,name,selection_type,is_required,min_selections,max_selections,sort_order)
            values(group_id,p_business_id,row_id,option_group->>'name','single',coalesce((option_group->>'required')::boolean,false),case when (option_group->>'required')::boolean then 1 else 0 end,1,0);
          for option_item in select value from jsonb_array_elements(option_group->'options') loop
            if nullif(btrim(option_item->>'name'),'') is null or (option_item->>'price')::numeric is null or (option_item->>'price')::numeric not between 0 and 999999999 then raise exception 'Enter a name and valid option price.'; end if;
            insert into product_options(id,business_id,product_id,group_id,name,price_adjustment,is_default,is_active,sort_order) values(gen_random_uuid(),p_business_id,row_id,group_id,option_item->>'name',(option_item->>'price')::numeric,false,true,0);
          end loop;
        end loop;
      end if;
      v_result:=jsonb_build_object('success',true,'ids',ids);
    elsif p_operation in ('purchase-create','transfer-save') then
      if jsonb_typeof(p_input->'items') is distinct from 'array' or jsonb_array_length(p_input->'items') not between 1 and 100 then raise exception 'Choose 1–100 items.'; end if;
      if (select count(distinct value->>'productId') from jsonb_array_elements(p_input->'items'))<>jsonb_array_length(p_input->'items') then raise exception 'Choose each product once.'; end if;
      target:=coalesce(nullif(p_input->>'id','')::uuid,p_request_id);
      if p_operation='purchase-create' then
        select * into supplier from suppliers where id=(p_input->>'supplierId')::uuid and business_id=p_business_id and location_id=p_branch_id and is_active;
        if not found then raise exception 'Choose an active supplier in this branch.'; end if;
        insert into purchase_orders(id,business_id,location_id,supplier_id,supplier_name,po_number,status,order_date,expected_date,notes,created_by,subtotal,total)
          values(target,p_business_id,p_branch_id,supplier.id,supplier.name,'PO-'||upper(replace(target::text,'-','')),'draft',current_date,nullif(p_input->>'expectedDate','')::date,p_input->>'note',auth.uid(),0,0);
      else
        perform public.tenh_assert_plan_branch(p_business_id,(p_input->>'destinationId')::uuid);
        if not exists(select 1 from business_locations where business_id=p_business_id and id=(p_input->>'destinationId')::uuid and id<>p_branch_id and is_active and not coalesce(plan_disable_pending,false)) then raise exception 'Choose another active destination branch.'; end if;
        if nullif(p_input->>'id','') is not null then
          select * into transfer from stock_transfers where id=target and business_id=p_business_id and source_location_id=p_branch_id for update;
          if not found or transfer.status<>'draft' or transfer.updated_at is distinct from (p_input->>'expected')::timestamptz then raise exception 'Draft changed. Reload before editing.'; end if;
          update stock_transfers set destination_location_id=(p_input->>'destinationId')::uuid,note=p_input->>'note',updated_at=now() where id=target;
          delete from stock_transfer_items where transfer_id=target;
        else
          insert into stock_transfers(id,business_id,transfer_number,source_location_id,destination_location_id,status,note,created_by) values(target,p_business_id,'TR-'||upper(replace(target::text,'-','')),p_branch_id,(p_input->>'destinationId')::uuid,'draft',p_input->>'note',auth.uid());
        end if;
      end if;
      for item in select value from jsonb_array_elements(p_input->'items') loop
        v_quantity:=(item->>'quantity')::integer;
        if v_quantity is null or v_quantity not between 1 and 999999 or v_quantity::numeric<>(item->>'quantity')::numeric then raise exception 'Enter a positive whole quantity.'; end if;
        select * into product from branch_product_details where business_id=p_business_id and location_id=p_branch_id and id=(item->>'productId')::uuid and is_active and not branch_archived;
        if not found or product.product_type='bundle' then raise exception 'Choose individual products in this branch. Use Pack for bundles.'; end if;
        if p_operation='purchase-create' then
          cost:=(item->>'cost')::numeric;
          if cost is null or cost not between 0 and 999999999 or cost<>round(cost,2) then raise exception 'Enter a valid unit cost.'; end if;
          insert into purchase_order_items(business_id,purchase_order_id,product_id,product_name,sku,ordered_quantity,received_quantity,unit_cost) values(p_business_id,target,product.id,product.name,product.sku,v_quantity,0,cost);
          v_total:=v_total+round(cost,2)*v_quantity;
        else
          if not exists(select 1 from product_location_stock where business_id=p_business_id and location_id=p_branch_id and product_id=product.id and product_location_stock.quantity>=v_quantity) then raise exception 'Not enough stock in this branch.'; end if;
          insert into stock_transfer_items(business_id,transfer_id,product_id,quantity) values(p_business_id,target,product.id,v_quantity);
        end if;
      end loop;
      if p_operation='purchase-create' then update purchase_orders set subtotal=v_total,total=v_total where id=target; end if;
      v_result:=jsonb_build_object('success',true,'id',target);
    elsif p_operation='storefront-save' then
      select * into store from business_storefronts where business_id=p_business_id for update;
      if not found then raise exception 'Set up the Online Store on the website first.'; end if;
      if store.updated_at is distinct from (p_input->>'expected')::timestamptz then raise exception 'Store settings changed. Reload before saving.'; end if;
      if coalesce((p_input->>'acceptOrders')::boolean,false) and (not (coalesce(store.allow_pickup,false) or coalesce(store.allow_delivery,false) or coalesce(store.allow_dine_in,false)) or not (coalesce(store.accept_cod,false) or coalesce(store.accept_khqr,false))) then raise exception 'Enable fulfillment and a payment method on the website first.'; end if;
      if length(btrim(coalesce(p_input->>'name','')))<2 or length(p_input->>'name')>80 or length(p_input->>'description')>500 or length(p_input->>'phone')>40 or length(p_input->>'address')>500 then raise exception 'Check store name and contact details.'; end if;
      update business_storefronts set display_name=btrim(p_input->>'name'),description=p_input->>'description',phone=p_input->>'phone',address=p_input->>'address',is_published=coalesce((p_input->>'published')::boolean,false),accept_online_orders=coalesce((p_input->>'acceptOrders')::boolean,false),updated_at=now() where business_id=p_business_id;
      v_result:=jsonb_build_object('success',true);
    end if;
  exception when others then
    v_result:=jsonb_build_object('success',false,'rolledBack',true,'message',sqlerrm);
  end;
  update mobile_management_requests set result=v_result where business_id=p_business_id and request_id=p_request_id;
  return v_result;
end $$;
revoke all on function public.tenh_mobile_management(uuid,uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.tenh_mobile_management(uuid,uuid,uuid,text,jsonb) to authenticated;
create or replace function public.tenh_mobile_management_status(p_business_id uuid,p_branch_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare saved public.mobile_management_requests%rowtype;
begin
 if auth.uid() is null or p_branch_id is null or public.tenh_request_branch(p_business_id) is distinct from p_branch_id then raise exception 'Sign in to the same branch.' using errcode='42501'; end if;
 perform public.tenh_assert_plan_branch(p_business_id,p_branch_id);
 select * into saved from mobile_management_requests where business_id=p_business_id and request_id=p_request_id and branch_id=p_branch_id and user_id=auth.uid();
 if not found then return null; end if;
 perform public.tenh_assert_effective_permission(p_business_id,case saved.operation when 'bundle-delete' then 'products.disable' when 'product-create' then 'products.create' when 'bundle-create' then 'products.create' when 'bundle-pack' then 'products.stock_adjust' when 'product-edit' then 'products.update' when 'bundle-edit' then 'products.update' when 'bundle-toggle' then 'products.update' when 'purchase-create' then 'purchases.create' when 'transfer-save' then 'transfers.manage' when 'storefront-save' then 'storefront.update' end);
 return saved.result;
end $$;
revoke all on function public.tenh_mobile_management_status(uuid,uuid,uuid) from public,anon;
grant execute on function public.tenh_mobile_management_status(uuid,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
