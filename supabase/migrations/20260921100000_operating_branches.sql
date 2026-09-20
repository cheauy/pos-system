-- Requires subscription_branch_limits and register_pos_accounting migrations.
begin;

alter table public.categories add column if not exists branch_ids uuid[];
alter table public.business_storefronts add column if not exists fulfillment_location_id uuid references public.business_locations(id);

-- Explicit operating context, checked against active membership and the tenant.
create or replace function public.tenh_request_branch(p_business uuid) returns uuid
language plpgsql stable security definer set search_path=public as $$
declare h jsonb := coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb; b uuid;
begin
 if nullif(h->>'x-tenh-branch-id','') is null then return null; end if;
 b := (h->>'x-tenh-branch-id')::uuid;
 if (h->>'x-tenh-business-id')::uuid is distinct from p_business
   or not exists(select 1 from business_members where business_id=p_business and user_id=auth.uid() and is_active)
   or not exists(select 1 from business_locations where id=b and business_id=p_business and is_active)
 then raise exception 'Invalid operating branch.' using errcode='42501'; end if;
 return b;
end $$;

create or replace function public.tenh_branch_visible(p_business uuid,p_location uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select public.tenh_request_branch(p_business) is null or p_location=public.tenh_request_branch(p_business)
$$;

-- Existing business-wide contacts and purchasing documents start in Main.
-- Historical sales with ambiguous branch ownership stay unassigned.
do $$ declare t text; begin
 foreach t in array array['customers','suppliers','purchases','purchase_orders','returns','business_coupons','tenh_pos_holds'] loop
  execute format('alter table public.%I add column if not exists location_id uuid references public.business_locations(id)',t);
 end loop;
 foreach t in array array['customers','suppliers','purchases','purchase_orders','business_coupons'] loop
  execute format('update public.%I r set location_id=b.id from public.business_locations b where r.business_id=b.business_id and b.is_default and r.location_id is null',t);
 end loop;
end $$;
update public.orders o set location_id=l.id from public.business_locations l
 where o.business_id=l.business_id and o.location_id is null
 and (select count(*) from public.business_locations x where x.business_id=o.business_id)=1;
update public.tenh_pos_holds h set location_id=l.id from public.business_locations l where l.business_id=h.business_id and l.id=nullif(h.draft->>'branchId','')::uuid and h.location_id is null;
update public.returns r set location_id=o.location_id from public.orders o where r.order_id=o.id and r.business_id=o.business_id and r.location_id is null;

-- Materialize legacy single-branch stock so all pickers use branch assignments.
insert into public.product_location_stock(business_id,location_id,product_id,quantity)
 select p.business_id,l.id,p.id,greatest(0,p.stock_quantity) from public.products p
 join public.business_locations l on l.business_id=p.business_id
 where (select count(*) from public.business_locations x where x.business_id=p.business_id)=1
 on conflict(location_id,product_id) do nothing;

create or replace function public.tenh_guard_operating_record() returns trigger
language plpgsql security definer set search_path=public as $$
declare b uuid; related uuid; related_business uuid;
begin
 if tg_op='DELETE' then
  b:=tenh_request_branch(old.business_id);
  if b is not null and old.location_id is distinct from b then raise exception 'Record belongs to another branch.'; end if;
  return old;
 end if;
 b:=tenh_request_branch(new.business_id);
 if tg_op='UPDATE' and (new.location_id is distinct from old.location_id or new.business_id is distinct from old.business_id) then
  raise exception 'Branch ownership cannot be changed after creation.';
 end if;
 if tg_table_name='orders' and tg_op='INSERT' and nullif(current_setting('tenh.online_branch',true),'') is not null then
  new.location_id:=current_setting('tenh.online_branch')::uuid;
 end if;
 if tg_table_name='tenh_pos_holds' and (to_jsonb(new)->'draft'->>'branchId')::uuid is distinct from new.location_id and new.location_id is not null then raise exception 'Held cart belongs to another branch.'; end if;
 if tg_table_name='returns' then
  select location_id,business_id into related,related_business from orders where id=new.order_id;
  if related_business is distinct from new.business_id then raise exception 'Order does not belong to this business.'; end if;
  new.location_id:=related;
 elsif tg_op='INSERT' and new.location_id is null then new.location_id:=b;
 end if;
 if tg_table_name='tenh_pos_holds' and (to_jsonb(new)->'draft'->>'branchId')::uuid is distinct from new.location_id then raise exception 'Held cart belongs to another branch.'; end if;
 if b is not null and new.location_id is distinct from b then raise exception 'Record belongs to another branch.'; end if;

 if tg_table_name='orders' and (to_jsonb(new)->>'customer_id')::uuid is not null and (tg_op='INSERT' or (to_jsonb(new)->>'customer_id')::uuid is distinct from (to_jsonb(old)->>'customer_id')::uuid) then
  if not exists(select 1 from customers where id=(to_jsonb(new)->>'customer_id')::uuid and business_id=new.business_id and location_id=new.location_id) then raise exception 'Customer belongs to another branch.'; end if;
 end if;
 if tg_table_name in ('purchases','purchase_orders') and (to_jsonb(new)->>'supplier_id')::uuid is not null and (tg_op='INSERT' or (to_jsonb(new)->>'supplier_id')::uuid is distinct from (to_jsonb(old)->>'supplier_id')::uuid) then
  if not exists(select 1 from suppliers where id=(to_jsonb(new)->>'supplier_id')::uuid and business_id=new.business_id and location_id=new.location_id) then raise exception 'Supplier belongs to another branch.'; end if;
 end if;
 if new.location_id is not null and not exists(select 1 from business_locations where id=new.location_id and business_id=new.business_id) then raise exception 'Invalid record branch.'; end if;
 return new;
end $$;

do $$ declare t text; begin
 foreach t in array array['orders','customers','suppliers','purchases','purchase_orders','returns','expenses','cash_register_shifts','cash_movements','business_coupons','tenh_pos_holds'] loop
  execute format('create index if not exists %I on public.%I(business_id,location_id)',t||'_operating_branch_idx',t);
  execute format('alter table public.%I enable row level security',t);
  execute format('drop policy if exists tenh_operating_branch on public.%I',t);
  execute format('create policy tenh_operating_branch on public.%I as restrictive for all to authenticated using (public.tenh_branch_visible(business_id,location_id)) with check (public.tenh_branch_visible(business_id,location_id))',t);
  execute format('drop trigger if exists tenh_operating_record on public.%I',t);
  execute format('create trigger tenh_operating_record before insert or update or delete on public.%I for each row execute function public.tenh_guard_operating_record()',t);
 end loop;
end $$;

-- Definer RPCs must also validate the branch of child records; RLS alone is not
-- sufficient because those procedures can bypass it.
create or replace function public.tenh_guard_operating_child() returns trigger
language plpgsql security definer set search_path=public as $$
declare row_data jsonb; parent_row jsonb; b uuid;
begin
 row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 execute format('select to_jsonb(p) from public.%I p where id=$1',tg_argv[0]) into parent_row using (row_data->>tg_argv[1])::uuid;
 if parent_row is null then
  if tg_op='DELETE' then return old; end if;
  raise exception 'Parent document not found.';
 end if;
 b:=tenh_request_branch((parent_row->>'business_id')::uuid);
 if b is not null and (parent_row->>'location_id')::uuid is distinct from b then raise exception 'Document belongs to another branch.'; end if;
 if tg_op='UPDATE' and row_data->>tg_argv[1] is distinct from to_jsonb(old)->>tg_argv[1] then raise exception 'Document ownership cannot be changed.'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
do $$ declare t text; parent_table text; key_name text; begin
 for t,parent_table,key_name in select * from (values ('order_items','orders','order_id'),('return_items','returns','return_id'),('purchase_items','purchases','purchase_id'),('purchase_order_items','purchase_orders','purchase_order_id'),('customer_credit_accounts','customers','customer_id'),('customer_credit_ledger','customers','customer_id')) v loop
  execute format('drop trigger if exists tenh_operating_child on public.%I',t);
  execute format('create trigger tenh_operating_child before insert or update or delete on public.%I for each row execute function public.tenh_guard_operating_child(%L,%L)',t,parent_table,key_name);
  execute format('alter table public.%I enable row level security',t);
  execute format('drop policy if exists tenh_operating_child on public.%I',t);
  execute format('create policy tenh_operating_child on public.%I as restrictive for select to authenticated using (exists(select 1 from public.%I p where p.id=%I.%I))',t,parent_table,t,key_name);
 end loop;
end $$;

create or replace function public.tenh_guard_category_branches() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from unnest(new.branch_ids) b where not exists(select 1 from business_locations l where l.id=b and l.business_id=new.business_id and l.is_active)) then raise exception 'Choose active branches in this business.'; end if;
 return new;
