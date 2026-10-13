-- PROPOSED ONLY. Never run against production as part of this task.
-- Requires the operating-branch/permission schema and the reviewed batch-edit RPC.
-- Preserves every products/branch_product_details/orders identifier. No backfill
-- generates replacements, strips letters/zeros, trims, or guesses old mappings.
-- Existing collisions abort this entire transaction and require owner review.
begin;

create table public.tenh_product_identifiers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid references public.business_locations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  identifier text not null,
  lookup_key text generated always as (lower(identifier)) stored,
  origin text not null check (origin in ('barcode','sku','legacy-reviewed')),
  unique nulls not distinct (business_id,location_id,lookup_key)
);
alter table public.tenh_product_identifiers enable row level security;
revoke all on public.tenh_product_identifiers from public,anon,authenticated;

create table public.tenh_order_identifiers (
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  identifier text not null,
  lookup_key text generated always as (lower(identifier)) stored,
  origin text not null check (origin in ('order-code','order-number','legacy-reviewed')),
  primary key(business_id,lookup_key)
);
alter table public.tenh_order_identifiers enable row level security;
revoke all on public.tenh_order_identifiers from public,anon,authenticated;

-- One business lock serializes allocation and claims across shared/branch copies,
-- all writers and product groups. The unique indexes are the final race guard.
create function public.tenh_claim_product_identifier(p_business uuid,p_location uuid,p_product uuid,p_value text,p_origin text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_value is null or p_value='' then return; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tenh-product-identifiers:'||p_business::text,0));
  if exists(select 1 from public.tenh_product_identifiers a where a.business_id=p_business and a.lookup_key=lower(p_value)
    and a.product_id<>p_product and (p_location is null or a.location_id is null or a.location_id=p_location)) then
    raise exception 'A barcode or SKU is already reserved for another product. Review the existing identifiers; none were replaced.' using errcode='23505';
  end if;
  insert into public.tenh_product_identifiers(business_id,location_id,product_id,identifier,origin)
  values(p_business,p_location,p_product,p_value,p_origin) on conflict(business_id,location_id,lookup_key) do nothing;
end $$;
revoke all on function public.tenh_claim_product_identifier(uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;

create function public.tenh_assert_barcode_text(p_value text)
returns void language plpgsql set search_path='' as $$
begin
  if p_value is null or p_value='' or p_value<>btrim(p_value) or length(p_value)>80 or p_value !~ '^[ -~]+$' then
    raise exception 'Enter an exact printable barcode string of 1 to 80 characters; do not trim or replace saved identifiers.' using errcode='22023';
  end if;
end $$;
revoke all on function public.tenh_assert_barcode_text(text) from public,anon,authenticated,service_role;

create function public.tenh_allocate_product_identifier(p_business uuid)
returns text language plpgsql volatile security definer set search_path='' as $$
declare candidate text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tenh-product-identifiers:'||p_business::text,0));
  loop
    candidate:=lpad((('x'||substr(replace(gen_random_uuid()::text,'-',''),1,12))::bit(48)::bigint)::text,15,'0');
    exit when not exists(select 1 from public.tenh_product_identifiers where business_id=p_business and lookup_key=candidate);
  end loop;
  return candidate;
end $$;
revoke all on function public.tenh_allocate_product_identifier(uuid) from public,anon,authenticated,service_role;

create function public.tenh_preserve_product_barcode()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tenh-product-identifiers:'||new.business_id::text,0));
  if tg_op='INSERT' and (new.barcode is null or new.barcode='') then
    new.barcode:=public.tenh_allocate_product_identifier(new.business_id);
  elsif tg_op='INSERT' or new.barcode is distinct from old.barcode then
    perform public.tenh_assert_barcode_text(new.barcode);
  end if;
  return new;
end $$;
revoke all on function public.tenh_preserve_product_barcode() from public,anon,authenticated,service_role;
drop trigger if exists tenh_numeric_barcode on public.products;
create trigger tenh_preserve_barcode before insert or update of barcode on public.products for each row execute function public.tenh_preserve_product_barcode();

create function public.tenh_capture_product_identifiers()
returns trigger language plpgsql security definer set search_path='' as $$
declare branch uuid;
begin
  if tg_table_name='branch_product_details' then branch:=new.location_id; end if;
  -- The reviewed batch editor temporarily frees identifiers inside its transaction.
  -- Temporary SKU markers are never aliases. Old final identifiers stay reserved,
  -- so moving a barcode/SKU to a different product intentionally fails safely.
  if not (tg_table_name='branch_product_details' and tg_op='UPDATE'
    and coalesce(new.sku,'')='~tenh-edit-'||new.id::text and old.sku is distinct from new.sku and (new.barcode is null or new.barcode='')) then
    perform public.tenh_claim_product_identifier(new.business_id,branch,new.id,new.sku,'sku');
    perform public.tenh_claim_product_identifier(new.business_id,branch,new.id,new.barcode,'barcode');
  end if;
  return new;
end $$;
revoke all on function public.tenh_capture_product_identifiers() from public,anon,authenticated,service_role;
create trigger tenh_capture_identifiers after insert or update of sku,barcode on public.products for each row execute function public.tenh_capture_product_identifiers();
create trigger tenh_capture_identifiers after insert or update of sku,barcode on public.branch_product_details for each row execute function public.tenh_capture_product_identifiers();

create function public.tenh_preserve_branch_barcode()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    -- Copy the shared row exactly; a new branch never allocates a different code.
    if new.barcode is null or new.barcode='' then
      select p.barcode into new.barcode from public.products p where p.id=new.id and p.business_id=new.business_id;
      return new; -- An unchanged NULL/empty legacy shared column stays unchanged too.
    end if;
    if not exists(select 1 from public.tenh_product_identifiers a where a.business_id=new.business_id and a.product_id=new.id and a.identifier=new.barcode and (a.location_id is null or a.location_id=new.location_id)) then
      perform public.tenh_assert_barcode_text(new.barcode);
    end if;
  elsif new.barcode is distinct from old.barcode and not (coalesce(new.sku,'')='~tenh-edit-'||new.id::text and (new.barcode is null or new.barcode='')) then
    -- Batch phase 2 may restore an unchanged unsupported legacy string. Only
    -- an already reserved exact string for this product can bypass validation.
    if not exists(select 1 from public.tenh_product_identifiers a where a.business_id=new.business_id and a.product_id=new.id and a.identifier=new.barcode and (a.location_id is null or a.location_id=new.location_id)) then
      perform public.tenh_assert_barcode_text(new.barcode);
    end if;
  end if;
  return new;
end $$;
revoke all on function public.tenh_preserve_branch_barcode() from public,anon,authenticated,service_role;
create trigger tenh_preserve_barcode before insert or update of barcode on public.branch_product_details for each row execute function public.tenh_preserve_branch_barcode();

-- Reserve exact known strings, including already-divergent branch identifiers.
-- No automatic trim/case rewrite of columns and no "old SKU must equal barcode" assumption.
do $$ declare r record; begin
  for r in select business_id,id,sku,barcode from public.products order by business_id,id loop
    perform public.tenh_claim_product_identifier(r.business_id,null,r.id,r.sku,'sku');
    perform public.tenh_claim_product_identifier(r.business_id,null,r.id,r.barcode,'barcode');
  end loop;
  for r in select business_id,location_id,id,sku,barcode from public.branch_product_details order by business_id,location_id,id loop
    perform public.tenh_claim_product_identifier(r.business_id,r.location_id,r.id,r.sku,'sku');
    perform public.tenh_claim_product_identifier(r.business_id,r.location_id,r.id,r.barcode,'barcode');
  end loop;
end $$;

create function public.tenh_capture_order_identifiers()
returns trigger language plpgsql security definer set search_path='' as $$
declare v text; origin text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tenh-order-identifiers:'||new.business_id::text,0));
  for v,origin in select new.order_code,'order-code' union all select new.order_number,'order-number' loop
    if v is null or v='' then continue; end if;
    if exists(select 1 from public.tenh_order_identifiers a where a.business_id=new.business_id and a.lookup_key=lower(v) and a.order_id<>new.id) then
      raise exception 'An order barcode or display number is reserved for another order.' using errcode='23505';
    end if;
    insert into public.tenh_order_identifiers(business_id,order_id,identifier,origin) values(new.business_id,new.id,v,origin) on conflict(business_id,lookup_key) do nothing;
  end loop;
  return new;
end $$;
revoke all on function public.tenh_capture_order_identifiers() from public,anon,authenticated,service_role;
create trigger tenh_capture_identifiers after insert or update of order_number,order_code on public.orders for each row execute function public.tenh_capture_order_identifiers();
do $$ declare r record; v text; origin text; begin
  for r in select business_id,id,order_code,order_number from public.orders order by business_id,id loop
    for v,origin in select r.order_code,'order-code' union all select r.order_number,'order-number' loop
      if v is null or v='' then continue; end if;
      if exists(select 1 from public.tenh_order_identifiers a where a.business_id=r.business_id and a.lookup_key=lower(v) and a.order_id<>r.id) then raise exception 'Existing order identifiers conflict. Review before rollout; no identifiers were changed.'; end if;
      insert into public.tenh_order_identifiers values(r.business_id,r.id,v,default,origin) on conflict(business_id,lookup_key) do nothing;
    end loop;
  end loop;
end $$;

-- Existing order-code constraints/index/immutability stay in place. Serialize
-- random allocation globally (codes also appear on public /o/ links).
create or replace function public.tenh_new_order_code()
returns text language plpgsql volatile set search_path='' as $$
declare candidate text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('tenh-order-code-allocation',0));
  loop
    candidate:=(100000000000 + floor(random()*900000000000))::bigint::text;
    exit when not exists(select 1 from public.orders where order_code=candidate)
      and not exists(select 1 from public.tenh_order_identifiers where lookup_key=candidate);
  end loop;
  return candidate;
end $$;
revoke all on function public.tenh_new_order_code() from public,anon,authenticated,service_role;

create function public.tenh_scan_product_ids(p_business uuid,p_value text)
returns table(product_id uuid) language plpgsql stable security definer set search_path='' as $$
declare branch uuid;
begin
  if auth.uid() is null then raise exception 'Sign in.' using errcode='42501'; end if;
  if not public.tenh_user_permission_allowed(p_business,auth.uid(),'products.view') and not public.tenh_user_permission_allowed(p_business,auth.uid(),'pos.access') then raise exception 'Product access denied.' using errcode='42501'; end if;
  branch:=public.tenh_request_branch(p_business);
  if branch is null then raise exception 'Choose an operating branch.'; end if;
  if p_value is null or length(p_value) not between 1 and 80 or p_value<>btrim(p_value) then return; end if;
  return query select distinct a.product_id from public.tenh_product_identifiers a join public.branch_product_details d on d.id=a.product_id and d.business_id=a.business_id and d.location_id=branch
    where a.business_id=p_business and (a.location_id is null or a.location_id=branch) and a.lookup_key=lower(p_value) and not d.branch_archived;
end $$;
revoke all on function public.tenh_scan_product_ids(uuid,text) from public,anon,service_role;
grant execute on function public.tenh_scan_product_ids(uuid,text) to authenticated;

create function public.tenh_scan_order_ids(p_business uuid,p_value text)
returns table(order_id uuid) language plpgsql stable security definer set search_path='' as $$
declare branch uuid; all_online boolean;
begin
  perform public.tenh_assert_effective_permission(p_business,'orders.view');
  branch:=public.tenh_request_branch(p_business);
  if branch is null then raise exception 'Choose an operating branch.'; end if;
  if p_value is null or length(p_value) not between 1 and 80 or p_value<>btrim(p_value) then return; end if;
  all_online:=public.tenh_receive_all_online_orders(p_business);
  return query select distinct a.order_id from public.tenh_order_identifiers a join public.orders o on o.id=a.order_id and o.business_id=a.business_id
    join public.business_locations l on l.id=o.location_id and l.business_id=o.business_id
    where a.business_id=p_business and a.lookup_key=lower(p_value) and o.archived_at is null and l.is_active and not l.plan_disable_pending
      and (o.location_id=branch or (o.order_source='online' and all_online));
end $$;
revoke all on function public.tenh_scan_order_ids(uuid,text) from public,anon,service_role;
grant execute on function public.tenh_scan_order_ids(uuid,text) to authenticated;

create function public.tenh_pos_barcode_aliases(p_business uuid)
returns table(product_id uuid,identifier text) language plpgsql stable security definer set search_path='' as $$
declare branch uuid;
begin
  perform public.tenh_assert_effective_permission(p_business,'pos.access');
  branch:=public.tenh_request_branch(p_business);
  if branch is null then raise exception 'Choose an operating branch.'; end if;
  return query select distinct a.product_id,a.identifier from public.tenh_product_identifiers a join public.branch_product_details d on d.id=a.product_id and d.business_id=a.business_id and d.location_id=branch
    where a.business_id=p_business and (a.location_id is null or a.location_id=branch) and not d.branch_archived and d.is_active;
end $$;
revoke all on function public.tenh_pos_barcode_aliases(uuid) from public,anon,service_role;
grant execute on function public.tenh_pos_barcode_aliases(uuid) to authenticated;

-- New web saves omit unchanged barcode fields. Repair the reviewed batch RPC's
-- explicit string writes too, and keep mixed-version mobile "blank means keep" safe.
do $$ declare source text; patched text; begin
  if to_regprocedure('public.tenh_edit_product_rows(uuid,uuid,uuid,jsonb)') is null then raise exception 'Review/apply the batch-edit RPC proposal first.'; end if;
  source:=pg_get_functiondef('public.tenh_edit_product_rows(uuid,uuid,uuid,jsonb)'::regprocedure);
  patched:=replace(source, 'barcode=case when vals ? ''barcode'' then nullif(btrim(patch.barcode),'''') else priors->row_id::text->>''barcode'' end',
    'barcode=case when vals ? ''barcode'' and patch.barcode is not null and patch.barcode<>'''' then patch.barcode else priors->row_id::text->>''barcode'' end');
  if patched=source then raise exception 'Batch-edit RPC differs from the reviewed proposal. Reconcile it manually; do not guess.'; end if;
  source:=patched;
  patched:=replace(source, 'set sku=''~tenh-edit-''||v.id::text, barcode=null',
    'set sku=''~tenh-edit-''||v.id::text, barcode=case when v.barcode='''' then v.barcode else null end');
  if patched=source then raise exception 'Batch placeholder phase differs. Review NULL/empty legacy preservation before rollout.'; end if;
  source:=patched;
  patched:=replace(source, 'coalesce(nullif(btrim(value->''values''->>''barcode''),''''), nullif(btrim(priors->(value->>''id'')->>''barcode''),'''')) b',
    'lower(coalesce(nullif(value->''values''->>''barcode'',''''), nullif(priors->(value->>''id'')->>''barcode'',''''))) b');
  if patched=source then raise exception 'Batch barcode comparison differs. Review exact legacy comparisons before rollout.'; end if;
  execute patched;
  if to_regprocedure('public.tenh_mobile_management(uuid,uuid,uuid,text,jsonb)') is not null then
    source:=pg_get_functiondef('public.tenh_mobile_management(uuid,uuid,uuid,text,jsonb)'::regprocedure);
    patched:=replace(source, 'barcode=coalesce(nullif(item->>''barcode'',''''),item->>''sku'')',
      'barcode=case when item ? ''barcode'' and item->>''barcode''<>'''' then item->>''barcode'' else product.barcode end');
    if patched=source then raise exception 'Mobile management RPC differs from the reviewed source. Reconcile before mixed-version rollout.'; end if;
    execute patched;
  end if;
end $$;

create function public.tenh_barcode_contract_ready()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.products'::regclass and tgname='tenh_preserve_barcode' and not tgisinternal and tgenabled='O')
    and not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.products'::regclass and tgname='tenh_numeric_barcode' and not tgisinternal)
    and to_regprocedure('public.tenh_scan_product_ids(uuid,text)') is not null
    and to_regprocedure('public.tenh_scan_order_ids(uuid,text)') is not null
    and to_regprocedure('public.tenh_pos_barcode_aliases(uuid)') is not null
    and exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.products'::regclass and tgname='tenh_capture_identifiers' and not tgisinternal and tgenabled='O')
    and exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.branch_product_details'::regclass and tgname='tenh_capture_identifiers' and not tgisinternal and tgenabled='O')
    and exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.branch_product_details'::regclass and tgname='tenh_preserve_barcode' and not tgisinternal and tgenabled='O')
    and exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.orders'::regclass and tgname='tenh_capture_identifiers' and not tgisinternal and tgenabled='O');
$$;
revoke all on function public.tenh_barcode_contract_ready() from public,anon;
grant execute on function public.tenh_barcode_contract_ready() to authenticated,service_role;
notify pgrst,'reload schema';
commit;

-- Rollback: do not drop alias tables or recreate the old rewriting trigger.
-- Revert the application first, keep preservation guards and aliases, and restore
-- reviewed prior RPC bodies only if they preserve raw identifiers. Dropping the
-- tables/triggers is a separate destructive review; no automatic down migration.
