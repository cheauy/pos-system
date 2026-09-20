-- Apply in Supabase SQL Editor before using registered POS checkout / close.
-- Existing checkout, movement and close RPCs remain the permission authorities.
begin;
alter table public.cash_register_shifts add column if not exists register_summary jsonb;
-- Fails safely if historical duplicate open drawers need owner review.
create unique index if not exists tenh_one_open_register_per_branch on public.cash_register_shifts(business_id,location_id) where status='open';

-- Lock the business before its drawer/products, matching branch stock routines.
create or replace function public.tenh_lock_checkout_branch(p_business uuid,p_branch uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from business_members where business_id=p_business and user_id=auth.uid() and is_active) then raise exception 'Active business membership required.'; end if;
 perform tenh_assert_plan_branch(p_business,p_branch);
end; $$;
revoke all on function public.tenh_lock_checkout_branch(uuid,uuid) from public,anon;
grant execute on function public.tenh_lock_checkout_branch(uuid,uuid) to authenticated;

create or replace function public.tenh_pos_checkout_registered(p_business_id uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare v_existing jsonb; v_result jsonb; v_shift cash_register_shifts%rowtype; v_order orders%rowtype;
begin
 -- The original checkout still validates the complete request on retries.
 v_existing:=tenh_pos_checkout_status(p_business_id,(p_input->>'requestId')::uuid);
 if v_existing is not null and v_existing->>'orderId' is not null then
  return tenh_pos_checkout(p_business_id,p_input);
 end if;
 perform tenh_lock_checkout_branch(p_business_id,(p_input->>'branchId')::uuid);
 select * into v_shift from cash_register_shifts where business_id=p_business_id and location_id=(p_input->>'branchId')::uuid and status='open' for update;
 if not found then raise exception 'Open the register for this POS branch before taking payment.'; end if;
 v_result:=tenh_pos_checkout(p_business_id,p_input);
 select * into v_order from orders where id=(v_result->>'orderId')::uuid and business_id=p_business_id for update;
 if not found or v_order.location_id is distinct from v_shift.location_id then raise exception 'POS order branch does not match the open register.'; end if;
 if v_order.register_shift_id is not null and v_order.register_shift_id<>v_shift.id then raise exception 'POS order is linked to a different shift.'; end if;
 update orders set register_shift_id=v_shift.id where id=v_order.id and business_id=p_business_id;
 return v_result;
end; $$;
revoke all on function public.tenh_pos_checkout_registered(uuid,jsonb) from public,anon;
grant execute on function public.tenh_pos_checkout_registered(uuid,jsonb) to authenticated;

-- Cash-out refund entries are recorded in the shift that actually pays the refund,
-- never subtracted later from an already closed original-sale shift.
create or replace function public.tenh_refund_drawer_entry() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_order orders%rowtype; v_shift cash_register_shifts%rowtype; v_method text; v_cash numeric; v_paid numeric;
begin
 if tg_op='UPDATE' and old.status='refunded' and coalesce(old.refund_amount,0)>0 then
  if new.status is distinct from old.status or new.refund_amount is distinct from old.refund_amount or new.refund_method is distinct from old.refund_method or new.order_id is distinct from old.order_id then raise exception 'A recorded refund payout cannot be edited.'; end if;
  return new;
 end if;
 if new.status<>'refunded' or coalesce(new.refund_amount,0)<=0 then return new; end if;
 select * into v_order from orders where id=new.order_id and business_id=new.business_id;
 if not found then raise exception 'Refund order not found in this business.'; end if;
 -- Online refunds keep their existing workflow. This guard applies to POS.
 if v_order.pos_checkout is null then return new; end if;
 v_cash:=coalesce((v_order.pos_checkout->>'cashReceived')::numeric,0);
 v_paid:=greatest(0,coalesce((v_order.pos_checkout#>>'{receipt,amountPaid}')::numeric,v_order.amount_paid,0)-coalesce((v_order.pos_checkout#>>'{receipt,change}')::numeric,v_order.change_amount,0));
 v_method:=coalesce(nullif(current_setting('tenh.refund_method',true),''),nullif(new.refund_method,''));
 if v_method is null then
  if v_cash>0 and v_paid>v_cash then raise exception 'Choose an explicit refund payment method for a split-payment order before refunding.'; end if;
  v_method:=case when v_cash>0 then 'cash' else 'non_cash' end;
 end if;
 new.refund_method:=v_method;
 if v_method not in ('cash','cod') then return new; end if;
 select * into v_shift from cash_register_shifts where business_id=new.business_id and location_id=v_order.location_id and status='open' for update;
 if not found then raise exception 'Open the original POS branch register before paying a cash refund.'; end if;
 if auth.uid() is null then raise exception 'A signed-in staff member must record the cash refund.'; end if;
 insert into cash_movements(business_id,shift_id,location_id,created_by,movement_type,amount,reason,reference)
 values(new.business_id,v_shift.id,v_shift.location_id,auth.uid(),'cash_out',new.refund_amount,'Customer refund '||new.return_number,'return:'||new.id::text);
 return new;
end; $$;
revoke all on function public.tenh_refund_drawer_entry() from public,anon,authenticated;
drop trigger if exists tenh_refund_drawer on public.returns;
create trigger tenh_refund_drawer before insert or update on public.returns for each row execute function public.tenh_refund_drawer_entry();

-- The return amount and authorization remain calculated by the original RPC.
create or replace function public.tenh_create_order_return_accounted(p_order_id uuid,p_reason text,p_items jsonb,p_refund_method text) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare result jsonb;
begin
 if p_refund_method not in ('cash','bank_transfer','other') or p_refund_method is null then raise exception 'Choose the refund payment method.'; end if;
 perform set_config('tenh.refund_method',p_refund_method,true);
 select to_jsonb(create_order_return(p_order_id,p_reason,p_items)) into result;
 perform set_config('tenh.refund_method','',true);
 return result;
end; $$;
revoke all on function public.tenh_create_order_return_accounted(uuid,text,jsonb,text) from public,anon;
grant execute on function public.tenh_create_order_return_accounted(uuid,text,jsonb,text) to authenticated;

create or replace function public.tenh_lock_cash_movement_shift() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 perform 1 from cash_register_shifts where id=new.shift_id and business_id=new.business_id and location_id=new.location_id and status='open' for update;
 if not found then raise exception 'Cash movements require an open register in this branch.'; end if;
 return new;
end; $$;
revoke all on function public.tenh_lock_cash_movement_shift() from public,anon,authenticated;
drop trigger if exists tenh_cash_movement_shift_lock on public.cash_movements;
create trigger tenh_cash_movement_shift_lock before insert on public.cash_movements for each row execute function public.tenh_lock_cash_movement_shift();

create or replace function public.tenh_close_register_accounted(p_business_id uuid,p_shift_id uuid,p_closing_cash numeric,p_note text default null) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare v_shift cash_register_shifts%rowtype; v_cash numeric:=0; v_noncash numeric:=0; v_in numeric:=0; v_out numeric:=0; v_refunds numeric:=0; v_expected numeric; v_summary jsonb;
begin
 if p_closing_cash is null or p_closing_cash<0 or p_closing_cash<>round(p_closing_cash,2) then raise exception 'Enter counted cash with at most two decimal places.'; end if;
 select * into v_shift from cash_register_shifts where id=p_shift_id and business_id=p_business_id for update;
 if not found or v_shift.status<>'open' then raise exception 'This register shift is not open.'; end if;
 -- Preserve the existing close permission checks and side effects. Any later
 -- failure rolls back this close in the same transaction.
 perform close_cash_register_shift(p_business_id,p_shift_id,p_closing_cash,p_note);
 select coalesce(sum(cash),0),coalesce(sum(greatest(0,received-cash)),0) into v_cash,v_noncash from (
  select case when o.pos_checkout is not null then greatest(0,coalesce((o.pos_checkout->>'cashReceived')::numeric,0)) when o.payment_method in ('cash','cod') then greatest(0,coalesce(o.amount_paid,0)-coalesce(o.change_amount,0)) else 0 end cash,
  greatest(0,coalesce((o.pos_checkout#>>'{receipt,amountPaid}')::numeric,o.amount_paid,0)-coalesce((o.pos_checkout#>>'{receipt,change}')::numeric,o.change_amount,0)) received
  from orders o where o.business_id=p_business_id and o.register_shift_id=p_shift_id and (o.pos_checkout is not null or o.status not in ('cancelled','refunded'))
 ) payments;
 select coalesce(sum(amount) filter(where movement_type='cash_in'),0),coalesce(sum(amount) filter(where movement_type='cash_out'),0),coalesce(sum(amount) filter(where movement_type='cash_out' and reference like 'return:%'),0) into v_in,v_out,v_refunds from cash_movements where business_id=p_business_id and shift_id=p_shift_id;
 v_expected:=round(v_shift.opening_cash+v_cash+v_in-v_out,2);
 v_summary:=jsonb_build_object('cash',v_cash,'noncash',v_noncash,'incoming',v_in,'outgoing',v_out,'refunds',v_refunds,'expected',v_expected);
 update cash_register_shifts set expected_cash=v_expected,variance=round(p_closing_cash-v_expected,2),register_summary=v_summary where id=p_shift_id and business_id=p_business_id;
 if not found then raise exception 'Register totals could not be saved.'; end if;
 return v_summary||jsonb_build_object('closing_cash',p_closing_cash,'variance',round(p_closing_cash-v_expected,2));
end; $$;
revoke all on function public.tenh_close_register_accounted(uuid,uuid,numeric,text) from public,anon;
grant execute on function public.tenh_close_register_accounted(uuid,uuid,numeric,text) to authenticated;
notify pgrst,'reload schema';
commit;