end $$;
drop trigger if exists tenh_category_branches on public.categories;
create trigger tenh_category_branches before insert or update of branch_ids,business_id on public.categories for each row execute function public.tenh_guard_category_branches();

create or replace function public.tenh_guard_transfer_product_branch() returns trigger
language plpgsql security definer set search_path=public as $$
declare t public.stock_transfers;
begin
 select * into t from stock_transfers where id=new.transfer_id;
 if t.business_id is distinct from new.business_id or not exists(select 1 from product_location_stock s join products p on p.id=s.product_id and p.business_id=s.business_id where s.business_id=t.business_id and s.location_id=t.source_location_id and s.product_id=new.product_id and s.quantity>=new.quantity and p.is_active) then raise exception 'Product is unavailable in the source branch.'; end if;
 return new;
end $$;
drop trigger if exists tenh_transfer_product_branch on public.stock_transfer_items;
create trigger tenh_transfer_product_branch before insert or update of product_id,quantity,transfer_id on public.stock_transfer_items for each row execute function public.tenh_guard_transfer_product_branch();

create or replace function public.tenh_guard_store_fulfillment_branch() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.fulfillment_location_id is not null then perform tenh_assert_plan_branch(new.business_id,new.fulfillment_location_id); end if;
 return new;
end $$;
drop trigger if exists tenh_store_fulfillment_branch on public.business_storefronts;
create trigger tenh_store_fulfillment_branch before insert or update of fulfillment_location_id,business_id on public.business_storefronts for each row execute function public.tenh_guard_store_fulfillment_branch();


