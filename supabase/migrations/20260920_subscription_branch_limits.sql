-- Apply before deploying branch-aware checkout. No historical data is deleted.
begin;
alter table public.businesses add column if not exists subscription_branch_limit integer not null default 1 check (subscription_branch_limit between 1 and 100);
alter table public.businesses add column if not exists subscription_base_plan_key text;
alter table public.subscription_orders add column if not exists requested_branch_limit integer not null default 1 check (requested_branch_limit between 1 and 100);
alter table public.subscription_orders add column if not exists base_plan_key text;
alter table public.subscription_orders add column if not exists pricing_version integer not null default 1;

create or replace function public.tenh_branch_limit(p_business_id uuid) returns integer
language sql stable security definer set search_path=public as $$
select case when subscription_status='active' and subscription_plan_key='custom' then subscription_branch_limit else 1 end from businesses where id=p_business_id;
$$;
revoke all on function public.tenh_branch_limit(uuid) from public,anon,authenticated;

create or replace function public.tenh_guard_branch_capacity() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_limit integer;
begin
 if tg_op='UPDATE' and new.business_id<>old.business_id then raise exception 'A branch cannot move to another business.'; end if;
 if not new.is_active then return new; end if;
 if tg_op='UPDATE' and old.is_active then return new; end if;
 perform 1 from businesses where id=new.business_id for update;
 v_limit:=tenh_branch_limit(new.business_id);
 if v_limit is null or (select count(*) from business_locations where business_id=new.business_id and is_active and id<>new.id)>=v_limit then raise exception 'Branch limit reached. Upgrade Custom Plan before adding another branch.'; end if;
 return new;
end; $$;
drop trigger if exists tenh_branch_capacity on public.business_locations;
create trigger tenh_branch_capacity before insert or update of is_active,business_id on public.business_locations for each row execute function public.tenh_guard_branch_capacity();

