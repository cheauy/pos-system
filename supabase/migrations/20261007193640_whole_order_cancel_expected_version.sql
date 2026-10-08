-- Lock and compare the opened version before stock or finance work. No client-only check.
-- Update the last-item nested caller atomically with the wrapper; its already-locked version is authoritative.
-- Existing permission, branch/plan, stock, owner and ACL checks remain. Paid/refunded orders must use returns.
begin;
do $patch$
declare
  source text := pg_get_functiondef('public.tenh_run_branch_stock(uuid,text,jsonb)'::regprocedure);
  anchor constant text := $s$  select to_jsonb(o) into doc from orders o where id=(p_payload->>'p_order_id')::uuid and business_id=p_business and location_id=b for update;$s$;
  guarded constant text := $s$  select to_jsonb(o) into doc from orders o where id=(p_payload->>'p_order_id')::uuid and business_id=p_business and location_id=b for update;
  if p_operation='cancel_order' then
   if doc is null or doc->>'archived_at' is not null then raise exception 'Order not found in this branch.'; end if;
   if nullif(p_payload->>'p_expected_updated_at','') is null then raise exception 'Refresh the order before cancelling it.' using errcode='22023'; end if;
   if (doc->>'updated_at')::timestamptz is distinct from (p_payload->>'p_expected_updated_at')::timestamptz then
    raise exception 'This order changed. Refresh before cancelling it.' using errcode='PT409';
   end if;
   if coalesce((doc->>'amount_paid')::numeric,0)<>0 or coalesce((doc->>'change_amount')::numeric,0)<>0
    or doc->>'payment_status' in ('paid','refunded','pending_verification') or nullif(doc->>'payment_reference','') is not null
    or doc->>'payment_method'='credit' or coalesce((doc->>'credit_amount')::numeric,0)<>0
    or coalesce((doc->>'loyalty_points_earned')::numeric,0)<>0 or doc->>'pos_checkout' is not null
    or doc->>'coupon_id' is not null or coalesce((doc->>'coupon_discount')::numeric,0)<>0
    or exists(select 1 from public.returns where order_id=(doc->>'id')::uuid and business_id=p_business)
    or exists(select 1 from public.tenh_pos_points_used where order_id=(doc->>'id')::uuid) then
    raise exception 'This order has payment or pricing history. Use Return items / check refund before cancelling.';
   end if;
  end if;$s$;
  count_anchor integer := (length(source)-length(replace(source,anchor,'')))/length(anchor);
begin
  if position(guarded in source)>0 then return; end if;
  if count_anchor<>1 then raise exception 'Whole-order cancellation body changed; review this migration before applying.'; end if;
  execute replace(source,anchor,guarded);
end $patch$;
do $patch$
declare
  source text := pg_get_functiondef('public.tenh_cancel_order_item(uuid,uuid,uuid,timestamptz,text)'::regprocedure);
  old_payload constant text := $s$jsonb_build_object('p_order_id',p_order_id,'p_reason',reason)$s$;
  new_payload constant text := $s$jsonb_build_object('p_order_id',p_order_id,'p_reason',reason,'p_expected_updated_at',sale.updated_at)$s$;
  old_count integer := (length(source)-length(replace(source,old_payload,'')))/length(old_payload);
begin
  if old_count=0 and position(new_payload in source)>0 then return; end if;
  if old_count<>1 then raise exception 'Last-item cancellation caller changed; review this migration before applying.'; end if;
  execute replace(source,old_payload,new_payload);
end $patch$;
commit;
