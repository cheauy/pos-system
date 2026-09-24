begin;
CREATE OR REPLACE FUNCTION public.receive_purchase_order(p_purchase_order_id uuid, p_receipts jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_po public.purchase_orders%rowtype;
  v_item jsonb;
  v_po_item public.purchase_order_items%rowtype;
  v_product public.products%rowtype;
  v_qty integer;
  v_before integer; v_branch_before integer;
  v_after integer;
  v_remaining integer;
  v_total_received integer := 0;
  v_all_received boolean;
begin
  if v_user is null then raise exception 'Authentication required.'; end if;
  if p_receipts is null or jsonb_typeof(p_receipts) <> 'array' or jsonb_array_length(p_receipts) = 0 then
    raise exception 'Add at least one received quantity.';
  end if;

  select * into v_po from public.purchase_orders where id = p_purchase_order_id for update;
  if not found then raise exception 'Purchase order not found.'; end if;
  if v_po.status in ('received','cancelled') then raise exception 'This purchase order cannot receive more stock.'; end if;

  perform public.tenh_assert_effective_permission(v_po.business_id,'purchases.update');
  if v_po.location_id is distinct from public.tenh_request_branch(v_po.business_id) then raise exception 'Purchase order belongs to another branch.';end if;

  for v_item in select value from jsonb_array_elements(p_receipts)
  loop
    begin
      v_qty := (v_item->>'quantity')::integer;
    exception when others then
      raise exception 'Invalid received quantity.';
    end;
    if v_qty is null or v_qty <= 0 then raise exception 'Received quantity must be greater than zero.'; end if;

    select * into v_po_item
    from public.purchase_order_items
    where id = (v_item->>'itemId')::uuid
      and purchase_order_id = v_po.id
      and business_id = v_po.business_id
    for update;
    if not found then raise exception 'Purchase order line not found.'; end if;

    v_remaining := v_po_item.ordered_quantity - v_po_item.received_quantity;
    if v_qty > v_remaining then raise exception 'Received quantity exceeds remaining quantity for %.', v_po_item.product_name; end if;

    select * into v_product from public.products
    where id = v_po_item.product_id and business_id = v_po.business_id for update;
    if not found then raise exception 'Product no longer exists.'; end if;

    v_before := coalesce(v_product.stock_quantity,0);
    v_after := v_before + v_qty;

    update public.products
      set stock_quantity = v_after,
          updated_at = now()
    where id = v_product.id;

    select quantity into v_branch_before from public.product_location_stock where business_id=v_po.business_id and location_id=v_po.location_id and product_id=v_product.id for update;
    if not found then raise exception 'Assign this product to the branch before receiving stock.';end if;
    update public.product_location_stock set quantity=quantity+v_qty,updated_at=now() where business_id=v_po.business_id and location_id=v_po.location_id and product_id=v_product.id;
    update public.branch_product_details set cost_price=v_po_item.unit_cost,updated_at=now() where business_id=v_po.business_id and location_id=v_po.location_id and id=v_product.id;
    perform set_config('tenh.adjustment_branch',v_po.location_id::text,true);
    update public.purchase_order_items
      set received_quantity = received_quantity + v_qty, updated_at = now()
    where id = v_po_item.id;

    insert into public.stock_adjustments (
      business_id, product_id, adjustment_type, quantity_delta,
      stock_before, stock_after, reason, reference, created_by
    ) values (
      v_po.business_id, v_product.id, 'increase', v_qty,
      v_branch_before, v_branch_before+v_qty, 'Purchase order receipt', v_po.po_number, v_user
    );

    v_total_received := v_total_received + v_qty;
  end loop;

  select bool_and(received_quantity >= ordered_quantity)
    into v_all_received
  from public.purchase_order_items
  where purchase_order_id = v_po.id;

  update public.purchase_orders
    set status = case when coalesce(v_all_received,false) then 'received' else 'partial' end,
        updated_at = now()
  where id = v_po.id;

  perform set_config('tenh.adjustment_branch','',true);
  return jsonb_build_object('purchaseOrderId', v_po.id, 'receivedQuantity', v_total_received, 'status', case when coalesce(v_all_received,false) then 'received' else 'partial' end);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.tenh_run_branch_stock(p_business uuid, p_operation text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b uuid; doc jsonb; ids uuid[]; snapshots jsonb:='[]'; r record; result jsonb; qty integer; total_after integer; wanted integer; v_purchase_id uuid; purchase_total numeric:=0; item jsonb; cost numeric;
begin
 b:=tenh_request_branch(p_business);
 if b is null then raise exception 'Choose an operating branch.'; end if;
 perform tenh_assert_plan_branch(p_business,b);
 if exists(select 1 from public.business_locations where id=b and plan_disable_pending) then raise exception 'This branch is closing after a plan change.';end if;
 if p_operation='create_purchase' then perform public.tenh_assert_effective_permission(p_business,'purchases.create');
 elsif p_operation='cancel_purchase' then perform public.tenh_assert_effective_permission(p_business,'purchases.cancel');
 elsif p_operation='receive_purchase_order' then perform public.tenh_assert_effective_permission(p_business,'purchases.update');
 elsif p_operation='cancel_order' or p_operation='reject_online' then perform public.tenh_assert_effective_permission(p_business,'orders.cancel');
 elsif p_operation='return_order' then perform public.tenh_assert_effective_permission(p_business,'orders.return');
 else raise exception 'Unsupported stock operation.'; end if;
 if p_operation='create_purchase' then
  if jsonb_typeof(p_payload->'p_items') is distinct from 'array' then raise exception 'Add purchased products.'; end if;
  for item in select value from jsonb_array_elements(p_payload->'p_items') loop
   qty:=(item->>'quantity')::integer; cost:=(item->>'unit_cost')::numeric;
   if qty is null or qty<=0 or (item->>'quantity')::numeric<>qty or cost is null or cost::text in ('NaN','Infinity','-Infinity') or cost<0 or cost<>round(cost,2) then raise exception 'Enter positive whole quantities and valid unit costs.'; end if;
   purchase_total:=purchase_total+qty*cost;
  end loop;
  select array_agg(distinct (value->>'product_id')::uuid) into ids from jsonb_array_elements(p_payload->'p_items');
  if cardinality(ids)<>jsonb_array_length(p_payload->'p_items') then raise exception 'Each product can appear only once.'; end if;
 elsif p_operation='cancel_purchase' then
  select to_jsonb(p) into doc from purchases p where id=(p_payload->>'p_purchase_id')::uuid and business_id=p_business and location_id=b for update;
  select array_agg(distinct product_id) into ids from purchase_items where purchase_id=(doc->>'id')::uuid;
 elsif p_operation='receive_purchase_order' then
  select to_jsonb(p) into doc from purchase_orders p where id=(p_payload->>'p_purchase_order_id')::uuid and business_id=p_business and location_id=b for update;
  select array_agg(distinct product_id) into ids from purchase_order_items where purchase_order_id=(doc->>'id')::uuid;
 else
  select to_jsonb(o) into doc from orders o where id=(p_payload->>'p_order_id')::uuid and business_id=p_business and location_id=b for update;
  if p_operation='reject_online' and (doc->>'order_source' not in ('online','qr') or doc->>'online_status' in ('completed','rejected')) then raise exception 'Online order cannot be rejected.'; end if;
  select array_agg(distinct product_id) into ids from order_items where order_id=(doc->>'id')::uuid;
 end if;
 if p_operation='create_purchase' then
  if exists(select 1 from unnest(ids) product_id where not exists(select 1 from public.branch_products p where p.id=product_id and p.business_id=p_business and p.is_active)) then raise exception 'Choose active products assigned to this branch.';end if;
 end if;
 if p_operation<>'create_purchase' and doc is null then raise exception 'Document not found in this branch.'; end if;
 if p_operation='return_order' then perform id from cash_register_shifts where business_id=p_business and location_id=b and status='open' for update; end if;
 if ids is null or cardinality(ids)=0 or cardinality(ids)>1000 then raise exception 'No valid products for this stock operation.'; end if;
 for r in select id,stock_quantity from products where business_id=p_business and id=any(ids) order by id for update loop
  select quantity into qty from product_location_stock where business_id=p_business and location_id=b and product_id=r.id for update;
  snapshots:=snapshots||jsonb_build_object('id',r.id,'global',r.stock_quantity,'branch',coalesce(qty,0));
 end loop;
 if jsonb_array_length(snapshots)<>cardinality(ids) then raise exception 'Product does not belong to this business.'; end if;
 case p_operation
 when 'create_purchase' then
  -- The legacy purchase overloads do not persist line items. Save the complete
  -- purchase and stock ledger here, in the same locked branch transaction.
  insert into purchases(business_id,location_id,owner_id,purchase_number,supplier_id,supplier_name,reference_number,purchase_date,notes,status,subtotal,total)
   values(p_business,b,auth.uid(),'PUR-'||upper(replace(gen_random_uuid()::text,'-','')),(p_payload->>'p_supplier_id')::uuid,
    (select name from suppliers where id=(p_payload->>'p_supplier_id')::uuid and business_id=p_business and location_id=b),
    nullif(trim(p_payload->>'p_reference_number'),''),coalesce((p_payload->>'p_purchase_date')::date,current_date),nullif(trim(p_payload->>'p_notes'),''),'received',purchase_total,purchase_total)
   returning id into v_purchase_id;
  for item in select value from jsonb_array_elements(p_payload->'p_items') loop
   qty:=(item->>'quantity')::integer; cost:=(item->>'unit_cost')::numeric;
   insert into purchase_items(owner_id,purchase_id,product_id,product_name,quantity,unit_cost,subtotal)
    select auth.uid(),v_purchase_id,id,name,qty,cost,qty*cost from public.branch_products where id=(item->>'product_id')::uuid and business_id=p_business;
   update products set stock_quantity=stock_quantity+qty,updated_at=now() where id=(item->>'product_id')::uuid and business_id=p_business returning stock_quantity into total_after;
   insert into inventory_movements(business_id,owner_id,product_id,movement_type,quantity,stock_before,stock_after,note)
    values(p_business,auth.uid(),(item->>'product_id')::uuid,'stock_in',qty,total_after-qty,total_after,'Purchase received: '||v_purchase_id::text);
  end loop;
  result:=to_jsonb(v_purchase_id);
 when 'cancel_purchase' then
  if doc->>'status' is distinct from 'received' then raise exception 'Only received purchases can be cancelled.'; end if;
  if nullif(trim(p_payload->>'p_reason'),'') is null then raise exception 'Cancellation reason is required.'; end if;
  for r in select product_id,sum(quantity)::integer quantity from purchase_items where purchase_items.purchase_id=(doc->>'id')::uuid group by product_id loop
   update products set stock_quantity=stock_quantity-r.quantity,updated_at=now() where id=r.product_id and business_id=p_business returning stock_quantity into total_after;
   insert into inventory_movements(business_id,owner_id,product_id,movement_type,quantity,stock_before,stock_after,note)
    values(p_business,auth.uid(),r.product_id,'purchase_cancelled',r.quantity,total_after+r.quantity,total_after,'Purchase cancelled: '||(doc->>'purchase_number')||'. '||(p_payload->>'p_reason'));
  end loop;
  update purchases set status='cancelled',cancellation_reason=trim(p_payload->>'p_reason'),cancelled_at=now(),updated_at=now() where id=(doc->>'id')::uuid and business_id=p_business;
 when 'receive_purchase_order' then perform public.receive_purchase_order(p_purchase_order_id=>(p_payload->>'p_purchase_order_id')::uuid,p_receipts=>p_payload->'p_receipts');
 when 'return_order' then select public.tenh_create_order_return_accounted(p_order_id=>(p_payload->>'p_order_id')::uuid,p_reason=>p_payload->>'p_reason',p_items=>p_payload->'p_items',p_refund_method=>p_payload->>'p_refund_method') into result;
 else perform public.cancel_order(p_order_id=>(p_payload->>'p_order_id')::uuid,p_reason=>p_payload->>'p_reason');
 end case;
 for r in select value as item from jsonb_array_elements(snapshots) loop
  select stock_quantity into total_after from products where id=(r.item->>'id')::uuid and business_id=p_business;
  wanted:=(r.item->>'branch')::integer+total_after-(r.item->>'global')::integer;
  if wanted<0 then raise exception 'Not enough stock in this branch. Stock in other branches cannot be used.'; end if;
  insert into product_location_stock(business_id,location_id,product_id,quantity) values(p_business,b,(r.item->>'id')::uuid,wanted)
    on conflict(location_id,product_id) do update set quantity=excluded.quantity,updated_at=now();
  if (select coalesce(sum(quantity),0) from product_location_stock where business_id=p_business and product_id=(r.item->>'id')::uuid)>total_after then raise exception 'Branch stock exceeds total stock. Reconcile inventory first.'; end if;
 end loop;
 return coalesce(result,'{}'::jsonb);
end $function$
;
do $$declare f record;begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in ('cancel_order','cancel_purchase','create_order_return','receive_purchase_order') loop
 execute format('revoke execute on function %s from public,anon,authenticated',f.signature);
 end loop;
end$$;
notify pgrst,'reload schema';
commit;

