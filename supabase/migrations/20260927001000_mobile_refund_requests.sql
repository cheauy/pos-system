begin;

-- Additive: existing website refunds keep their current procedure. Native
-- clients retain a request ID so a lost response never causes a second refund.
create table if not exists public.mobile_refund_requests (
  business_id uuid not null references public.businesses(id) on delete cascade,
  request_id uuid not null,
  location_id uuid not null references public.business_locations(id),
  created_by uuid not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (business_id, request_id)
);
alter table public.mobile_refund_requests enable row level security;
revoke all on public.mobile_refund_requests from public, anon, authenticated;

create or replace function public.tenh_mobile_return(
  p_business_id uuid, p_branch_id uuid, p_request_id uuid,
  p_order_id uuid, p_reason text, p_items jsonb, p_refund_method text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare saved public.mobile_refund_requests%rowtype; payload jsonb; result jsonb; item jsonb; return_id uuid; failure text;
begin
  if auth.uid() is null then raise exception 'Sign in to continue.' using errcode='42501'; end if;
  perform public.tenh_assert_effective_permission(p_business_id,'orders.return');
  if p_branch_id is null or public.tenh_request_branch(p_business_id) is distinct from p_branch_id then
    raise exception 'The refund is outside your operating branch.' using errcode='42501';
  end if;
  perform public.tenh_assert_plan_branch(p_business_id,p_branch_id);
  if p_request_id is null or p_order_id is null or p_reason is null or length(btrim(p_reason))<3 or length(p_reason)>500
    or p_refund_method is null or p_refund_method not in ('cash','bank_transfer','other') then raise exception 'Review the return details.'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Choose return items.'; end if;
  if jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>100 then raise exception 'Choose 1–100 return items.'; end if;
  for item in select value from jsonb_array_elements(p_items) loop
    if (item->>'order_item_id')::uuid is null or jsonb_typeof(item->'quantity') is distinct from 'number'
      or (item->>'quantity')::numeric < 1 or (item->>'quantity')::numeric > 999999
      or (item->>'quantity')::numeric <> trunc((item->>'quantity')::numeric) then raise exception 'Enter positive whole return quantities.'; end if;
  end loop;
  if (select count(distinct (value->>'order_item_id')::uuid) from jsonb_array_elements(p_items)) <> jsonb_array_length(p_items) then raise exception 'Each item may appear only once.'; end if;
  payload:=jsonb_build_object('orderId',p_order_id,'reason',btrim(p_reason),'items',p_items,'method',p_refund_method);
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||':'||p_request_id::text,0));
  select * into saved from public.mobile_refund_requests where business_id=p_business_id and request_id=p_request_id;
  if found then
    if saved.created_by is distinct from auth.uid() or saved.location_id is distinct from p_branch_id or saved.payload is distinct from payload then
      raise exception 'This refund request was already used with different details.';
    end if;
    return saved.result;
  end if;
  -- Roll back accounting failures, then persist their terminal outcome. A retry
  -- must never turn a rejected request into a second, unexpected refund.
  begin
  perform id from public.orders where id=p_order_id and business_id=p_business_id and location_id=p_branch_id for update;
  if not found then raise exception 'Order not found in this branch.'; end if;
  result:=public.tenh_run_branch_stock(p_business_id,'return_order',jsonb_build_object(
    'p_order_id',p_order_id,'p_reason',btrim(p_reason),'p_items',p_items,'p_refund_method',p_refund_method));
  return_id:=case when jsonb_typeof(result)='string' then (result#>>'{}')::uuid
    when jsonb_typeof(result)='array' then coalesce(result->0->>'return_id',result->0->>'id')::uuid
    else coalesce(result->>'return_id',result->>'id')::uuid end;
  if return_id is null then raise exception 'Refund result was not confirmed. The transaction has been rolled back.'; end if;
  result:=jsonb_build_object('returnId',return_id);
  exception when others then
    get stacked diagnostics failure=message_text;
    result:=jsonb_build_object('rolledBack',true,'error',failure);
  end;
  insert into public.mobile_refund_requests(business_id,request_id,location_id,created_by,payload,result)
    values(p_business_id,p_request_id,p_branch_id,auth.uid(),payload,result);
  return result;
end $$;

create or replace function public.tenh_mobile_return_status(p_business_id uuid,p_branch_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to continue.' using errcode='42501'; end if;
  perform public.tenh_assert_effective_permission(p_business_id,'orders.return');
  if p_branch_id is null or public.tenh_request_branch(p_business_id) is distinct from p_branch_id then
    raise exception 'This request is outside your operating branch.' using errcode='42501';
  end if;
  select r.result into result from public.mobile_refund_requests r where r.business_id=p_business_id and r.request_id=p_request_id
    and r.location_id=p_branch_id and r.created_by=auth.uid();
  return result;
end $$;
revoke all on function public.tenh_mobile_return(uuid,uuid,uuid,uuid,text,jsonb,text) from public,anon;
revoke all on function public.tenh_mobile_return_status(uuid,uuid,uuid) from public,anon;
grant execute on function public.tenh_mobile_return(uuid,uuid,uuid,uuid,text,jsonb,text) to authenticated;
grant execute on function public.tenh_mobile_return_status(uuid,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
