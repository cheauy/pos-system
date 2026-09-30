begin;

-- Owner-only reversal of a recorded return. The return row is kept (status
-- 'cancelled') for history; its items are snapshotted and removed so every
-- existing "already returned" and order-total calculation stays correct.
alter table public.returns drop constraint if exists returns_status_check;
alter table public.returns add constraint returns_status_check
  check (status = any (array['pending','approved','refunded','exchanged','rejected','cancelled']));
alter table public.returns
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists cancel_reason text,
  add column if not exists cancelled_items jsonb;

-- Same trigger as before, plus one exception: the cancel function may move a
-- refunded return to 'cancelled' (and nothing else) inside its own transaction.
create or replace function public.tenh_refund_drawer_entry()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_order orders%rowtype; v_shift cash_register_shifts%rowtype; v_method text; v_cash numeric; v_paid numeric;
begin
 if tg_op='UPDATE' and old.status='refunded' and coalesce(old.refund_amount,0)>0 then
  if new.status='cancelled' and current_setting('tenh.cancel_return',true)=old.id::text
    and new.refund_amount is not distinct from old.refund_amount and new.refund_method is not distinct from old.refund_method
    and new.order_id is not distinct from old.order_id then return new; end if;
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
end; $function$;

create or replace function public.tenh_cancel_return(p_business_id uuid, p_return_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_user uuid := auth.uid();
  v_branch uuid;
  v_return returns%rowtype;
  v_items jsonb;
  r record;
  v_global integer; v_local integer;
  v_subtotal numeric(12,2); v_discount numeric(12,2); v_delivery numeric(12,2); v_paid numeric(12,2); v_total numeric(12,2);
  v_cash_out numeric := 0;
  v_shift cash_register_shifts%rowtype;
begin
  if v_user is null then raise exception 'Sign in to continue.' using errcode='42501'; end if;
  if not exists (select 1 from business_members where business_id=p_business_id and user_id=v_user and role='owner' and is_active) then
    raise exception 'Only the business Owner can cancel a return.' using errcode='42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 or length(p_reason) > 500 then
    raise exception 'Enter a cancellation reason (3–500 characters).';
  end if;

  select * into v_return from returns where id=p_return_id and business_id=p_business_id for update;
  if not found then raise exception 'Return not found.'; end if;
  if v_return.status='cancelled' then raise exception 'This return is already cancelled.'; end if;

  v_branch := tenh_request_branch(p_business_id);
  if v_branch is null or v_branch is distinct from v_return.location_id then
    raise exception 'Switch to the branch where this return was recorded, then try again.';
  end if;

  -- Imported history never moved stock or cash: just mark it cancelled.
  if v_return.source='system' then
    perform 1 from orders where id=v_return.order_id and business_id=p_business_id for update;
    if not found then raise exception 'The original order is no longer available.'; end if;

    select coalesce(jsonb_agg(jsonb_build_object('order_item_id',order_item_id,'product_id',product_id,'product_name',product_name,
             'quantity',quantity,'unit_price',unit_price,'subtotal',subtotal) order by created_at),'[]'::jsonb)
      into v_items from return_items where return_id=v_return.id;

    for r in select product_id, max(product_name) as product_name, sum(quantity)::integer as quantity
             from return_items where return_id=v_return.id and product_id is not null group by product_id order by product_id loop
      select stock_quantity into v_global from products where id=r.product_id and business_id=p_business_id for update;
      if not found then raise exception 'Product "%" no longer exists; its stock cannot be taken back.', r.product_name; end if;
      select quantity into v_local from product_location_stock
        where business_id=p_business_id and location_id=v_return.location_id and product_id=r.product_id for update;
      if coalesce(v_global,0) < r.quantity or coalesce(v_local,0) < r.quantity then
        raise exception 'Not enough stock to take back "%": % needed, % at this branch. It may have been sold again.',
          r.product_name, r.quantity, coalesce(v_local,0);
      end if;
      update products set stock_quantity=v_global-r.quantity, updated_at=now() where id=r.product_id and business_id=p_business_id;
      update product_location_stock set quantity=v_local-r.quantity, updated_at=now()
        where business_id=p_business_id and location_id=v_return.location_id and product_id=r.product_id;
      insert into inventory_movements(business_id,owner_id,product_id,order_id,return_id,movement_type,quantity,stock_before,stock_after,note)
        values(p_business_id,v_user,r.product_id,v_return.order_id,v_return.id,'stock_out',r.quantity,v_global,v_global-r.quantity,
               'Return cancelled: '||v_return.return_number||'. Reason: '||btrim(p_reason));
    end loop;

    delete from return_items where return_id=v_return.id;

    -- Same recalculation create_order_return uses, now without this return.
    select coalesce(sum(greatest(oi.quantity-coalesce(ret.total_returned,0),0)*oi.unit_price),0) into v_subtotal
    from order_items oi
    left join (select ri.order_item_id, sum(ri.quantity) as total_returned
               from return_items ri join returns rr on rr.id=ri.return_id
               where rr.order_id=v_return.order_id and rr.business_id=p_business_id group by ri.order_item_id) ret
      on ret.order_item_id=oi.id
    where oi.order_id=v_return.order_id;
    select coalesce(discount,0), coalesce(delivery_fee,0), coalesce(amount_paid,0) into v_discount, v_delivery, v_paid
      from orders where id=v_return.order_id and business_id=p_business_id;
    v_total := greatest(0, v_subtotal-v_discount+v_delivery);
    update orders set subtotal=v_subtotal, total=v_total, remaining_balance=greatest(0,v_total-v_paid),
      change_amount=greatest(0,v_paid-v_total), updated_at=now()
    where id=v_return.order_id and business_id=p_business_id;

    -- Put back any cash the refund took out of the drawer.
    select coalesce(sum(amount),0) into v_cash_out from cash_movements
      where business_id=p_business_id and reference='return:'||v_return.id::text and movement_type='cash_out';
    if v_cash_out > 0 then
      select * into v_shift from cash_register_shifts
        where business_id=p_business_id and location_id=v_return.location_id and status='open' for update;
      if not found then raise exception 'Open the register for this branch before cancelling a cash refund.'; end if;
      insert into cash_movements(business_id,shift_id,location_id,created_by,movement_type,amount,reason,reference)
        values(p_business_id,v_shift.id,v_shift.location_id,v_user,'cash_in',v_cash_out,
               'Refund cancelled '||v_return.return_number,'return-cancel:'||v_return.id::text);
    end if;
  end if;

  perform set_config('tenh.cancel_return', v_return.id::text, true);
  update returns set status='cancelled', cancelled_at=now(), cancelled_by=v_user, cancel_reason=btrim(p_reason),
    cancelled_items=v_items
  where id=v_return.id;
  perform set_config('tenh.cancel_return', '', true);

  return jsonb_build_object('returnId', v_return.id, 'cashReturned', v_cash_out);
end; $function$;

revoke all on function public.tenh_cancel_return(uuid,uuid,text) from public, anon;
grant execute on function public.tenh_cancel_return(uuid,uuid,text) to authenticated;
notify pgrst, 'reload schema';
commit;
