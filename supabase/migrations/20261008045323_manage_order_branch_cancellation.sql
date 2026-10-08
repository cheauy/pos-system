-- After whole_order_cancel_expected_version. Both manage-order cancellation
-- callers must restore global and branch stock through the versioned wrapper.
-- Acquire the branch lock before the order lock, matching item/online/POS paths.
begin;
do $patch$
declare
 source text := pg_get_functiondef('public.tenh_manage_order(uuid,uuid,timestamptz,text,jsonb)'::regprocedure);
 anchor constant text := $s$  select * into v_order from public.orders o where o.id=p_order_id and o.business_id=p_business_id for update;$s$;
 locked constant text := $s$  perform public.tenh_lock_checkout_branch(p_business_id,public.tenh_request_branch(p_business_id));
  select * into v_order from public.orders o where o.id=p_order_id and o.business_id=p_business_id for update;$s$;
 old_delete constant text := 'perform public.cancel_order(p_order_id, v_reason);';
 old_status constant text := 'perform public.cancel_order(p_order_id,v_reason);';
 new_call constant text := $s$perform public.tenh_run_branch_stock(p_business_id,'cancel_order',jsonb_build_object('p_order_id',p_order_id,'p_reason',v_reason,'p_expected_updated_at',v_order.updated_at));$s$;
begin
 if position(locked in source)>0 and position(old_delete in source)=0 and position(old_status in source)=0
  and (length(source)-length(replace(source,new_call,'')))/length(new_call)=2 then return; end if;
 if (length(source)-length(replace(source,anchor,'')))/length(anchor)<>1
  or (length(source)-length(replace(source,old_delete,'')))/length(old_delete)<>1
  or (length(source)-length(replace(source,old_status,'')))/length(old_status)<>1
  or position($s$errcode='PT409'$s$ in source)=0 then
  raise exception 'Manage-order cancellation caller changed; review this migration before applying.';
 end if;
 execute replace(replace(replace(source,anchor,locked),old_delete,new_call),old_status,new_call);
end $patch$;
commit;
