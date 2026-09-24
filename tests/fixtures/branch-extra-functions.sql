CREATE OR REPLACE FUNCTION public.tenh_user_permission_allowed(p_business uuid, p_user uuid, p_permission text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r text; member uuid; override_value boolean;
begin
 select m.role::text,m.id into r,member from public.business_members m
 where m.business_id=p_business and m.user_id=p_user and m.is_active and not coalesce(m.team_password_required,false);
 if r is null then return false; end if;
 if r='owner' then return true; end if;
 select enabled into override_value from public.business_member_permissions where member_id=member and permission=p_permission;
 if found then return override_value; end if;
 if r in ('manager','staff','cashier') then
  select enabled into override_value from public.business_role_permissions where business_id=p_business and role=r and permission=p_permission;
  if found then return override_value; end if;
 end if;
 return public.tenh_default_role_permission(r,p_permission);
end; $function$
;
CREATE OR REPLACE FUNCTION public.tenh_create_packed_bundle(p_business_id uuid, p_branch_id uuid, p_request_id uuid, p_input jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r jsonb; p public.products%rowtype; g record; ids uuid[]; selected jsonb; n integer; total_cost numeric:=0;
 bundle_id uuid:=gen_random_uuid(); item_count integer; prior public.bundle_stock_requests%rowtype; digest text:=md5(p_input::text||p_branch_id::text);
begin
 perform public.tenh_assert_effective_permission(p_business_id,'products.create');
 if public.tenh_request_branch(p_business_id) is not null and public.tenh_request_branch(p_business_id)<>p_branch_id then raise exception 'This branch is not assigned to your account.';end if;
 perform public.tenh_assert_plan_branch(p_business_id,p_branch_id);
 if p_request_id is null or p_input is null or octet_length(p_input::text)>100000 then raise exception 'Invalid bundle request.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||p_request_id::text,20260924));
 select * into prior from public.bundle_stock_requests where business_id=p_business_id and request_id=p_request_id;
 if found then
  if prior.user_id<>auth.uid() or prior.payload_hash<>digest then raise exception 'This request was already used. Reload and try again.';end if;
  return prior.result;
 end if;
 if length(trim(coalesce(p_input->>'name',''))) not between 2 and 160 or length(trim(coalesce(p_input->>'sku',''))) not between 1 and 100 then raise exception 'Enter a bundle name and SKU.';end if;
 if coalesce(p_input->>'sellingPrice','') !~ '^\d+(\.\d{1,2})?$' or (p_input->>'sellingPrice')::numeric>100000000 then raise exception 'Enter a valid selling price.';end if;
 if jsonb_typeof(p_input->'items') is distinct from 'array' then raise exception 'Choose at least two products.';end if;
 item_count:=jsonb_array_length(p_input->'items');
 if item_count not between 2 and 100 or item_count<>(select count(distinct value->>'productId') from jsonb_array_elements(p_input->'items')) then raise exception 'Choose 2–100 different products.';end if;
 if nullif(p_input->>'categoryId','') is not null and not exists(select 1 from public.categories where id=(p_input->>'categoryId')::uuid and business_id=p_business_id) then raise exception 'Choose a category in this business.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||lower(trim(p_input->>'sku')),20260924));
 if exists(select 1 from public.products where business_id=p_business_id and lower(sku)=lower(trim(p_input->>'sku'))) then raise exception 'This SKU is already in use.';end if;
 perform id from public.products where business_id=p_business_id and id in(select (value->>'productId')::uuid from jsonb_array_elements(p_input->'items')) order by id for update;
 insert into public.products(id,business_id,owner_id,name,sku,description,category_id,product_type,bundle_stock_mode,cost_price,selling_price,stock_quantity,low_stock_quantity,is_active,is_online)
 values(bundle_id,p_business_id,auth.uid(),trim(p_input->>'name'),trim(p_input->>'sku'),nullif(p_input->>'description',''),nullif(p_input->>'categoryId','')::uuid,'bundle','packed',0,(p_input->>'sellingPrice')::numeric,0,1,true,false);
 for r in select value from jsonb_array_elements(p_input->'items') loop
  if coalesce(r->>'quantity','') !~ '^\d+$' or (r->>'quantity')::numeric not between 1 and 999 then raise exception 'Component quantities must be whole numbers from 1 to 999.';end if;
  select * into p from public.products where id=(r->>'productId')::uuid and business_id=p_business_id and is_active and product_type<>'bundle';
  if not found or not exists(select 1 from public.product_location_stock where product_id=p.id and business_id=p_business_id and location_id=p_branch_id) then raise exception 'Choose active component products assigned to this branch.';end if;
  if jsonb_typeof(coalesce(r->'optionIds','[]'))<>'array' then raise exception 'Invalid component options.';end if;
  select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(coalesce(r->'optionIds','[]'));
  if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception 'Duplicate component options.';end if;
  if p.product_type<>'configurable' and cardinality(ids)>0 then raise exception 'This product does not support options.';end if;
  if cardinality(ids)<>(select count(*) from public.product_options where product_id=p.id and business_id=p_business_id and is_active and id=any(ids)) then raise exception 'A selected option is unavailable.';end if;
  for g in select * from public.product_option_groups where product_id=p.id and business_id=p_business_id loop
   select count(*) into n from public.product_options where group_id=g.id and id=any(ids);
   if n<greatest(g.min_selections,case when g.is_required then 1 else 0 end) or n>(case when g.selection_type='single' then 1 else g.max_selections end) then raise exception 'Choose the required options for %: %.',p.name,g.name;end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'groupName',og.name,'priceAdjustment',o.price_adjustment) order by o.id),'[]') into selected from public.product_options o join public.product_option_groups og on og.id=o.group_id and og.product_id=p.id where o.id=any(ids);
  if jsonb_array_length(selected)<>cardinality(ids) then raise exception 'An option group is unavailable.';end if;
  insert into public.bundle_items(business_id,bundle_product_id,component_product_id,quantity,selected_options) values(p_business_id,bundle_id,p.id,(r->>'quantity')::integer,selected);
  total_cost:=total_cost+p.cost_price*(r->>'quantity')::integer;
 end loop;
 update public.products set cost_price=total_cost where id=bundle_id;
 insert into public.product_location_stock(business_id,location_id,product_id,quantity,low_stock_threshold) values(p_business_id,p_branch_id,bundle_id,0,1);
 insert into public.audit_logs(business_id,user_id,action,entity_type,entity_id,description,metadata) values(p_business_id,auth.uid(),'create','product',bundle_id,'Created packed bundle',jsonb_build_object('branchId',p_branch_id,'items',p_input->'items'));
 insert into public.bundle_stock_requests(business_id,request_id,user_id,payload_hash,result) values(p_business_id,p_request_id,auth.uid(),digest,bundle_id);
 return bundle_id;
