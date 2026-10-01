begin;

-- business_coupons only had the RESTRICTIVE branch policy. Restrictive policies
-- can only narrow access granted by a permissive one, so every read and write was
-- denied ("new row violates row-level security policy"). Grant members access;
-- the restrictive tenh_operating_branch policy still limits rows to their branch.
drop policy if exists "Business members can view coupons" on public.business_coupons;
create policy "Business members can view coupons" on public.business_coupons
  for select to authenticated
  using (public.is_active_business_member(business_id));

drop policy if exists "Promotion managers can create coupons" on public.business_coupons;
create policy "Promotion managers can create coupons" on public.business_coupons
  for insert to authenticated
  with check (public.is_active_business_member(business_id)
    and public.tenh_current_user_permission_allowed(business_id, 'storefront.update'));

drop policy if exists "Promotion managers can update coupons" on public.business_coupons;
create policy "Promotion managers can update coupons" on public.business_coupons
  for update to authenticated
  using (public.is_active_business_member(business_id)
    and public.tenh_current_user_permission_allowed(business_id, 'storefront.update'))
  with check (public.is_active_business_member(business_id)
    and public.tenh_current_user_permission_allowed(business_id, 'storefront.update'));

drop policy if exists "Promotion managers can delete coupons" on public.business_coupons;
create policy "Promotion managers can delete coupons" on public.business_coupons
  for delete to authenticated
  using (public.is_active_business_member(business_id)
    and public.tenh_current_user_permission_allowed(business_id, 'storefront.update'));

commit;
