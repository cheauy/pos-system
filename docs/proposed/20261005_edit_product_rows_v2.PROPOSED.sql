-- PROPOSED ONLY — not applied anywhere. Successor to the unapplied task-5 candidate
-- 20261005001000_edit_product_rows.PROPOSED.sql (do not apply both; this replaces it).
-- Atomic edit of every saved row of one product / variant group in the request branch.
-- Changes vs candidate:
--   * stale / changed-list conflicts raise PT409 (HTTP 409, definite) instead of 40001,
--     which PostgREST retries (proven retry storm in R3).
--   * no SELECT ... FOR UPDATE on branch_product_details (authenticated has no UPDATE
--     privilege there); a transaction advisory lock per product group serialises
--     concurrent batch saves, and version-guarded writes lock each row.
--   * two-phase identifiers: rows first take a unique placeholder SKU / no barcode, then
--     final values, so swapping or renumbering SKUs/barcodes between variants passes the
--     deployed per-row uniqueness trigger inside one transaction.
--   * no direct tenh_assert_plan_branch call: authenticated lacks EXECUTE on it in the
--     captured catalog (the candidate fails with 42501 for every caller).
--   * optional shared gallery (image_urls, max 8) is written in the same transaction.
-- Every write still goes through public.branch_products and its INSTEAD OF trigger
-- (permission, plan, category, branch, stock/structure and SKU/barcode guards).
begin;
create or replace function public.tenh_edit_product_rows(
  p_business uuid, p_branch uuid, p_product uuid, p_rows jsonb
) returns jsonb
language plpgsql security invoker set search_path = '' as $function$
declare
  rep record; prior record; item jsonb; vals jsonb;
  patch public.branch_product_details%rowtype;
  ids uuid[]; group_ids uuid[]; priors jsonb := '{}'::jsonb;
  row_id uuid; affected uuid; saved_version timestamptz;
  saved_ids jsonb := '[]'::jsonb; saved_versions jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to continue.' using errcode='42501'; end if;
  perform public.tenh_assert_effective_permission(p_business,'products.update');
  if p_branch is null or public.tenh_request_branch(p_business) is distinct from p_branch then
    raise exception 'Your operating branch changed. Reload before saving.' using errcode='42501';
  end if;
  -- tenh_assert_plan_branch is not executable by authenticated (captured ACL); the
  -- SECURITY DEFINER write trigger enforces the plan/branch gate on every row below.
  if jsonb_typeof(p_rows) is distinct from 'array'
    or jsonb_array_length(p_rows) not between 1 and 500 or octet_length(p_rows::text)>1048576 then
    raise exception 'Submit 1–500 saved product rows within the edit limit.' using errcode='22023';
  end if;

  select v.id, v.product_type, v.variant_group_id into rep from public.branch_products v
    where v.business_id=p_business and v.id=p_product;
  if not found or rep.product_type='bundle' then
    raise exception 'Product was not found in this branch.' using errcode='42501';
  end if;
  -- Serialise batch saves of the same group; later statements then read committed versions.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'tenh_edit_product_rows:'||p_business::text||':'||coalesce(rep.variant_group_id,rep.id)::text, 0));

  select array_agg(v.id order by v.id) into group_ids from public.branch_products v
    where v.business_id=p_business
      and (v.id=p_product or (rep.product_type='variant' and rep.variant_group_id is not null and v.variant_group_id=rep.variant_group_id));
  begin
    select array_agg((value->>'id')::uuid order by (value->>'id')::uuid) into ids from jsonb_array_elements(p_rows);
  exception when invalid_text_representation then
    raise exception 'Invalid product row ID.' using errcode='22023';
  end;
  if ids is distinct from group_ids then
    raise exception 'The saved variant list changed. Reload before saving.' using errcode='PT409';
  end if;

  for item in select value from jsonb_array_elements(p_rows) loop
    vals := item->'values';
    if jsonb_typeof(vals) is distinct from 'object' or nullif(item->>'expectedUpdatedAt','') is null then
      raise exception 'The product row edit is incomplete.' using errcode='22023';
    end if;
    if exists(select 1 from jsonb_object_keys(vals) k where k not in (
      'name','category_id','description','sku','barcode','size','color','cost_price','selling_price',
      'low_stock_quantity','is_active','is_online','image_url','image_urls','variant_image_url')) then
      raise exception 'Use the dedicated workflow for stock or product structure.' using errcode='22023';
    end if;
    if not (vals ?& array['name','category_id','description','sku','size','color','cost_price','selling_price','low_stock_quantity','is_active','is_online']) then
      raise exception 'The product row edit is incomplete.' using errcode='22023';
    end if;
    if vals ? 'image_urls' and (jsonb_typeof(vals->'image_urls') is distinct from 'array' or jsonb_array_length(vals->'image_urls')>8
      or exists(select 1 from jsonb_array_elements(vals->'image_urls') u where jsonb_typeof(u) is distinct from 'string')) then
      raise exception 'Use up to 8 product images.' using errcode='22023';
    end if;
    row_id := (item->>'id')::uuid;
    select v.updated_at, v.is_active, v.barcode into prior from public.branch_products v
      where v.business_id=p_business and v.id=row_id;
    if not found or prior.updated_at is distinct from (item->>'expectedUpdatedAt')::timestamptz then
      raise exception 'A variant changed while editing. Reload before saving.' using errcode='PT409';
    end if;
    priors := priors || jsonb_build_object(row_id::text, jsonb_build_object('barcode', prior.barcode));
    patch := jsonb_populate_record(null::public.branch_product_details, vals);
    if patch.is_active is null or patch.is_online is null
      or length(btrim(coalesce(patch.name,''))) not between 2 and 160
      or length(btrim(coalesce(patch.sku,''))) not between 1 and 80
      or patch.cost_price is null or patch.selling_price is null or patch.cost_price<0 or patch.selling_price<0
      or patch.cost_price::text in ('NaN','Infinity','-Infinity') or patch.selling_price::text in ('NaN','Infinity','-Infinity')
      or patch.low_stock_quantity is null or patch.low_stock_quantity<0
      or (not patch.is_active and patch.is_online) then
      raise exception 'Enter a valid name, SKU, prices, low-stock threshold and visibility.' using errcode='22023';
    end if;
    if rep.product_type='variant' and (nullif(btrim(patch.size),'') is null or nullif(btrim(patch.color),'') is null) then
      raise exception 'Each variant needs size and colour.' using errcode='22023';
    end if;
    if prior.is_active is distinct from patch.is_active then
      perform public.tenh_assert_effective_permission(p_business,'products.disable');
    end if;
  end loop;
  if (select count(distinct lower(btrim(value->'values'->>'sku'))) from jsonb_array_elements(p_rows))<>cardinality(ids)
    or (select count(*)<>count(distinct b) from (select coalesce(nullif(btrim(value->'values'->>'barcode'),''), nullif(btrim(priors->(value->>'id')->>'barcode'),'')) b
          from jsonb_array_elements(p_rows) where not (value->'values' ? 'barcode' and nullif(btrim(value->'values'->>'barcode'),'') is null)) x where b is not null)
    or (rep.product_type='variant' and (select count(distinct (lower(btrim(value->'values'->>'color')), lower(btrim(value->'values'->>'size')))) from jsonb_array_elements(p_rows))<>cardinality(ids)) then
    raise exception 'Each SKU, barcode and variant combination must be unique.' using errcode='22023';
  end if;

  -- Phase 1 (id order): version-guarded placeholder identifiers lock every row and free
  -- the group's SKUs/barcodes so swaps between variants pass the per-row trigger check.
  for item in select value from jsonb_array_elements(p_rows) order by (value->>'id')::uuid loop
    row_id := (item->>'id')::uuid; affected := null;
    update public.branch_products v set sku='~tenh-edit-'||v.id::text, barcode=null
      where v.business_id=p_business and v.id=row_id and v.updated_at=(item->>'expectedUpdatedAt')::timestamptz
      returning v.id into affected;
    if affected is null then raise exception 'A variant changed while saving. Reload before saving.' using errcode='PT409'; end if;
  end loop;
  -- Phase 2: final values. Absent barcode keeps the saved one.
  for item in select value from jsonb_array_elements(p_rows) order by (value->>'id')::uuid loop
    row_id := (item->>'id')::uuid; vals := item->'values'; affected := null;
    patch := jsonb_populate_record(null::public.branch_product_details, vals);
    update public.branch_products v set
      name=btrim(patch.name), category_id=patch.category_id, description=patch.description, sku=btrim(patch.sku),
      barcode=case when vals ? 'barcode' then nullif(btrim(patch.barcode),'') else priors->row_id::text->>'barcode' end,
      size=nullif(btrim(patch.size),''), color=nullif(btrim(patch.color),''),
      cost_price=patch.cost_price, selling_price=patch.selling_price,
      low_stock_quantity=patch.low_stock_quantity, is_active=patch.is_active, is_online=patch.is_online,
      image_url=case when vals ? 'image_url' then patch.image_url else v.image_url end,
      image_urls=case when vals ? 'image_urls' then patch.image_urls else v.image_urls end,
      variant_image_url=case when vals ? 'variant_image_url' then patch.variant_image_url else v.variant_image_url end
      where v.business_id=p_business and v.id=row_id
      returning v.id, v.updated_at into affected, saved_version;
    if affected is null then raise exception 'A variant changed while saving. Reload before saving.' using errcode='PT409'; end if;
    saved_ids := saved_ids || jsonb_build_array(affected);
    saved_versions := saved_versions || jsonb_build_object(affected::text, saved_version);
  end loop;
  return jsonb_build_object('success',true,'ids',saved_ids,'versions',saved_versions);
end;
$function$;
alter function public.tenh_edit_product_rows(uuid,uuid,uuid,jsonb) owner to postgres;
revoke all on function public.tenh_edit_product_rows(uuid,uuid,uuid,jsonb) from public,anon,service_role;
grant execute on function public.tenh_edit_product_rows(uuid,uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

-- ROLLBACK (only if the matching app code is also reverted; the app falls back to nothing):
-- begin; drop function if exists public.tenh_edit_product_rows(uuid,uuid,uuid,jsonb); notify pgrst,'reload schema'; commit;
