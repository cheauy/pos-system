-- Apply after 20260920_subscription_branch_limits.sql. Custom Plan bills total users and branches.
begin;
create or replace function public.create_branch_subscription_order(
 p_business_id uuid,p_requesting_user_id uuid,p_plan_key text,p_term_months integer,p_requested_user_limit integer,p_base_plan_key text,p_requested_branch_limit integer
) returns table(order_id uuid,order_status text)
language plpgsql security definer set search_path=public as $$
declare b businesses%rowtype; v_id uuid; v_users integer; v_monthly numeric; v_discount numeric; v_subtotal numeric; v_term numeric; v_credit numeric:=0; v_kind text; v_total numeric;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Server access required.'; end if;
 select * into b from businesses where id=p_business_id for update;
 if not found or not exists(select 1 from business_members where business_id=p_business_id and user_id=p_requesting_user_id and role='owner' and is_active) then raise exception 'Business owner access required.'; end if;
 if p_plan_key is null or p_term_months is null or p_plan_key not in ('solo','small_team','growth','custom') or p_term_months not in (1,3,6,12) or p_requested_branch_limit not between 1 and 100 or p_requested_user_limit not between 1 and 500 or p_requested_branch_limit is null or p_requested_user_limit is null then raise exception 'Invalid subscription configuration.'; end if;
 v_users:=case p_plan_key when 'solo' then 1 when 'small_team' then 5 else 10 end;
 if p_plan_key='custom' and p_base_plan_key is not null then raise exception 'Custom Plan does not use a base plan. Refresh your checkout.'; end if;
 if p_plan_key<>'custom' and (p_base_plan_key is null or p_plan_key<>p_base_plan_key or p_requested_branch_limit<>1 or p_requested_user_limit<>v_users) then raise exception 'Standard plan allowances cannot be customized.'; end if;
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
 v_monthly:=p_requested_user_limit*5+p_requested_branch_limit*20;
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
 values(p_business_id,p_requesting_user_id,'custom',p_requested_user_limit,p_requested_branch_limit,null,3,p_term_months,v_monthly,v_discount,v_subtotal,v_term,v_credit,v_total,'USD','pending_payment',v_kind,b.subscription_plan_key,b.subscription_user_limit,b.subscription_started_at,b.subscription_expires_at,b.subscription_cycle_value,now()+interval '24 hours') returning id into v_id;
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
 update businesses set subscription_branch_limit=v_limit,subscription_base_plan_key=case when new.pricing_version=3 then null else coalesce(new.base_plan_key,case when new.plan_key='custom' then 'growth' else new.plan_key end) end where id=new.business_id;
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
 if o.pricing_version not in (2,3) then
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
 if o.pricing_version=3 then
  if o.plan_key<>'custom' or o.base_plan_key is not null then raise exception 'Invalid Custom Plan configuration.'; end if;
  v_users:=1;
  v_monthly:=o.requested_user_limit*5+o.requested_branch_limit*20;
 else
  -- Previously submitted base-plan orders keep the price that was agreed at checkout.
  v_monthly:=v_base+(o.requested_user_limit-v_users)*5+(o.requested_branch_limit-1)*20;
 end if;
 if o.requested_user_limit is null or o.requested_branch_limit is null or o.term_months is null or o.term_months not in (1,3,6,12) or o.requested_user_limit not between 1 and 500 or o.requested_branch_limit not between 1 and 100 or o.discount_percent is null or o.monthly_price is null or o.subtotal_amount is null or o.term_price_amount is null or o.total_amount is null or o.remaining_credit_amount is null or v_monthly is null or o.requested_user_limit<v_users or o.discount_percent<>(case o.term_months when 3 then 5 when 6 then 8 when 12 then 10 else 0 end) or o.remaining_credit_amount<0 or o.monthly_price<>v_monthly or o.subtotal_amount<>v_monthly*o.term_months or o.term_price_amount<>round(o.subtotal_amount*(1-o.discount_percent/100),2) or o.total_amount<>o.term_price_amount-o.remaining_credit_amount then raise exception 'Subscription pricing does not match its configuration.'; end if;
 v_expiry:=now()+make_interval(months=>o.term_months);
 update businesses set subscription_plan_key='custom',subscription_base_plan_key=o.base_plan_key,subscription_user_limit=o.requested_user_limit,subscription_branch_limit=o.requested_branch_limit,subscription_team_enabled=o.requested_user_limit>1,max_staff=greatest(0,o.requested_user_limit-1),subscription_monthly_price=o.monthly_price,subscription_discount_percent=o.discount_percent,subscription_cycle_value=o.term_price_amount,subscription_months=o.term_months,subscription_status='active',subscription_started_at=now(),subscription_expires_at=v_expiry,free_url_changes_per_month=2,free_business_mode_changes_per_month=2,is_active=true,disabled_reason=null,disabled_at=null,expired_at=null,deletion_scheduled_at=null,scheduled_deletion_at=null,updated_at=now() where id=b.id;
 update subscription_orders set status='approved',approved_at=now(),reviewed_at=now(),reviewed_by_user_id=p_admin_user_id,reviewed_by_email=p_admin_email,review_note=p_review_note,updated_at=now() where id=o.id;
 insert into subscription_history(business_id,action,months,months_added,previous_expiry,new_expiry,reason,created_by) values(b.id,'extended',o.term_months,o.term_months,b.subscription_expires_at,v_expiry,'Custom subscription payment '||o.id::text,p_admin_user_id);
 return jsonb_build_object('status','approved','new_expiry',v_expiry);
end; $$;
revoke all on function public.review_branch_subscription_order(uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.review_branch_subscription_order(uuid,text,uuid,text,text) to service_role;

notify pgrst,'reload schema';
commit;