create or replace function public.tenh_assert_plan_branch(p_business_id uuid,p_location_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 perform 1 from businesses where id=p_business_id for update;
 if not exists(select 1 from business_locations where business_id=p_business_id and id=p_location_id and is_active) then raise exception 'Choose an active branch in this business.'; end if;
 if (select count(*) from business_locations where business_id=p_business_id and is_active)>tenh_branch_limit(p_business_id) then raise exception 'Active branches exceed the subscription. Deactivate unused branches or upgrade.'; end if;
end; $$;
revoke all on function public.tenh_assert_plan_branch(uuid,uuid) from public,anon,authenticated;

create or replace function public.tenh_guard_branch_record() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if tg_op='UPDATE' and new.business_id<>old.business_id then raise exception 'Records cannot move between businesses.'; end if;
 if new.location_id is null then
  select id into new.location_id from business_locations where business_id=new.business_id and is_default and is_active;
  if new.location_id is null then raise exception 'Set an active default branch first.'; end if;
 end if;
 perform tenh_assert_plan_branch(new.business_id,new.location_id);
 if tg_table_name='product_location_stock' then
  if not exists(select 1 from products where id=new.product_id and business_id=new.business_id) then raise exception 'Product does not belong to this business.'; end if;
 end if;
 return new;
end; $$;
drop trigger if exists tenh_order_branch on public.orders;
create trigger tenh_order_branch before insert on public.orders for each row execute function public.tenh_guard_branch_record();
drop trigger if exists tenh_register_branch on public.cash_register_shifts;
create trigger tenh_register_branch before insert on public.cash_register_shifts for each row execute function public.tenh_guard_branch_record();
drop trigger if exists tenh_stock_branch on public.product_location_stock;
create trigger tenh_stock_branch before insert or update of business_id,location_id,product_id on public.product_location_stock for each row execute function public.tenh_guard_branch_record();

create or replace function public.tenh_guard_member_capacity() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_limit integer;
begin
 if tg_op='UPDATE' and new.business_id<>old.business_id then raise exception 'Membership cannot move between businesses.'; end if;
 if new.default_location_id is not null and not exists(select 1 from business_locations where id=new.default_location_id and business_id=new.business_id and is_active) then raise exception 'Staff branch must belong to this business and be active.'; end if;
 if not new.is_active then return new; end if;
 if tg_op='UPDATE' and old.is_active then return new; end if;
 select subscription_user_limit into v_limit from businesses where id=new.business_id for update;
 if v_limit is not null and (select count(*) from business_members where business_id=new.business_id and is_active and id<>new.id)>=v_limit then raise exception 'User limit reached. Purchase additional seats first.'; end if;
 return new;
end; $$;
drop trigger if exists tenh_member_capacity on public.business_members;
create trigger tenh_member_capacity before insert or update of is_active,business_id,default_location_id on public.business_members for each row execute function public.tenh_guard_member_capacity();

create or replace function public.create_branch_subscription_order(
 p_business_id uuid,p_requesting_user_id uuid,p_plan_key text,p_term_months integer,p_requested_user_limit integer,p_base_plan_key text,p_requested_branch_limit integer
) returns table(order_id uuid,order_status text)
language plpgsql security definer set search_path=public as $$
declare b businesses%rowtype; v_id uuid; v_users integer; v_base numeric; v_monthly numeric; v_discount numeric; v_subtotal numeric; v_term numeric; v_credit numeric:=0; v_kind text; v_total numeric;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Server access required.'; end if;
 select * into b from businesses where id=p_business_id for update;
 if not found or not exists(select 1 from business_members where business_id=p_business_id and user_id=p_requesting_user_id and role='owner' and is_active) then raise exception 'Business owner access required.'; end if;
 if p_base_plan_key is null or p_plan_key is null or p_term_months is null or p_base_plan_key not in ('solo','small_team','growth') or p_plan_key not in ('solo','small_team','growth','custom') or p_term_months not in (1,3,6,12) or p_requested_branch_limit not between 1 and 100 or p_requested_user_limit not between 1 and 500 or p_requested_branch_limit is null or p_requested_user_limit is null then raise exception 'Invalid subscription configuration.'; end if;
 v_users:=case p_base_plan_key when 'solo' then 1 when 'small_team' then 5 else 10 end;
 v_base:=case p_base_plan_key when 'solo' then 10 when 'small_team' then 18 else 38 end;
 if p_requested_user_limit<v_users then raise exception 'User count is below the base allowance.'; end if;
 if p_plan_key<>'custom' and (p_plan_key<>p_base_plan_key or p_requested_branch_limit<>1 or p_requested_user_limit<>v_users) then raise exception 'Standard plan allowances cannot be customized.'; end if;
 if (select count(*) from business_members where business_id=p_business_id and is_active)>p_requested_user_limit then raise exception 'Deactivate unused users or purchase enough seats.'; end if;
 if (select count(*) from business_locations where business_id=p_business_id and is_active)>p_requested_branch_limit then raise exception 'Deactivate unused branches or purchase enough branches.'; end if;
 if b.subscription_status='active' and b.subscription_expires_at>now() then
  if p_requested_user_limit<coalesce(b.subscription_user_limit,1) or p_requested_branch_limit<tenh_branch_limit(b.id) then raise exception 'Cannot reduce paid capacity mid-term.'; end if;
  if b.subscription_plan_key='custom' and p_plan_key<>'custom' then raise exception 'Cannot downgrade Custom Plan mid-term.'; end if;
 end if;
 if p_plan_key<>'custom' then
  return query select r.order_id,r.order_status from public.create_subscription_order(p_business_id => p_business_id,p_requesting_user_id => p_requesting_user_id,p_plan_key => p_plan_key,p_term_months => p_term_months,p_requested_user_limit => p_requested_user_limit) r;
  return;
 end if;
 if exists(select 1 from subscription_orders where business_id=p_business_id and status='payment_submitted') then raise exception 'A payment is already under review.'; end if;
 v_monthly:=v_base+(p_requested_user_limit-v_users)*5+(p_requested_branch_limit-1)*20;
 v_discount:=case p_term_months when 3 then 5 when 6 then 8 when 12 then 10 else 0 end;
 v_subtotal:=v_monthly*p_term_months; v_term:=round(v_subtotal*(1-v_discount/100),2);
 v_kind:=case when b.subscription_status='expired' then 'reactivation' when b.subscription_status='active' and b.subscription_expires_at>now() and b.subscription_plan_key in ('solo','small_team','growth','custom') then 'upgrade' else 'activation' end;
 if v_kind='upgrade' and b.subscription_started_at<b.subscription_expires_at then
  v_credit:=round(coalesce(b.subscription_cycle_value,0)*least(1,greatest(0,extract(epoch from (b.subscription_expires_at-now()))/nullif(extract(epoch from (b.subscription_expires_at-b.subscription_started_at)),0))),2);
 end if;
 v_credit:=least(v_credit,v_term); v_total:=v_term-v_credit;
 if v_total<0.50 then raise exception 'Credit covers this selection. Choose a longer term or larger plan.'; end if;
 update subscription_orders set status='cancelled',cancelled_at=now(),updated_at=now() where business_id=p_business_id and status in ('pending_payment','quote_requested');
 insert into subscription_orders(business_id,requested_by_user_id,plan_key,requested_user_limit,requested_branch_limit,base_plan_key,pricing_version,term_months,monthly_price,discount_percent,subtotal_amount,term_price_amount,remaining_credit_amount,total_amount,currency,status,order_kind,current_plan_key,current_user_limit,current_subscription_started_at,current_subscription_expires_at,current_cycle_value,pricing_locked_until)
 values(p_business_id,p_requesting_user_id,'custom',p_requested_user_limit,p_requested_branch_limit,p_base_plan_key,2,p_term_months,v_monthly,v_discount,v_subtotal,v_term,v_credit,v_total,'USD','pending_payment',v_kind,b.subscription_plan_key,b.subscription_user_limit,b.subscription_started_at,b.subscription_expires_at,b.subscription_cycle_value,now()+interval '24 hours') returning id into v_id;
 return query select v_id,'pending_payment'::text;
end; $$;
revoke all on function public.create_branch_subscription_order(uuid,uuid,text,integer,integer,text,integer) from public,anon,authenticated;
grant execute on function public.create_branch_subscription_order(uuid,uuid,text,integer,integer,text,integer) to service_role;

-- Standard plans retain the existing approval procedure; Custom Plan uses the wrapper below.
-- This trigger runs in its transaction and rolls back incompatible approvals.
create or replace function public.tenh_apply_approved_branch_plan() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_limit integer;
begin
 if new.status<>'approved' or old.status='approved' then return new; end if;
 perform 1 from businesses where id=new.business_id for update;
 v_limit:=case when new.plan_key='custom' then new.requested_branch_limit else 1 end;
 if (select count(*) from business_locations where business_id=new.business_id and is_active)>v_limit then raise exception 'The payment plan has fewer branches than are active.'; end if;
 if (select count(*) from business_members where business_id=new.business_id and is_active)>new.requested_user_limit then raise exception 'The payment plan has fewer seats than are active.'; end if;
 update businesses set subscription_branch_limit=v_limit,subscription_base_plan_key=coalesce(new.base_plan_key,case when new.plan_key='custom' then 'growth' else new.plan_key end) where id=new.business_id;
 return new;
end; $$;
drop trigger if exists tenh_apply_branch_plan on public.subscription_orders;
create trigger tenh_apply_branch_plan before update of status on public.subscription_orders for each row execute function public.tenh_apply_approved_branch_plan();

create or replace function public.review_branch_subscription_order(p_order_id uuid,p_decision text,p_admin_user_id uuid,p_admin_email text,p_review_note text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare o subscription_orders%rowtype; b businesses%rowtype; v_business uuid; v_expiry timestamptz; v_result jsonb; v_monthly numeric; v_users integer; v_base numeric;
begin
 if coalesce(auth.role(),'')<>'service_role' or not exists(select 1 from profiles where id=p_admin_user_id and role='super_admin' and is_active) then raise exception 'Super Admin server access required.'; end if;
 select business_id into v_business from subscription_orders where id=p_order_id;
 select * into b from businesses where id=v_business for update;
 select * into o from subscription_orders where id=p_order_id for update;
 if not found then raise exception 'Subscription order not found.'; end if;
 if o.pricing_version<>2 then
  select to_jsonb(r) into v_result from review_subscription_order(p_order_id => p_order_id,p_decision => p_decision,p_admin_user_id => p_admin_user_id,p_admin_email => p_admin_email,p_review_note => p_review_note) r;
  return v_result;
 end if;
 if p_decision='approve' and o.status='approved' then return jsonb_build_object('new_expiry',b.subscription_expires_at); end if;
 if p_decision not in ('approve','reject') or p_decision is null or o.status<>'payment_submitted' then raise exception 'Only a submitted payment can be reviewed.'; end if;
 if p_decision='reject' then
  update subscription_orders set status='rejected',rejected_at=now(),reviewed_at=now(),reviewed_by_user_id=p_admin_user_id,reviewed_by_email=p_admin_email,review_note=p_review_note,updated_at=now() where id=o.id;
  return jsonb_build_object('status','rejected');
 end if;
 if o.payment_note is null or o.proof_bucket is null or o.proof_path is null or o.total_amount<0.50 then raise exception 'Payment note, proof and valid amount are required.'; end if;
 if not b.is_active and coalesce(b.disabled_reason,'')<>'subscription_expired' then raise exception 'Resolve the business suspension before payment approval.'; end if;
 if b.subscription_user_limit is distinct from o.current_user_limit or b.subscription_plan_key is distinct from o.current_plan_key or b.subscription_started_at is distinct from o.current_subscription_started_at or b.subscription_expires_at is distinct from o.current_subscription_expires_at then raise exception 'Subscription changed after checkout. Recreate the payment order.'; end if;
 if (select count(*) from business_members where business_id=b.id and is_active)>o.requested_user_limit or (select count(*) from business_locations where business_id=b.id and is_active)>o.requested_branch_limit then raise exception 'The plan no longer covers active users or branches.'; end if;
 v_users:=case o.base_plan_key when 'solo' then 1 when 'small_team' then 5 when 'growth' then 10 else null end;
 v_base:=case o.base_plan_key when 'solo' then 10 when 'small_team' then 18 when 'growth' then 38 else null end;
 v_monthly:=v_base+(o.requested_user_limit-v_users)*5+(o.requested_branch_limit-1)*20;
 if v_monthly is null or o.requested_user_limit<v_users or o.discount_percent<>(case o.term_months when 3 then 5 when 6 then 8 when 12 then 10 else 0 end) or o.remaining_credit_amount<0 or o.monthly_price<>v_monthly or o.subtotal_amount<>v_monthly*o.term_months or o.term_price_amount<>round(o.subtotal_amount*(1-o.discount_percent/100),2) or o.total_amount<>o.term_price_amount-o.remaining_credit_amount then raise exception 'Subscription pricing does not match its configuration.'; end if;
 v_expiry:=now()+make_interval(months=>o.term_months);
 update businesses set subscription_plan_key='custom',subscription_base_plan_key=o.base_plan_key,subscription_user_limit=o.requested_user_limit,subscription_branch_limit=o.requested_branch_limit,subscription_team_enabled=o.requested_user_limit>1,max_staff=greatest(0,o.requested_user_limit-1),subscription_monthly_price=o.monthly_price,subscription_discount_percent=o.discount_percent,subscription_cycle_value=o.term_price_amount,subscription_months=o.term_months,subscription_status='active',subscription_started_at=now(),subscription_expires_at=v_expiry,free_url_changes_per_month=2,free_business_mode_changes_per_month=2,is_active=true,disabled_reason=null,disabled_at=null,expired_at=null,deletion_scheduled_at=null,scheduled_deletion_at=null,updated_at=now() where id=b.id;
 update subscription_orders set status='approved',approved_at=now(),reviewed_at=now(),reviewed_by_user_id=p_admin_user_id,reviewed_by_email=p_admin_email,review_note=p_review_note,updated_at=now() where id=o.id;
 insert into subscription_history(business_id,action,months,months_added,previous_expiry,new_expiry,reason,created_by) values(b.id,'extended',o.term_months,o.term_months,b.subscription_expires_at,v_expiry,'Custom subscription payment '||o.id::text,p_admin_user_id);
 return jsonb_build_object('status','approved','new_expiry',v_expiry);
end; $$;
revoke all on function public.review_branch_subscription_order(uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.review_branch_subscription_order(uuid,text,uuid,text,text) to service_role;

create or replace function public.tenh_guard_transfer_branches() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.source_location_id=new.destination_location_id then raise exception 'Transfer branches must differ.'; end if;
 if tg_op='INSERT' or new.status is distinct from old.status or new.source_location_id is distinct from old.source_location_id or new.destination_location_id is distinct from old.destination_location_id then
  if new.status in ('draft','sent','received') then
   perform tenh_assert_plan_branch(new.business_id,new.source_location_id);
   perform tenh_assert_plan_branch(new.business_id,new.destination_location_id);
  end if;
 end if;
 return new;
end; $$;
drop trigger if exists tenh_transfer_branches on public.stock_transfers;
create trigger tenh_transfer_branches before insert or update on public.stock_transfers for each row execute function public.tenh_guard_transfer_branches();


alter table public.stock_adjustments add column if not exists location_id uuid references public.business_locations(id);
create or replace function public.tenh_label_stock_adjustment_branch() returns trigger language plpgsql security definer set search_path=public as $$
begin
 new.location_id:=nullif(current_setting('tenh.adjustment_branch',true),'')::uuid;
 if new.location_id is not null then perform tenh_assert_plan_branch(new.business_id,new.location_id); end if;
 return new;
end; $$;
drop trigger if exists tenh_adjustment_branch on public.stock_adjustments;
create trigger tenh_adjustment_branch before insert on public.stock_adjustments for each row execute function public.tenh_label_stock_adjustment_branch();
create or replace function public.adjust_branch_product_stock(p_business_id uuid,p_location_id uuid,p_product_id uuid,p_mode text,p_quantity integer,p_reason text,p_reference text default null) returns void
language plpgsql security invoker set search_path=public as $$
declare v_global integer; v_before integer; v_after integer; v_delta integer;
begin
 -- Delegate the business/role authorization and global audit to the existing RPC.
 if p_mode not in ('increase','decrease','set') or p_mode is null or p_quantity is null or p_quantity<0 or (p_mode<>'set' and p_quantity=0) then raise exception 'Invalid stock adjustment.'; end if;
 select stock_quantity into v_global from products where id=p_product_id and business_id=p_business_id for update;
 if not found then raise exception 'Product not found in this business.'; end if;
 if not exists(select 1 from business_locations where id=p_location_id and business_id=p_business_id and is_active) then raise exception 'Choose an active branch.'; end if;
 select quantity into v_before from product_location_stock where business_id=p_business_id and location_id=p_location_id and product_id=p_product_id for update;
 if (select count(*) from business_locations where business_id=p_business_id)=1 then v_before:=v_global; else v_before:=coalesce(v_before,0); end if;
 v_after:=case p_mode when 'increase' then v_before+p_quantity when 'decrease' then v_before-p_quantity else p_quantity end;
 if v_after<0 then raise exception 'Not enough stock in this branch.'; end if;
 v_delta:=v_after-v_before;
 if v_delta=0 then return; end if;
 perform set_config('tenh.adjustment_branch',p_location_id::text,true);
 perform public.adjust_product_stock(p_product_id=>p_product_id,p_mode=>case when v_delta>0 then 'increase' else 'decrease' end,p_quantity=>abs(v_delta),p_reason=>p_reason,p_reference=>p_reference);
 insert into product_location_stock(business_id,location_id,product_id,quantity) values(p_business_id,p_location_id,p_product_id,v_after) on conflict(location_id,product_id) do update set quantity=excluded.quantity,updated_at=now();
 if (select coalesce(sum(quantity),0) from product_location_stock where business_id=p_business_id and product_id=p_product_id)>(select stock_quantity from products where id=p_product_id and business_id=p_business_id) then raise exception 'Branch stock exceeds total stock. Reconcile inventory before adjusting.'; end if;
 perform set_config('tenh.adjustment_branch','',true);
end; $$;
revoke all on function public.adjust_branch_product_stock(uuid,uuid,uuid,text,integer,text,text) from public,anon;
grant execute on function public.adjust_branch_product_stock(uuid,uuid,uuid,text,integer,text,text) to authenticated;

create or replace function public.tenh_protect_branch_entitlement() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if auth.role() is not null and auth.role()<>'service_role' and (new.subscription_branch_limit is distinct from old.subscription_branch_limit or new.subscription_base_plan_key is distinct from old.subscription_base_plan_key) then raise exception 'Branch entitlement changes require an approved subscription payment.'; end if;
 return new;
end; $$;
drop trigger if exists tenh_protect_branch_entitlement on public.businesses;
create trigger tenh_protect_branch_entitlement before update of subscription_branch_limit,subscription_base_plan_key on public.businesses for each row execute function public.tenh_protect_branch_entitlement();

-- The public store fulfills from its default branch. Reserve exact branch stock
-- in the same transaction as the existing price/option/coupon checkout RPC.
create or replace function public.place_branch_online_order(p_business_slug text,p_checkout jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_business uuid; v_location uuid; v_locations integer; r record; v_stock integer; v_global integer; v_reserved jsonb:='[]'; v_result jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Server access required.'; end if;
 select id into v_business from businesses where slug=p_business_slug and is_active for update;
 if v_business is null then raise exception 'Store not found.'; end if;
 select id into v_location from business_locations where business_id=v_business and is_default and is_active;
 perform tenh_assert_plan_branch(v_business,v_location);
 select count(*) into v_locations from business_locations where business_id=v_business;
 for r in select (item->>'productId')::uuid product_id,sum((item->>'quantity')::integer)::integer quantity from jsonb_array_elements(p_checkout->'p_items') item group by 1 order by 1 loop
  if r.quantity is null or r.quantity<1 or r.quantity>999 then raise exception 'Invalid product quantity.'; end if;
  select stock_quantity into v_global from products where id=r.product_id and business_id=v_business for update;
  if not found then raise exception 'Product not found.'; end if;
  select quantity into v_stock from product_location_stock where product_id=r.product_id and location_id=v_location and business_id=v_business for update;
  v_stock:=case when v_locations=1 then v_global else least(v_global,coalesce(v_stock,0)) end;
  if r.quantity>v_stock then raise exception 'Not enough stock in the store fulfillment branch.'; end if;
  v_reserved:=v_reserved||jsonb_build_object('id',r.product_id,'after',v_stock-r.quantity);
 end loop;
 v_result:=public.place_online_order(p_business_slug=>p_business_slug,p_items=>p_checkout->'p_items',p_fulfillment_type=>p_checkout->>'p_fulfillment_type',p_guest_name=>p_checkout->>'p_guest_name',p_guest_phone=>p_checkout->>'p_guest_phone',p_guest_address=>p_checkout->>'p_guest_address',p_customer_note=>p_checkout->>'p_customer_note',p_table_token=>(p_checkout->>'p_table_token')::uuid,p_payment_method=>p_checkout->>'p_payment_method',p_payment_reference=>p_checkout->>'p_payment_reference',p_delivery_zone_id=>(p_checkout->>'p_delivery_zone_id')::uuid,p_requested_for=>(p_checkout->>'p_requested_for')::timestamptz,p_coupon_code=>p_checkout->>'p_coupon_code');
 for r in select value as item from jsonb_array_elements(v_reserved) loop
  insert into product_location_stock(business_id,location_id,product_id,quantity) values(v_business,v_location,(r.item->>'id')::uuid,(r.item->>'after')::integer) on conflict(location_id,product_id) do update set quantity=excluded.quantity,updated_at=now();
 end loop;
 return v_result;
end; $$;
revoke all on function public.place_branch_online_order(text,jsonb) from public,anon,authenticated;
grant execute on function public.place_branch_online_order(text,jsonb) to service_role;

create or replace function public.tenh_guard_expense_branch() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.location_id is not null then perform tenh_assert_plan_branch(new.business_id,new.location_id); end if;
 return new;
end; $$;
drop trigger if exists tenh_expense_branch on public.expenses;
create trigger tenh_expense_branch before insert or update of location_id,business_id on public.expenses for each row execute function public.tenh_guard_expense_branch();
notify pgrst,'reload schema';
commit;
