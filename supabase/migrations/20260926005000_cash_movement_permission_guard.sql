begin;
set local lock_timeout = '5s';
set local statement_timeout = '90s';

create or replace function public.record_cash_movement(
  p_business_id uuid, p_shift_id uuid, p_type text, p_amount numeric,
  p_reason text, p_reference text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_shift public.cash_register_shifts%rowtype;
  v_id uuid;
  v_role text;
  v_branch uuid;
begin
  perform public.tenh_assert_effective_permission(p_business_id, 'register.manage');
  select bm.role::text into v_role from public.business_members bm
    where bm.business_id = p_business_id and bm.user_id = auth.uid() and bm.is_active limit 1;
  if v_role is null then raise exception 'Not authorized for this business.'; end if;
  v_branch := public.tenh_request_branch(p_business_id);
  select * into v_shift from public.cash_register_shifts
    where id = p_shift_id and business_id = p_business_id and status = 'open' for update;
  if not found then raise exception 'Open register shift not found.'; end if;
  if v_branch is null or v_shift.location_id is distinct from v_branch then
    raise exception 'This register belongs to another branch.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.business_locations where id = v_branch
    and business_id = p_business_id and is_active and not plan_disable_pending) then
    raise exception 'This branch is unavailable or waiting for its drawer to close.';
  end if;
  if v_role = 'cashier' and v_shift.opened_by <> auth.uid() then
    raise exception 'Cashiers can only change their own open register.';
  end if;
  if p_type is null or p_type not in ('cash_in', 'cash_out') then raise exception 'Invalid cash movement type.'; end if;
  if p_amount is null or p_amount::text in ('NaN', 'Infinity', '-Infinity')
    or p_amount <= 0 or p_amount > 999999999.99 or p_amount <> round(p_amount, 2) then
    raise exception 'Enter a positive amount with at most two decimal places.';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'Reason is required.'; end if;
  insert into public.cash_movements(business_id, shift_id, location_id, created_by, movement_type, amount, reason, reference)
  values(p_business_id, p_shift_id, v_shift.location_id, auth.uid(), p_type, p_amount,
    btrim(p_reason), nullif(btrim(coalesce(p_reference, '')), '')) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.record_cash_movement(uuid, uuid, text, numeric, text, text) from public, anon;
grant execute on function public.record_cash_movement(uuid, uuid, text, numeric, text, text) to authenticated;
notify pgrst, 'reload schema';
commit;
