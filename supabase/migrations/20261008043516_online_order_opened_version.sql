-- Depends on whole_order_cancel_expected_version and online_order_status_nonretryable_conflict.
-- Require the version displayed by the caller; keep the existing PT409 guards.
begin;

do $patch$
declare
 source text := pg_get_functiondef('public.tenh_run_branch_stock(uuid,text,jsonb)'::regprocedure);
 old_guard constant text := $s$if p_operation='cancel_order' then
   if doc is null$s$;
 new_guard constant text := $s$if p_operation in ('cancel_order','reject_online') then
   if doc is null$s$;
 count_guard integer := (length(source)-length(replace(source,old_guard,'')))/length(old_guard);
begin
 if position(new_guard in source)>0 then return; end if;
 if count_guard<>1 then raise exception 'Cancellation version guard changed; review this migration before applying.'; end if;
 execute replace(source,old_guard,new_guard);
end $patch$;

do $patch$
declare
 source text := pg_get_functiondef('public.tenh_update_online_order_status(uuid,uuid,text,text)'::regprocedure);
 old_payload constant text := $s$jsonb_build_object('p_order_id',p_order,'p_reason','Online order rejected by shop')$s$;
 new_payload constant text := $s$jsonb_build_object('p_order_id',p_order,'p_reason','Online order rejected by shop','p_expected_updated_at',v_order.updated_at)$s$;
 count_payload integer := (length(source)-length(replace(source,old_payload,'')))/length(old_payload);
begin
 if position(new_payload in source)>0 then return; end if;
 if count_payload<>1 then raise exception 'Online rejection caller changed; review this migration before applying.'; end if;
 execute replace(source,old_payload,new_payload);
end $patch$;

do $patch$
declare
 source text := pg_get_functiondef('public.tenh_incoming_order_action(uuid,uuid,text,text,text)'::regprocedure);
 old_header constant text := $s$p_expected text DEFAULT NULL::text)$s$;
 new_header constant text := $s$p_expected text, p_expected_updated_at timestamp with time zone)$s$;
 anchor constant text := $s$ if p_action='status' then$s$;
 guard constant text := $s$ if p_expected_updated_at is null or p_expected is null then
  raise exception 'Refresh the online order before changing it.' using errcode='22023';
 end if;
 select * into target from public.orders where id=p_order and business_id=p_business for update;
 if target.updated_at is distinct from p_expected_updated_at then
  raise exception 'This order changed. Refresh before updating it again.' using errcode='PT409';
 end if;
 if p_action='status' then$s$;
begin
 if position(old_header in source)=0 or position(anchor in source)=0 then
  raise exception 'Incoming order caller changed; review this migration before applying.';
 end if;
 execute replace(replace(source,old_header,new_header),anchor,guard);
end $patch$;

-- PostgREST must not expose the older status-only overload.
revoke all on function public.tenh_incoming_order_action(uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.tenh_update_online_order_status(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.tenh_incoming_order_action(uuid,uuid,text,text,text,timestamptz) from public,anon;
grant execute on function public.tenh_incoming_order_action(uuid,uuid,text,text,text,timestamptz) to authenticated,service_role;
notify pgrst, 'reload schema';
commit;