end;$function$
;
CREATE OR REPLACE FUNCTION public.tenh_manage_bundle(p_business_id uuid, p_branch_id uuid, p_bundle_id uuid, p_action text, p_input jsonb, p_expected timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.products%rowtype; t text; used boolean;
begin
 if p_action is null or p_action not in ('edit','pos','online','delete') then raise exception 'Choose a valid bundle action.';end if;
 perform public.tenh_assert_effective_permission(p_business_id,case when p_action='delete' then 'products.disable' else 'products.update' end);
 if public.tenh_request_branch(p_business_id) is not null and public.tenh_request_branch(p_business_id)<>p_branch_id then raise exception 'This branch is not assigned to your account.';end if;
 perform public.tenh_assert_plan_branch(p_business_id,p_branch_id);
 perform pg_advisory_xact_lock(hashtextextended('bundle-recipe:'||p_business_id::text||p_bundle_id::text,20260924));

 -- Match the packer lock order, including both old and proposed component rows.
 perform id from public.products where business_id=p_business_id and (id=p_bundle_id
   or id in(select component_product_id from public.bundle_items where business_id=p_business_id and bundle_product_id=p_bundle_id)
   or id in(select (value->>'productId')::uuid from jsonb_array_elements(case when jsonb_typeof(p_input->'items')='array' then p_input->'items' else '[]'::jsonb end))) order by id for update;
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
  perform public.tenh_edit_bundle_contents(p_business_id,p_branch_id,p_bundle_id,p_input);
 elsif p_action in ('pos','online') then
  if jsonb_typeof(p_input->'enabled') is distinct from 'boolean' then raise exception 'Choose a valid visibility setting.';end if;

  if p_action='pos' then update public.products set is_active=((p_input->>'enabled')::boolean or coalesce(p.is_online,false)),is_pos=(p_input->>'enabled')::boolean,updated_at=clock_timestamp() where id=p.id;
  else update public.products set is_active=((p_input->>'enabled')::boolean or coalesce(p.is_pos,false)),is_online=(p_input->>'enabled')::boolean,updated_at=clock_timestamp() where id=p.id;end if;
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
end;$function$
;
CREATE OR REPLACE FUNCTION public.tenh_pack_bundle(p_business_id uuid, p_branch_id uuid, p_bundle_id uuid, p_quantity integer, p_request_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r record; before_qty integer; units integer; prior public.bundle_stock_requests%rowtype;
 digest text:=md5(jsonb_build_array(p_branch_id,p_bundle_id,p_quantity)::text); bundle public.products%rowtype;
begin
 perform public.tenh_assert_effective_permission(p_business_id,'products.stock_adjust');
 if public.tenh_request_branch(p_business_id) is not null and public.tenh_request_branch(p_business_id)<>p_branch_id then raise exception 'This branch is not assigned to your account.';end if;
 perform public.tenh_assert_plan_branch(p_business_id,p_branch_id);
 perform pg_advisory_xact_lock(hashtextextended('bundle-recipe:'||p_business_id::text||p_bundle_id::text,20260924));
 if p_quantity is null or p_quantity=0 or abs(p_quantity::bigint)>999 or p_request_id is null then raise exception 'Choose 1–999 sets to pack or unpack.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||p_request_id::text,20260924));
 select * into prior from public.bundle_stock_requests where business_id=p_business_id and request_id=p_request_id;
 if found then
  if prior.user_id<>auth.uid() or prior.payload_hash<>digest then raise exception 'This request was already used. Reload and try again.';end if;
  return prior.result;
 end if;
 -- Match POS lock ordering. Lock all products before any branch stock rows.
 perform id from public.products where business_id=p_business_id and (id=p_bundle_id or id in(select component_product_id from public.bundle_items where bundle_product_id=p_bundle_id and business_id=p_business_id)) order by id for update;
 select * into bundle from public.products where business_id=p_business_id and id=p_bundle_id and product_type='bundle' and bundle_stock_mode='packed';
 if not found or (p_quantity>0 and not bundle.is_active) then raise exception 'Choose an active packed bundle.';end if;
 if (select count(*) from public.bundle_items where bundle_product_id=p_bundle_id and business_id=p_business_id)<2 then raise exception 'Bundle components are incomplete.';end if;
 for r in
  select p.id,p.name,p.is_active,p.stock_quantity,-bi.quantity*p_quantity delta from public.bundle_items bi join public.products p on p.id=bi.component_product_id and p.business_id=bi.business_id where bi.bundle_product_id=p_bundle_id and bi.business_id=p_business_id
  union all select bundle.id,bundle.name,bundle.is_active,bundle.stock_quantity,p_quantity
  order by id
 loop
  if p_quantity>0 and not r.is_active then raise exception '% is inactive.',r.name;end if;
  select quantity into before_qty from public.product_location_stock where business_id=p_business_id and product_id=r.id and location_id=p_branch_id for update;
  if not found then
   if r.id<>p_bundle_id then raise exception '% is not assigned to this branch.',r.name;end if;
   insert into public.product_location_stock(business_id,location_id,product_id,quantity,low_stock_threshold) values(p_business_id,p_branch_id,r.id,0,1);
   before_qty:=0;
  end if;
  units:=before_qty+r.delta;
  if units<0 or r.stock_quantity+r.delta<0 then raise exception 'Not enough % in this branch.',r.name;end if;
  update public.product_location_stock set quantity=units,updated_at=now() where business_id=p_business_id and product_id=r.id and location_id=p_branch_id;
  update public.products set stock_quantity=stock_quantity+r.delta,updated_at=now() where business_id=p_business_id and id=r.id;
  insert into public.stock_adjustments(business_id,location_id,product_id,adjustment_type,quantity_delta,stock_before,stock_after,reason,reference,created_by)
  values(p_business_id,p_branch_id,r.id,case when r.delta>0 then 'increase' else 'decrease' end,r.delta,before_qty,units,case when p_quantity>0 then 'Pack bundle: ' else 'Unpack bundle: ' end||bundle.name,p_request_id::text,auth.uid());
 end loop;
 insert into public.audit_logs(business_id,user_id,action,entity_type,entity_id,description,metadata) values(p_business_id,auth.uid(),'update','product',p_bundle_id,case when p_quantity>0 then 'Packed bundle stock' else 'Unpacked bundle stock' end,jsonb_build_object('branchId',p_branch_id,'quantity',p_quantity,'requestId',p_request_id));
 insert into public.bundle_stock_requests(business_id,request_id,user_id,payload_hash,result) values(p_business_id,p_request_id,auth.uid(),digest,p_bundle_id);
 return p_bundle_id;
end;$function$
;
CREATE OR REPLACE FUNCTION public.tenh_edit_bundle_contents(p_business_id uuid, p_branch_id uuid, p_bundle_id uuid, p_input jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  incoming jsonb; existing jsonb; row_input jsonb; component public.products%rowtype;
  option_ids uuid[]; selected jsonb; group_row record; chosen_count integer;
  total_cost numeric := 0; v_table_name text; used boolean; image_path text; v_image_url text;
begin
  perform public.tenh_assert_effective_permission(p_business_id, 'products.update');
  if p_input ? 'items' then
    if jsonb_typeof(p_input->'items') is distinct from 'array' or jsonb_array_length(p_input->'items') not between 2 and 100 then
      raise exception 'Choose 2–100 different products.';
    end if;
    select jsonb_agg(jsonb_build_object('productId', value->>'productId', 'quantity', (value->>'quantity')::numeric,
      'optionIds', (select coalesce(jsonb_agg(o order by o), '[]') from jsonb_array_elements_text(coalesce(value->'optionIds','[]')) o)) order by value->>'productId')
      into incoming from jsonb_array_elements(p_input->'items');
    select jsonb_agg(jsonb_build_object('productId', component_product_id::text, 'quantity', quantity,
      'optionIds', (select coalesce(jsonb_agg(o->>'id' order by o->>'id'), '[]') from jsonb_array_elements(selected_options) o)) order by component_product_id::text)
      into existing from public.bundle_items where business_id=p_business_id and bundle_product_id=p_bundle_id;
    if incoming is distinct from existing then
      if exists(select 1 from public.products where id=p_bundle_id and stock_quantity<>0)
        or exists(select 1 from public.product_location_stock where business_id=p_business_id and product_id=p_bundle_id and quantity<>0) then
        raise exception 'Unpack all sets in every branch before changing the included items.';
      end if;
      foreach v_table_name in array array['order_items','return_items','purchase_items','purchase_order_items','stock_transfer_items'] loop
        if exists(select 1 from information_schema.columns where table_schema='public' and information_schema.columns.table_name=v_table_name and column_name='product_id') then
          execute format('select exists(select 1 from public.%I where product_id=$1)',v_table_name) into used using p_bundle_id;
          if used then raise exception 'This bundle has sales or transaction history. Create a new bundle for different items; images and details can still be edited.'; end if;
        end if;
      end loop;
      if exists(select 1 from public.tenh_pos_holds where business_id=p_business_id and draft::text like '%'||p_bundle_id::text||'%') then
        raise exception 'Remove this bundle from held orders before changing its items.';
      end if;
      if jsonb_array_length(p_input->'items')<>(select count(distinct value->>'productId') from jsonb_array_elements(p_input->'items')) then
        raise exception 'Choose different products for each item.';
      end if;
      insert into public.bundle_recipe_edit_sessions values(p_bundle_id,txid_current(),auth.uid());
      delete from public.bundle_items where business_id=p_business_id and bundle_product_id=p_bundle_id;
      for row_input in select value from jsonb_array_elements(p_input->'items') loop
        if coalesce(row_input->>'quantity','') !~ '^\d+$' or (row_input->>'quantity')::numeric not between 1 and 999 then
          raise exception 'Component quantities must be whole numbers from 1 to 999.';
        end if;
        select * into component from public.products where business_id=p_business_id and id=(row_input->>'productId')::uuid and is_active and product_type<>'bundle';
        if not found or not exists(select 1 from public.product_location_stock where business_id=p_business_id and product_id=component.id and location_id=p_branch_id) then
          raise exception 'Choose active component products assigned to this branch.';
        end if;
        select coalesce(array_agg(value::uuid),'{}') into option_ids from jsonb_array_elements_text(coalesce(row_input->'optionIds','[]'));
        if cardinality(option_ids)<>(select count(distinct x) from unnest(option_ids) x) then raise exception 'Duplicate component options.'; end if;
        if component.product_type<>'configurable' and cardinality(option_ids)>0 then raise exception 'This product does not support options.'; end if;
        if cardinality(option_ids)<>(select count(*) from public.product_options where product_id=component.id and business_id=p_business_id and is_active and id=any(option_ids)) then raise exception 'A selected option is unavailable.'; end if;
        for group_row in select * from public.product_option_groups where product_id=component.id and business_id=p_business_id loop
          select count(*) into chosen_count from public.product_options where group_id=group_row.id and id=any(option_ids);
          if chosen_count<greatest(group_row.min_selections,case when group_row.is_required then 1 else 0 end)
            or chosen_count>(case when group_row.selection_type='single' then 1 else group_row.max_selections end) then
            raise exception 'Choose the required options for %: %.',component.name,group_row.name;
          end if;
        end loop;
        select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'groupName',g.name,'priceAdjustment',o.price_adjustment) order by o.id),'[]') into selected
          from public.product_options o join public.product_option_groups g on g.id=o.group_id and g.product_id=component.id where o.id=any(option_ids);
        if jsonb_array_length(selected)<>cardinality(option_ids) then raise exception 'An option group is unavailable.'; end if;
        insert into public.bundle_items(business_id,bundle_product_id,component_product_id,quantity,selected_options)
          values(p_business_id,p_bundle_id,component.id,(row_input->>'quantity')::integer,selected);
        total_cost:=total_cost+component.cost_price*(row_input->>'quantity')::integer;
      end loop;
      update public.products set cost_price=total_cost where id=p_bundle_id and business_id=p_business_id;
      delete from public.bundle_recipe_edit_sessions where bundle_id=p_bundle_id and transaction_id=txid_current();
    end if;
  end if;
  if p_input ? 'imagePath' then
    image_path:=p_input->>'imagePath'; v_image_url:=p_input->>'imageUrl';
    if image_path is null or v_image_url is null
      or image_path !~ ('^'||p_business_id::text||'/'||auth.uid()::text||'/[0-9a-f-]{36}-[0-9a-f]{64}\.(jpg|png|webp)$')
      or v_image_url !~ '^https://[^/]+/storage/v1/object/public/product-images/'
      or right(v_image_url,length('/storage/v1/object/public/product-images/'||image_path))<>'/storage/v1/object/public/product-images/'||image_path
      or not exists(select 1 from storage.objects where bucket_id='product-images' and name=image_path) then raise exception 'Upload a valid bundle image before saving.'; end if;
    update public.products set image_url=v_image_url where id=p_bundle_id and business_id=p_business_id;
  elsif p_input->>'removeImage'='true' then
    update public.products set image_url=null where id=p_bundle_id and business_id=p_business_id;
  end if;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.refresh_business_notifications(p_business_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text;
begin
  select bm.role::text into v_role
  from public.business_members bm
  where bm.business_id = p_business_id
    and bm.user_id = auth.uid()
    and bm.is_active = true
  limit 1;

  if v_role is null then
    raise exception 'Not authorized for this business.';
  end if;

  update public.business_notifications
  set is_active = false, updated_at = now()
  where business_id = p_business_id
    and notification_type in (
      'new_order','khqr_pending','low_stock','purchase_order','stock_transfer',
      'register_variance','credit_overdue','scheduled_order'
    );

  insert into public.business_notifications (
    business_id, notification_key, notification_type, severity, title, message,
    href, target_roles, source_table, source_id, occurred_at, is_active, metadata, updated_at
  )
  select
    o.business_id,
    'new-order:' || o.id::text,
    'new_order',
    'info',
    'New online order',
    coalesce(o.order_number, 'Order') || coalesce(' · ' || nullif(o.guest_name,''), ''),
    '/dashboard/orders/' || o.id::text,
    coalesce((select rs.target_roles from public.business_notification_role_settings rs where rs.business_id=o.business_id and rs.notification_type='new_order'), array['owner','admin','manager','cashier']::text[]),
    'orders', o.id, o.created_at, true,
    jsonb_build_object('order_number',o.order_number,'source',o.order_source), now()
  from public.orders o
  where o.business_id = p_business_id
    and o.order_source in ('online','qr')
    and coalesce(o.online_status,'new') = 'new'
    and o.created_at >= now() - interval '7 days'
  on conflict (business_id, notification_key) do update set
    title=excluded.title,message=excluded.message,href=excluded.href,
    severity=excluded.severity,target_roles=excluded.target_roles,
    occurred_at=excluded.occurred_at,is_active=true,metadata=excluded.metadata,updated_at=now();

  insert into public.business_notifications (
    business_id, notification_key, notification_type, severity, title, message,
    href, target_roles, source_table, source_id, occurred_at, is_active, metadata, updated_at
  )
  select
    o.business_id,
    'khqr:' || o.id::text,
    'khqr_pending','warning','KHQR payment needs verification',
    coalesce(o.order_number,'Order') || coalesce(' · Ref ' || nullif(o.payment_reference,''),''),
    '/dashboard/orders/' || o.id::text,
    coalesce((select rs.target_roles from public.business_notification_role_settings rs where rs.business_id=o.business_id and rs.notification_type='khqr_pending'), array['owner','admin','manager','cashier']::text[]),
    'orders',o.id,o.created_at,true,
    jsonb_build_object('payment_reference',o.payment_reference),now()
  from public.orders o
  where o.business_id=p_business_id and o.payment_status='pending_verification'
  on conflict (business_id, notification_key) do update set
    message=excluded.message,href=excluded.href,occurred_at=excluded.occurred_at,
    is_active=true,metadata=excluded.metadata,updated_at=now();

  insert into public.business_notifications (
    business_id, notification_key, notification_type, severity, title, message,
    href, target_roles, source_table, source_id, occurred_at, is_active, metadata, updated_at
  )
  select
    p.business_id,'low-stock:'||p.id::text,'low_stock','warning','Low stock',
    p.name || ' · ' || greatest(coalesce(p.stock_quantity,0),0)::text || ' left',
    '/dashboard/inventory',coalesce((select rs.target_roles from public.business_notification_role_settings rs where rs.business_id=p.business_id and rs.notification_type='low_stock'), array['owner','admin','manager']::text[]),
    'products',p.id,now(),true,
    jsonb_build_object('stock',coalesce(p.stock_quantity,0),'threshold',coalesce(p.low_stock_quantity,0)),now()
  from public.products p
  where p.business_id=p_business_id and p.is_active=true
    and coalesce(p.stock_quantity,0) <= coalesce(p.low_stock_quantity,0)
  on conflict (business_id, notification_key) do update set
    message=excluded.message,is_active=true,metadata=excluded.metadata,updated_at=now();

  insert into public.business_notifications (
    business_id, notification_key, notification_type, severity, title, message,
    href, target_roles, source_table, source_id, occurred_at, is_active, metadata, updated_at
  )
  select po.business_id,'po:'||po.id::text,'purchase_order','info','Purchase order awaiting receipt',
    po.po_number || ' · ' || initcap(po.status),
    '/dashboard/purchase-orders/'||po.id::text,coalesce((select rs.target_roles from public.business_notification_role_settings rs where rs.business_id=po.business_id and rs.notification_type='purchase_order'), array['owner','admin','manager']::text[]),
    'purchase_orders',po.id,po.updated_at,true,jsonb_build_object('status',po.status),now()
  from public.purchase_orders po
  where po.business_id=p_business_id and po.status in ('sent','partial')
  on conflict (business_id, notification_key) do update set
    message=excluded.message,is_active=true,occurred_at=excluded.occurred_at,metadata=excluded.metadata,updated_at=now();

  insert into public.business_notifications (
    business_id, notification_key, notification_type, severity, title, message,
    href, target_roles, source_table, source_id, occurred_at, is_active, metadata, updated_at
  )
  select st.business_id,'transfer:'||st.id::text,'stock_transfer','info','Stock transfer in transit',
    st.transfer_number,
    '/dashboard/stock-transfers',coalesce((select rs.target_roles from public.business_notification_role_settings rs where rs.business_id=st.business_id and rs.notification_type='stock_transfer'), array['owner','admin','manager']::text[]),
    'stock_transfers',st.id,coalesce(st.sent_at,st.updated_at),true,jsonb_build_object('status',st.status),now()
  from public.stock_transfers st
  where st.business_id=p_business_id and st.status='in_transit'
  on conflict (business_id, notification_key) do update set
    message=excluded.message,is_active=true,occurred_at=excluded.occurred_at,updated_at=now();

  insert into public.business_notifications (
    business_id, notification_key, notification_type, severity, title, message,
    href, target_roles, source_table, source_id, occurred_at, is_active, metadata, updated_at
  )
  select s.business_id,'register-variance:'||s.id::text,'register_variance','critical','Register variance',
    'Closed shift variance: ' || coalesce(s.variance,0)::text,
    '/dashboard/register',coalesce((select rs.target_roles from public.business_notification_role_settings rs where rs.business_id=s.business_id and rs.notification_type='register_variance'), array['owner','admin','manager']::text[]),
    'cash_register_shifts',s.id,coalesce(s.closed_at,s.opened_at),true,
    jsonb_build_object('variance',s.variance),now()
  from public.cash_register_shifts s
  where s.business_id=p_business_id and s.status='closed'
    and abs(coalesce(s.variance,0)) > 0.009
    and coalesce(s.closed_at,s.opened_at) >= now()-interval '7 days'
  on conflict (business_id, notification_key) do update set
    message=excluded.message,is_active=true,occurred_at=excluded.occurred_at,metadata=excluded.metadata,updated_at=now();

  insert into public.business_notifications (
    business_id, notification_key, notification_type, severity, title, message,
    href, target_roles, source_table, source_id, occurred_at, is_active, metadata, updated_at
  )
  select a.business_id,'credit-overdue:'||a.customer_id::text,'credit_overdue','critical','Customer credit overdue',
    coalesce(c.name,'Customer') || ' · Balance ' || a.balance::text,
    '/dashboard/customers/'||a.customer_id::text,coalesce((select rs.target_roles from public.business_notification_role_settings rs where rs.business_id=a.business_id and rs.notification_type='credit_overdue'), array['owner','admin','manager']::text[]),
    'customer_credit_accounts',a.customer_id,now(),true,
    jsonb_build_object('balance',a.balance,'due_date',a.payment_due_date),now()
  from public.customer_credit_accounts a
  join public.customers c on c.id=a.customer_id and c.business_id=a.business_id
  where a.business_id=p_business_id and a.balance>0
    and a.payment_due_date is not null and a.payment_due_date < current_date
  on conflict (business_id, notification_key) do update set
    message=excluded.message,is_active=true,metadata=excluded.metadata,updated_at=now();

  insert into public.business_notifications (
    business_id, notification_key, notification_type, severity, title, message,
    href, target_roles, source_table, source_id, occurred_at, is_active, metadata, updated_at
  )
  select o.business_id,'scheduled:'||o.id::text,'scheduled_order','warning','Scheduled order coming up',
    coalesce(o.order_number,'Order') || ' · ' || to_char(o.requested_for,'Mon DD HH24:MI'),
    '/dashboard/orders/'||o.id::text,coalesce((select rs.target_roles from public.business_notification_role_settings rs where rs.business_id=o.business_id and rs.notification_type='scheduled_order'), array['owner','admin','manager','cashier']::text[]),
    'orders',o.id,o.requested_for,true,jsonb_build_object('requested_for',o.requested_for),now()
  from public.orders o
  where o.business_id=p_business_id and o.requested_for between now() and now()+interval '2 hours'
    and coalesce(o.online_status,'new') not in ('completed','rejected')
  on conflict (business_id, notification_key) do update set
    message=excluded.message,is_active=true,occurred_at=excluded.occurred_at,metadata=excluded.metadata,updated_at=now();
end;
$function$
;
CREATE OR REPLACE FUNCTION public.tenh_pos_catalog_scoped_before_visibility(p_business_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_catalog jsonb; v_branch uuid; v_products jsonb; v_categories jsonb;
  v_customers jsonb; v_stock jsonb; v_groups jsonb; v_options jsonb;
  v_branches jsonb; v_holds jsonb; v_shift jsonb;
BEGIN
  PERFORM public.tenh_assert_effective_permission(p_business_id,'pos.access');
  v_branch:=public.tenh_request_branch(p_business_id);
  v_catalog:=public.tenh_pos_catalog(p_business_id);
  IF v_branch IS NULL THEN RETURN v_catalog; END IF;

  SELECT coalesce(jsonb_agg(j),'[]'::jsonb) INTO v_products
  FROM jsonb_array_elements(coalesce(v_catalog->'products','[]'::jsonb)) j
  WHERE EXISTS(
    SELECT 1
    FROM public.products p
    JOIN public.product_location_stock s
      ON s.business_id=p.business_id AND s.product_id=p.id AND s.location_id=v_branch
    WHERE p.business_id=p_business_id AND p.id=(j->>'id')::uuid AND p.is_active=true
      AND (p.category_id IS NULL OR EXISTS(
        SELECT 1 FROM public.categories c
        WHERE c.id=p.category_id AND c.business_id=p_business_id
          AND (c.branch_ids IS NULL OR v_branch=ANY(c.branch_ids))
      ))
  );

  SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) ORDER BY c.name),'[]'::jsonb)
    INTO v_categories
  FROM public.categories c
  WHERE c.business_id=p_business_id AND (c.branch_ids IS NULL OR v_branch=ANY(c.branch_ids));

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',c.id,'name',c.name,'phone',c.phone,'address',to_jsonb(c)->>'address',
      'loyalty_points',c.loyalty_points
    ) ORDER BY c.name,c.id),'[]'::jsonb)
    INTO v_customers
  FROM public.customers c
  WHERE c.business_id=p_business_id AND c.location_id=v_branch;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'product_id',s.product_id,'location_id',s.location_id,'quantity',s.quantity,
      'low_stock_threshold',s.low_stock_threshold
    )),'[]'::jsonb)
    INTO v_stock
  FROM public.product_location_stock s
  WHERE s.business_id=p_business_id AND s.location_id=v_branch;

  SELECT coalesce(jsonb_agg(j),'[]'::jsonb) INTO v_groups
  FROM jsonb_array_elements(coalesce(v_catalog->'groups','[]'::jsonb)) j
  WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(v_products) p WHERE p->>'id'=j->>'product_id');

  SELECT coalesce(jsonb_agg(j),'[]'::jsonb) INTO v_options
  FROM jsonb_array_elements(coalesce(v_catalog->'options','[]'::jsonb)) j
  WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(v_products) p WHERE p->>'id'=j->>'product_id');

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',l.id,'name',l.name,'is_default',l.is_default,'timezone',to_jsonb(l)->>'timezone'
    ) ORDER BY l.name),'[]'::jsonb)
    INTO v_branches
  FROM public.business_locations l
  WHERE l.business_id=p_business_id AND l.id=v_branch AND l.is_active=true;

  SELECT coalesce(jsonb_agg(j),'[]'::jsonb) INTO v_holds
  FROM jsonb_array_elements(coalesce(v_catalog->'holds','[]'::jsonb)) j
  WHERE j->'draft'->>'branchId'=v_branch::text;

  SELECT jsonb_build_object('id',s.id,'location_id',s.location_id) INTO v_shift
  FROM public.cash_register_shifts s
  WHERE s.business_id=p_business_id AND s.location_id=v_branch AND s.status='open'
  ORDER BY s.opened_at DESC LIMIT 1;

  RETURN v_catalog || jsonb_build_object(
    'products',v_products,'categories',v_categories,'customers',v_customers,
    'stock',v_stock,'groups',v_groups,'options',v_options,'branches',v_branches,
    'holds',v_holds,'shift',v_shift,'defaultBranchId',v_branch::text,
    'canCreateCustomer',public.tenh_user_permission_allowed(p_business_id,auth.uid(),'customers.create')
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.tenh_pos_catalog_scoped(p_business_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb; items jsonb;
begin
 result:=public.tenh_pos_catalog_scoped_before_visibility(p_business_id);
 select coalesce(jsonb_agg(item),'[]') into items from jsonb_array_elements(result->'products') item
 where exists(select 1 from public.products p where p.id=(item->>'id')::uuid and p.business_id=p_business_id and p.is_pos);
 return jsonb_set(result,'{products}',items);
end;$function$
;
