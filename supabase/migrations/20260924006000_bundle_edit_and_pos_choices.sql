begin;
set local lock_timeout = '5s';

-- Only the private editor can temporarily authorize recipe writes. Clients cannot
-- set or forge this transaction-scoped marker, unlike a session configuration.
create table public.bundle_recipe_edit_sessions (
  bundle_id uuid not null, transaction_id bigint not null, user_id uuid not null,
  primary key(bundle_id, transaction_id)
);
alter table public.bundle_recipe_edit_sessions enable row level security;
revoke all on public.bundle_recipe_edit_sessions from public, anon, authenticated;

create function public.tenh_edit_bundle_contents(p_business_id uuid, p_branch_id uuid, p_bundle_id uuid, p_input jsonb)
returns void language plpgsql security definer set search_path = '' as $$
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
$$;
revoke all on function public.tenh_edit_bundle_contents(uuid,uuid,uuid,jsonb) from public,anon,authenticated;

do $$
declare definition text; updated text;
begin
  definition:=pg_get_functiondef('public.tenh_freeze_packed_recipe()'::regprocedure);
  updated:=replace(definition, 'begin', $guard$begin
 if exists(select 1 from public.bundle_recipe_edit_sessions where bundle_id=case when tg_op='DELETE' then old.bundle_product_id else new.bundle_product_id end and transaction_id=txid_current() and user_id=auth.uid())
   and (tg_op<>'UPDATE' or old.bundle_product_id=new.bundle_product_id) then
   if tg_op='DELETE' then return old; end if; return new;
 end if;
$guard$);
  if updated=definition then raise exception 'Recipe guard definition changed; migration requires review.'; end if;
  execute updated;

  definition:=pg_get_functiondef('public.tenh_manage_bundle(uuid,uuid,uuid,text,jsonb,timestamptz)'::regprocedure);
  updated:=replace(definition, ' select * into p from public.products', $locks$
 -- Match the packer lock order, including both old and proposed component rows.
 perform id from public.products where business_id=p_business_id and (id=p_bundle_id
   or id in(select component_product_id from public.bundle_items where business_id=p_business_id and bundle_product_id=p_bundle_id)
   or id in(select (value->>'productId')::uuid from jsonb_array_elements(case when jsonb_typeof(p_input->'items')='array' then p_input->'items' else '[]'::jsonb end))) order by id for update;
 select * into p from public.products$locks$);
  if updated=definition then raise exception 'Bundle manager lock definition changed; migration requires review.'; end if;
  updated:=replace(updated, ' perform public.tenh_assert_plan_branch(p_business_id,p_branch_id);', E' perform public.tenh_assert_plan_branch(p_business_id,p_branch_id);\n perform pg_advisory_xact_lock(hashtextextended(''bundle-recipe:''||p_business_id::text||p_bundle_id::text,20260924));');
  updated:=replace(updated, ' elsif p_action in (''pos'',''online'') then', E'  perform public.tenh_edit_bundle_contents(p_business_id,p_branch_id,p_bundle_id,p_input);\n elsif p_action in (''pos'',''online'') then');
  updated:=replace(updated, '  if (p_input->>''enabled'')::boolean and not p.is_active then raise exception ''Activate this product in Products before showing it for sale.'';end if;', '');
  updated:=replace(updated, 'set is_pos=(p_input->>''enabled'')::boolean,updated_at=', 'set is_active=((p_input->>''enabled'')::boolean or coalesce(p.is_online,false)),is_pos=(p_input->>''enabled'')::boolean,updated_at=');
  updated:=replace(updated, 'set is_online=(p_input->>''enabled'')::boolean,updated_at=', 'set is_active=((p_input->>''enabled'')::boolean or coalesce(p.is_pos,false)),is_online=(p_input->>''enabled'')::boolean,updated_at=');
  if position('perform public.tenh_edit_bundle_contents' in updated)=0 or position('set is_active=' in updated)=0 then raise exception 'Bundle manager definition changed; migration requires review.'; end if;
  execute updated;

  -- Freeze the recipe before the packer reads its component lock set. A pack
  -- waiting on an edit must read the committed new recipe, not stale item IDs.
  definition:=pg_get_functiondef('public.tenh_pack_bundle(uuid,uuid,uuid,integer,uuid)'::regprocedure);
  updated:=replace(definition, ' perform public.tenh_assert_plan_branch(p_business_id,p_branch_id);', E' perform public.tenh_assert_plan_branch(p_business_id,p_branch_id);\n perform pg_advisory_xact_lock(hashtextextended(''bundle-recipe:''||p_business_id::text||p_bundle_id::text,20260924));');
  if updated=definition then raise exception 'Bundle packer definition changed; migration requires review.'; end if;
  execute updated;
end;
$$;

update public.products set is_active=false,updated_at=clock_timestamp()
  where product_type='bundle' and is_active and not coalesce(is_pos,false) and not coalesce(is_online,false);

-- Require an address on new Quick Add records, preserving confirmation of old
-- committed requests whose response may have been lost before this update.
do $$
declare definition text; updated text;
begin
  definition:=pg_get_functiondef('public.tenh_pos_customer_create(uuid,uuid,jsonb)'::regprocedure);
  updated:=replace(definition, '    -- Same phone lock', E'    if length(v_address)=0 then raise exception ''Customer address is required.''; end if;\n    -- Same phone lock');
  if updated=definition then raise exception 'Customer create definition changed; migration requires review.'; end if;
  execute updated;
  definition:=pg_get_functiondef('public.tenh_orders_workspace(uuid,jsonb)'::regprocedure);
  updated:=replace(definition,
    'and (coalesce(p_filters->>''fulfillment'',''all'')=''all'' or o.fulfillment_type::text=p_filters->>''fulfillment'')',
    'and (coalesce(p_filters->>''fulfillment'',''all'')=''all'' or o.fulfillment_type::text=p_filters->>''fulfillment'' or (p_filters->>''fulfillment'' in (''walk_in'',''dine_in'') and (o.fulfillment_type is null or o.fulfillment_type::text in (''dine_in'',''in_store''))))');
  if updated=definition then raise exception 'Order filter definition changed; migration requires review.'; end if;
  updated:=replace(updated, '''fulfillment'',o.fulfillment_type', '''fulfillment'',case when o.fulfillment_type is null or o.fulfillment_type::text in (''dine_in'',''in_store'') then ''walk_in'' else o.fulfillment_type::text end');
  execute updated;
end;
$$;
commit;
