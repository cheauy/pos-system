-- Save the image in the same transaction as the existing, permission-checked
-- recipe creation. Its request ledger also binds the image to retries.
create or replace function public.tenh_create_packed_bundle_with_image(
  p_business_id uuid, p_branch_id uuid, p_request_id uuid, p_input jsonb
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_replay boolean;
  v_path text := p_input->>'imagePath';
  v_url text := p_input->>'imageUrl';
begin
  perform public.tenh_assert_effective_permission(p_business_id, 'products.create');
  if v_path is null or v_url is null
    or v_path !~ ('^' || p_business_id::text || '/' || auth.uid()::text || '/' || p_request_id::text || '-[0-9a-f]{64}\.(jpg|png|webp)$')
    or v_url !~ '^https://[^/]+/storage/v1/object/public/product-images/'
    or right(v_url, length('/storage/v1/object/public/product-images/' || v_path)) <> '/storage/v1/object/public/product-images/' || v_path then
    raise exception 'Invalid bundle image.';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'product-images' and name = v_path) then
    raise exception 'Upload the bundle image before creating the bundle.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || p_request_id::text, 20260924));
  select exists(select 1 from public.bundle_stock_requests where business_id = p_business_id and request_id = p_request_id) into v_replay;
  v_id := public.tenh_create_packed_bundle(p_business_id, p_branch_id, p_request_id, p_input);
  if not v_replay then
    update public.products set image_url = v_url where id = v_id and business_id = p_business_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.tenh_create_packed_bundle_with_image(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.tenh_create_packed_bundle_with_image(uuid, uuid, uuid, jsonb) to authenticated;
