begin;

-- Additive mobile retry history; existing website purchase receiving is unchanged.
create table if not exists public.mobile_purchase_receipts (
  business_id uuid not null references public.businesses(id) on delete cascade,
  request_id uuid not null,
  location_id uuid not null references public.business_locations(id),
  created_by uuid not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (business_id, request_id)
);
alter table public.mobile_purchase_receipts enable row level security;
revoke all on public.mobile_purchase_receipts from public, anon, authenticated;

create or replace function public.tenh_mobile_receive_purchase(
  p_business_id uuid, p_branch_id uuid, p_request_id uuid, p_order_id uuid, p_items jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare saved public.mobile_purchase_receipts%rowtype; payload jsonb; result jsonb;
  item jsonb; po public.purchase_orders%rowtype; line public.purchase_order_items%rowtype;
  failure text; received integer := 0;
begin
  if auth.uid() is null then raise exception 'Sign in to continue.' using errcode='42501'; end if;
  perform public.tenh_assert_effective_permission(p_business_id,'purchases.update');
  if p_branch_id is null or public.tenh_request_branch(p_business_id) is distinct from p_branch_id then
    raise exception 'This purchase belongs to another branch.' using errcode='42501';
  end if;
  perform public.tenh_assert_plan_branch(p_business_id,p_branch_id);
  if p_request_id is null or p_order_id is null then raise exception 'Choose a purchase order.'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Choose received items.'; end if;
  if jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>100 then raise exception 'Choose 1–100 received items.'; end if;
  for item in select value from jsonb_array_elements(p_items) loop
    if (item->>'itemId')::uuid is null
      or jsonb_typeof(item->'quantity') is distinct from 'number'
      or (item->>'quantity')::numeric < 1 or (item->>'quantity')::numeric > 999999
      or (item->>'quantity')::numeric <> trunc((item->>'quantity')::numeric)
      or jsonb_typeof(item->'expectedReceived') is distinct from 'number'
      or (item->>'expectedReceived')::numeric < 0
      or (item->>'expectedReceived')::numeric <> trunc((item->>'expectedReceived')::numeric)
      then raise exception 'Enter positive whole quantities and reload the purchase order.'; end if;
  end loop;
  if (select count(distinct (value->>'itemId')::uuid) from jsonb_array_elements(p_items)) <> jsonb_array_length(p_items) then
    raise exception 'Each item may appear only once.';
  end if;
  payload:=jsonb_build_object('orderId',p_order_id,'items',p_items);
  perform pg_advisory_xact_lock(hashtextextended('purchase:'||p_business_id::text||':'||p_request_id::text,0));
  select * into saved from public.mobile_purchase_receipts where business_id=p_business_id and request_id=p_request_id;
  if found then
    if saved.created_by is distinct from auth.uid() or saved.location_id is distinct from p_branch_id or saved.payload is distinct from payload then
      raise exception 'This receiving request was already used with different details.';
    end if;
    return saved.result;
  end if;
  -- A failed stock operation rolls back inside this block. Its terminal outcome
  -- remains recoverable even when the response is lost.
  begin
    select * into po from public.purchase_orders where id=p_order_id and business_id=p_business_id and location_id=p_branch_id for update;
    if not found then raise exception 'Purchase order not found in this branch.'; end if;
    if po.status not in ('draft','sent','partial') then raise exception 'This purchase order cannot receive more stock.'; end if;
    for item in select value from jsonb_array_elements(p_items) loop
      select * into line from public.purchase_order_items where id=(item->>'itemId')::uuid and purchase_order_id=po.id and business_id=p_business_id for update;
      if not found then raise exception 'Purchase item not found.'; end if;
      if line.received_quantity is distinct from (item->>'expectedReceived')::numeric then
        raise exception 'Received quantities changed. Refresh before receiving more stock.';
      end if;
      if (item->>'quantity')::numeric > line.ordered_quantity-line.received_quantity then raise exception 'Quantity exceeds remaining stock to receive.'; end if;
      received:=received+(item->>'quantity')::integer;
    end loop;
    perform public.tenh_run_branch_stock(p_business_id,'receive_purchase_order',jsonb_build_object('p_purchase_order_id',p_order_id,'p_receipts',p_items));
    -- Verify the existing procedure fulfilled the whole request before committing.
    for item in select value from jsonb_array_elements(p_items) loop
      if not exists(select 1 from public.purchase_order_items where id=(item->>'itemId')::uuid and purchase_order_id=po.id and business_id=p_business_id
        and received_quantity=(item->>'expectedReceived')::numeric+(item->>'quantity')::numeric) then
        raise exception 'Received stock was not confirmed. The transaction has been rolled back.';
      end if;
    end loop;
    select jsonb_build_object('purchaseOrderId',id,'receivedQuantity',received,'status',status) into result from public.purchase_orders where id=po.id;
  exception when others then
    get stacked diagnostics failure=message_text;
    result:=jsonb_build_object('rolledBack',true,'error',failure);
  end;
  insert into public.mobile_purchase_receipts(business_id,request_id,location_id,created_by,payload,result)
    values(p_business_id,p_request_id,p_branch_id,auth.uid(),payload,result);
  return result;
end $$;

create or replace function public.tenh_mobile_purchase_receipt_status(p_business_id uuid,p_branch_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to continue.' using errcode='42501'; end if;
  perform public.tenh_assert_effective_permission(p_business_id,'purchases.update');
  if p_branch_id is null or public.tenh_request_branch(p_business_id) is distinct from p_branch_id then
    raise exception 'This request is outside your operating branch.' using errcode='42501';
  end if;
  select r.result into result from public.mobile_purchase_receipts r where r.business_id=p_business_id and r.request_id=p_request_id
    and r.location_id=p_branch_id and r.created_by=auth.uid();
  return result;
end $$;
revoke all on function public.tenh_mobile_receive_purchase(uuid,uuid,uuid,uuid,jsonb) from public,anon;
revoke all on function public.tenh_mobile_purchase_receipt_status(uuid,uuid,uuid) from public,anon;
grant execute on function public.tenh_mobile_receive_purchase(uuid,uuid,uuid,uuid,jsonb) to authenticated;
grant execute on function public.tenh_mobile_purchase_receipt_status(uuid,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
