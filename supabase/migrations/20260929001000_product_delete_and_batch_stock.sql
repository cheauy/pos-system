-- Restored from the installed Supabase definitions on 2026-09-30.
-- Keep branch-scoped removal and atomic batch adjustments reproducible locally.
begin;

CREATE OR REPLACE FUNCTION public.tenh_write_branch_product()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare b uuid; payload jsonb; target public.branch_product_details%rowtype; columns text; v_before integer; v_total integer; v_other bigint;
begin
 b:=public.tenh_request_branch(old.business_id);
 if b is null then raise exception 'Choose an operating branch.';end if;
 if tg_op='DELETE' then perform public.tenh_assert_effective_permission(old.business_id,'products.disable');
 elsif (to_jsonb(new)-array['is_active','is_online','is_pos','updated_at'])=(to_jsonb(old)-array['is_active','is_online','is_pos','updated_at']) and public.tenh_user_permission_allowed(old.business_id,auth.uid(),'products.disable') then null;
 else perform public.tenh_assert_effective_permission(old.business_id,'products.update');end if;
 perform public.tenh_assert_plan_branch(old.business_id,b);
 if exists(select 1 from public.business_locations where id=b and plan_disable_pending) then raise exception 'This branch is closing after a plan change.';end if;
 if tg_op='DELETE' then
   -- Do not use OLD.stock_quantity: another operation may have changed stock
   -- while this request waited for the business lock. Read and lock live rows.
   select stock_quantity into v_total from public.products
     where business_id=old.business_id and id=old.id for update;
   if not found then raise exception 'Product was not found.'; end if;
   perform 1 from public.branch_product_details
     where business_id=old.business_id and id=old.id and location_id=b and not branch_archived for update;
   if not found then return old; end if; -- Already removed by another request.
   select quantity into v_before from public.product_location_stock
     where business_id=old.business_id and product_id=old.id and location_id=b for update;
   if not found then raise exception 'Product is not assigned to this branch.'; end if;
   if v_before <> 0 then
     -- Preserve other branches and any unallocated global stock. In legacy data
     -- with under-counted global stock, never subtract another branch's units.
     select coalesce(sum(quantity),0) into v_other from public.product_location_stock
       where business_id=old.business_id and product_id=old.id and location_id<>b;
     update public.products set stock_quantity=greatest(coalesce(v_total,0)::bigint-v_before,v_other),updated_at=now()
       where business_id=old.business_id and id=old.id;
     update public.product_location_stock set quantity=0,updated_at=now()
       where business_id=old.business_id and product_id=old.id and location_id=b;
     perform set_config('tenh.adjustment_branch',b::text,true);
     insert into public.stock_adjustments(business_id,location_id,product_id,adjustment_type,quantity_delta,stock_before,stock_after,reason,reference,created_by)
       values(old.business_id,b,old.id,'set',-v_before,v_before,0,'Product deleted from branch',null,auth.uid());
     perform set_config('tenh.adjustment_branch','',true);
   end if;
   update public.branch_product_details set branch_archived=true,stock_quantity=0,is_active=false,is_pos=false,is_online=false,updated_at=now() where business_id=old.business_id and id=old.id and location_id=b;
   -- When this was the last catalog assignment, also remove the shared online
   -- listing. Keep the identity itself: sales, returns and audit FKs reference it.
   if not exists(select 1 from public.branch_product_details
     where business_id=old.business_id and id=old.id and not branch_archived) then
     update public.products set is_active=false,is_pos=false,is_online=false,updated_at=now()
       where business_id=old.business_id and id=old.id;
   end if;
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

revoke all on function public.tenh_write_branch_product() from public,anon,authenticated;

-- One RPC: apply one branch's stock adjustments atomically with duplicate-request recovery.
CREATE OR REPLACE FUNCTION public.tenh_adjust_branch_stock_batch(p_business_id uuid, p_location_id uuid, p_items jsonb, p_reason text, p_reference text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare
  v_item jsonb;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_payload jsonb;
  v_saved public.stock_adjustment_requests%rowtype;
  v_product_id uuid;
  v_quantity integer;
  v_expected integer;
  v_mode text;
begin
  perform public.tenh_assert_effective_permission(p_business_id,'products.stock_adjust');
  if auth.uid() is null or p_location_id is null or public.tenh_request_branch(p_business_id) is distinct from p_location_id then
    raise exception 'This stock adjustment is outside your operating branch.' using errcode='42501';
  end if;
  if p_request_id is null or p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Select valid products and an adjustment request.';
  end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 500
    or octet_length(p_items::text)>160000 or p_reason is null or length(btrim(p_reason))<2
    or length(p_reason)>650 or length(p_reference)>200 then
    raise exception 'Select 1-500 items and enter a valid reason and reference.';
  end if;
  -- Same business-before-product lock order as the single-item and POS paths.
  perform public.tenh_assert_plan_branch(p_business_id,p_location_id);
  if exists(select 1 from public.business_locations where id=p_location_id and plan_disable_pending) then
    raise exception 'This branch is closing after a plan change.';
  end if;
  v_payload:=jsonb_build_object('kind','batch','items',p_items,'reason',p_reason,'reference',p_reference);
  select * into v_saved from public.stock_adjustment_requests
    where business_id=p_business_id and request_id=p_request_id;
  if found then
    if v_saved.created_by is distinct from auth.uid() or v_saved.location_id is distinct from p_location_id
      or v_saved.payload is distinct from v_payload then
      raise exception 'This adjustment request was already used with different details.';
    end if;
    return v_saved.result;
  end if;
  if exists(select 1 from jsonb_array_elements(p_items) as i
    group by lower(i->>'productId') having count(*)>1) then
    raise exception 'Select each product or variant only once.';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) order by value->>'productId' loop
    if jsonb_typeof(v_item) <> 'object' or coalesce(v_item->>'productId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(v_item->'quantity') is distinct from 'number'
      or jsonb_typeof(v_item->'expectedQuantity') is distinct from 'number'
      or coalesce(v_item->>'quantity','') !~ '^[0-9]+$'
      or coalesce(v_item->>'expectedQuantity','') !~ '^[0-9]+$' then
      raise exception 'Enter a valid product and whole-number quantities for every row.';
    end if;
    v_product_id:=(v_item->>'productId')::uuid;
    v_quantity:=(v_item->>'quantity')::integer;
    v_expected:=(v_item->>'expectedQuantity')::integer;
    v_mode:=v_item->>'mode';
    -- The existing RPC rechecks membership, active branch catalog, live stock,
    -- stale exact counts, plan status and quantity bounds for every selected ID.
    v_result:=public.tenh_adjust_branch_stock(p_business_id,p_location_id,v_product_id,
      v_mode,v_quantity,p_reason,p_reference,gen_random_uuid(),v_expected);
    v_results:=v_results||jsonb_build_array(v_result);
  end loop;
  v_result:=jsonb_build_object('items',v_results,'count',jsonb_array_length(v_results));
  insert into public.stock_adjustment_requests(business_id,request_id,created_by,location_id,payload,result)
    values(p_business_id,p_request_id,auth.uid(),p_location_id,v_payload,v_result);
  return v_result;
end;
$$;

revoke all on function public.tenh_adjust_branch_stock_batch(uuid,uuid,jsonb,text,text,uuid) from public,anon,authenticated;
grant execute on function public.tenh_adjust_branch_stock_batch(uuid,uuid,jsonb,text,text,uuid) to authenticated;

commit;