-- Wrap stock-changing legacy routines in one transaction. Snapshot both totals
-- before the routine and reconcile its exact net change afterward. This works
-- whether the underlying routine already adjusts branch stock or only global
-- stock, without counting the same adjustment twice.
create or replace function public.tenh_run_branch_stock(p_business uuid,p_operation text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare b uuid; member_role text; doc jsonb; ids uuid[]; snapshots jsonb:='[]'; r record; result jsonb; qty integer; total_after integer; wanted integer; v_purchase_id uuid; purchase_total numeric:=0; item jsonb; cost numeric;
begin
 b:=tenh_request_branch(p_business);
 if b is null then raise exception 'Choose an operating branch.'; end if;
 perform tenh_assert_plan_branch(p_business,b);
 select role into member_role from business_members where business_id=p_business and user_id=auth.uid() and is_active;
 if p_operation in ('create_purchase','cancel_purchase','receive_purchase_order') then
  if member_role is distinct from 'owner' then raise exception 'Purchase permission required.' using errcode='42501'; end if;
 elsif p_operation in ('cancel_order','return_order') then
  if member_role not in ('owner','admin','manager') then raise exception 'Order permission required.' using errcode='42501'; end if;
 elsif p_operation='reject_online' then
  if member_role not in ('owner','admin','manager','cashier') then raise exception 'Order permission required.' using errcode='42501'; end if;
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
    select auth.uid(),v_purchase_id,id,name,qty,cost,qty*cost from products where id=(item->>'product_id')::uuid and business_id=p_business;
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
end $$;
revoke all on function public.tenh_run_branch_stock(uuid,text,jsonb) from public,anon;
grant execute on function public.tenh_run_branch_stock(uuid,text,jsonb) to authenticated;

create or replace function public.tenh_notification_in_branch(p_business uuid,p_table text,p_id uuid) returns boolean
language plpgsql stable security definer set search_path=public as $$
declare b uuid; result boolean;
begin
 b:=tenh_request_branch(p_business);
 if b is null then return true; end if;
 if p_table in ('orders','purchase_orders','cash_register_shifts','customers') then
  execute format('select exists(select 1 from public.%I where id=$1 and business_id=$2 and location_id=$3)',p_table) into result using p_id,p_business,b;
  return result;
 elsif p_table='products' then return exists(select 1 from product_location_stock where product_id=p_id and business_id=p_business and location_id=b);
 elsif p_table='stock_transfers' then return exists(select 1 from stock_transfers where id=p_id and business_id=p_business and (source_location_id=b or destination_location_id=b));
 end if;
 return false;
end $$;
alter table public.business_notifications enable row level security;
drop policy if exists tenh_branch_notifications on public.business_notifications;
create policy tenh_branch_notifications on public.business_notifications as restrictive for select to authenticated using (tenh_notification_in_branch(business_id,source_table,source_id));
create or replace function public.tenh_branch_notifications(p_business uuid,p_branch uuid) returns setof public.business_notifications
language plpgsql security invoker set search_path=public as $$
begin
 perform set_config('request.headers',jsonb_build_object('x-tenh-business-id',p_business,'x-tenh-branch-id',p_branch)::text,true);
 perform tenh_request_branch(p_business);
 return query select * from business_notifications where business_id=p_business and is_active order by occurred_at desc limit 20;
end $$;
revoke all on function public.tenh_notification_in_branch(uuid,text,uuid),public.tenh_branch_notifications(uuid,uuid) from public,anon;
grant execute on function public.tenh_notification_in_branch(uuid,text,uuid),public.tenh_branch_notifications(uuid,uuid) to authenticated;

create or replace function public.tenh_branch_scope_ready() returns boolean language sql stable as $$select true$$;
revoke all on function public.tenh_branch_scope_ready() from public,anon;
grant execute on function public.tenh_branch_scope_ready() to authenticated;
revoke all on function public.tenh_request_branch(uuid),public.tenh_branch_visible(uuid,uuid) from public,anon;
grant execute on function public.tenh_request_branch(uuid),public.tenh_branch_visible(uuid,uuid) to authenticated;
revoke all on function public.tenh_guard_operating_record(),public.tenh_guard_operating_child(),public.tenh_guard_category_branches(),public.tenh_guard_transfer_product_branch(),public.tenh_guard_store_fulfillment_branch() from public,anon,authenticated;
create or replace function public.place_branch_online_order(p_business_slug text,p_checkout jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_business uuid; v_location uuid; v_locations integer; r record; v_stock integer; v_global integer; v_reserved jsonb:='[]'; v_result jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Server access required.'; end if;
 select id into v_business from businesses where slug=p_business_slug and is_active for update;
 if v_business is null then raise exception 'Store not found.'; end if;
 select coalesce(s.fulfillment_location_id,(select id from business_locations where business_id=v_business and is_default and is_active)) into v_location from business_storefronts s where s.business_id=v_business;
 perform tenh_assert_plan_branch(v_business,v_location);
 if nullif(p_checkout->>'p_coupon_code','') is not null and not exists(select 1 from business_coupons where business_id=v_business and upper(code)=upper(p_checkout->>'p_coupon_code') and location_id=v_location) then raise exception 'Coupon is not available at the fulfillment branch.'; end if;
 select count(*) into v_locations from business_locations where business_id=v_business;
 for r in select (item->>'productId')::uuid product_id,sum((item->>'quantity')::integer)::integer quantity from jsonb_array_elements(p_checkout->'p_items') item group by 1 order by 1 loop
  if r.quantity is null or r.quantity<1 or r.quantity>999 then raise exception 'Invalid product quantity.'; end if;
  select p.stock_quantity into v_global from products p where p.id=r.product_id and p.business_id=v_business and p.is_active and p.is_online
    and (p.category_id is null or exists(select 1 from categories c where c.id=p.category_id and c.business_id=v_business and c.is_online and (c.branch_ids is null or v_location=any(c.branch_ids)))) for update;
  if not found then raise exception 'Product not found.'; end if;
  select quantity into v_stock from product_location_stock where product_id=r.product_id and location_id=v_location and business_id=v_business for update;
  if v_locations>1 and not found then raise exception 'Product is not assigned to the fulfillment branch.'; end if;
  v_stock:=case when v_locations=1 then v_global else least(v_global,coalesce(v_stock,0)) end;
  if r.quantity>v_stock then raise exception 'Not enough stock in the store fulfillment branch.'; end if;
  v_reserved:=v_reserved||jsonb_build_object('id',r.product_id,'after',v_stock-r.quantity);
 end loop;
 perform set_config('tenh.online_branch',v_location::text,true);
 v_result:=public.place_online_order(p_business_slug=>p_business_slug,p_items=>p_checkout->'p_items',p_fulfillment_type=>p_checkout->>'p_fulfillment_type',p_guest_name=>p_checkout->>'p_guest_name',p_guest_phone=>p_checkout->>'p_guest_phone',p_guest_address=>p_checkout->>'p_guest_address',p_customer_note=>p_checkout->>'p_customer_note',p_table_token=>(p_checkout->>'p_table_token')::uuid,p_payment_method=>p_checkout->>'p_payment_method',p_payment_reference=>p_checkout->>'p_payment_reference',p_delivery_zone_id=>(p_checkout->>'p_delivery_zone_id')::uuid,p_requested_for=>(p_checkout->>'p_requested_for')::timestamptz,p_coupon_code=>p_checkout->>'p_coupon_code');
 if not exists(select 1 from orders where id=(v_result->>'orderId')::uuid and business_id=v_business and location_id=v_location) then raise exception 'Order fulfillment branch could not be verified.'; end if;
 perform set_config('tenh.online_branch','',true);
 for r in select value as item from jsonb_array_elements(v_reserved) loop
  insert into product_location_stock(business_id,location_id,product_id,quantity) values(v_business,v_location,(r.item->>'id')::uuid,(r.item->>'after')::integer) on conflict(location_id,product_id) do update set quantity=excluded.quantity,updated_at=now();
 end loop;
 return v_result;
end; $$;
revoke all on function public.place_branch_online_order(text,jsonb) from public,anon,authenticated;
grant execute on function public.place_branch_online_order(text,jsonb) to service_role;


notify pgrst,'reload schema';
commit;
