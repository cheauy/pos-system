begin;

-- Results are retained separately so an unchanged exact count is retry-safe too.
create table if not exists public.stock_adjustment_requests (
  business_id uuid not null references public.businesses(id) on delete cascade,
  request_id uuid not null,
  created_by uuid not null,
  location_id uuid not null references public.business_locations(id),
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (business_id, request_id)
);
alter table public.stock_adjustment_requests enable row level security;
revoke all on public.stock_adjustment_requests from public, anon, authenticated;

create or replace function public.tenh_adjust_branch_stock(
  p_business_id uuid, p_location_id uuid, p_product_id uuid,
  p_mode text, p_quantity integer, p_reason text, p_reference text,
  p_request_id uuid, p_expected_quantity integer
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_product public.products%rowtype;
  v_before integer;
  v_after integer;
  v_delta integer;
  v_payload jsonb;
  v_saved public.stock_adjustment_requests%rowtype;
  v_result jsonb;
begin
  perform public.tenh_assert_effective_permission(p_business_id, 'products.stock_adjust');
  if p_location_id is null or public.tenh_request_branch(p_business_id) is distinct from p_location_id then
    raise exception 'This stock adjustment is outside your operating branch.' using errcode = '42501';
  end if;
  if p_request_id is null or p_mode is null or p_mode not in ('increase','decrease','set')
    or p_quantity is null or p_quantity < 0 or (p_mode <> 'set' and p_quantity = 0)
    or p_expected_quantity is null or p_expected_quantity < 0
    or p_reason is null or length(btrim(p_reason)) < 2 or length(p_reason) > 650
    or length(p_reference) > 200 then
    raise exception 'Enter a valid quantity, reason and adjustment request.';
  end if;
  -- All branch stock operations acquire the business lock before product locks.
  perform public.tenh_assert_plan_branch(p_business_id, p_location_id);
  if exists(select 1 from public.business_locations where id = p_location_id and plan_disable_pending) then
    raise exception 'This branch is closing after a plan change.';
  end if;
  v_payload := jsonb_build_object('product',p_product_id,'mode',p_mode,'quantity',p_quantity,
    'reason',p_reason,'reference',p_reference,'expected',p_expected_quantity);
  select * into v_saved from public.stock_adjustment_requests
    where business_id = p_business_id and request_id = p_request_id;
  if found then
    if v_saved.created_by is distinct from auth.uid() or v_saved.location_id is distinct from p_location_id
      or v_saved.payload is distinct from v_payload then
      raise exception 'This adjustment request was already used with different details.';
    end if;
    return v_saved.result;
  end if;
  select * into v_product from public.products
    where id = p_product_id and business_id = p_business_id and is_active for update;
  if not found then raise exception 'This product is no longer available.'; end if;
  select quantity into v_before from public.product_location_stock
    where business_id = p_business_id and location_id = p_location_id and product_id = p_product_id for update;
  if not found then raise exception 'Assign this product to the branch before adjusting stock.'; end if;
  if p_mode = 'set' and v_before <> p_expected_quantity then
    raise exception 'Stock changed from % to %. Refresh and check the count before saving again.',p_expected_quantity,v_before;
  end if;
  v_after := case p_mode when 'increase' then v_before + p_quantity when 'decrease' then v_before - p_quantity else p_quantity end;
  if v_after < 0 then raise exception 'Not enough stock in this branch. Available: %.',v_before; end if;
  v_delta := v_after - v_before;
  if coalesce(v_product.stock_quantity,0) + v_delta < 0 then raise exception 'Stock totals need reconciliation before this adjustment.'; end if;
  if v_delta <> 0 then
    update public.products set stock_quantity = stock_quantity + v_delta, updated_at = now() where id = p_product_id;
    update public.product_location_stock set quantity = v_after, updated_at = now()
      where business_id = p_business_id and location_id = p_location_id and product_id = p_product_id;
    perform set_config('tenh.adjustment_branch',p_location_id::text,true);
    insert into public.stock_adjustments(business_id,location_id,product_id,adjustment_type,quantity_delta,stock_before,stock_after,reason,reference,created_by)
      values(p_business_id,p_location_id,p_product_id,p_mode,v_delta,v_before,v_after,p_reason,p_reference,auth.uid());
    perform set_config('tenh.adjustment_branch','',true);
  end if;
  v_result := jsonb_build_object('productId',p_product_id,'stockBefore',v_before,'stockAfter',v_after,'delta',v_delta);
  insert into public.stock_adjustment_requests(business_id,request_id,created_by,location_id,payload,result)
    values(p_business_id,p_request_id,auth.uid(),p_location_id,v_payload,v_result);
  return v_result;
end;
$$;
revoke all on function public.tenh_adjust_branch_stock(uuid,uuid,uuid,text,integer,text,text,uuid,integer) from public, anon;
grant execute on function public.tenh_adjust_branch_stock(uuid,uuid,uuid,text,integer,text,text,uuid,integer) to authenticated;

-- Old entry points do not carry a request identity or branch-safe exact count.
-- Retain signatures for dependencies, but never allow them to mutate global stock.
do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('adjust_product_stock','adjust_branch_product_stock') loop
    execute format('revoke execute on function %s from public, anon, authenticated',f.signature);
  end loop;
end $$;
notify pgrst, 'reload schema';
commit;
