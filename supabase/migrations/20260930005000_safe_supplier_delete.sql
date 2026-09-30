begin;

-- Keep purchase history linked; serialize deletion against concurrent FK inserts.
create or replace function public.tenh_delete_unused_supplier(p_business_id uuid, p_supplier_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform public.tenh_assert_effective_permission(p_business_id,'suppliers.manage');
  perform 1 from public.suppliers
  where id=p_supplier_id and business_id=p_business_id and owner_id=auth.uid()
    and location_id=public.tenh_request_branch(p_business_id)
  for update;
  if not found then
    raise exception 'Supplier not found or you do not have permission to delete it.';
  end if;
  if exists(select 1 from public.purchases where supplier_id=p_supplier_id)
    or exists(select 1 from public.purchase_orders where supplier_id=p_supplier_id) then
    raise exception 'This supplier has purchase history. Disable the supplier instead to keep its records.';
  end if;
  delete from public.suppliers where id=p_supplier_id and business_id=p_business_id;
end$$;
revoke all on function public.tenh_delete_unused_supplier(uuid,uuid) from public,anon;
grant execute on function public.tenh_delete_unused_supplier(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
