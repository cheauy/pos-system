-- PROPOSED ONLY v3 successor. Generated locally; DO NOT APPLY without separate target review.
-- Requires the reviewed batch editor; replaces v1/v2, never apply both.
-- Both readiness probes end FALSE until missing target/real-session evidence is reviewed.
-- PROPOSED ONLY v2. Replaces 20261011_barcode_preservation.PROPOSED.sql; do not apply both.
-- No production execution/activation is authorized. Requires PostgreSQL 15+ and
-- the reviewed batch-edit prerequisite, branch view and import RPC.
-- Requires the operating-branch/permission schema and the reviewed batch-edit RPC.
-- Preserves every products/branch_product_details/orders identifier. No backfill
-- generates replacements, strips letters/zeros, trims, or guesses old mappings.
-- Existing collisions abort this entire transaction and require owner review.
begin;
set local search_path=''; -- Stable deparser output for install/readiness fingerprints.

-- A single catalog/identifier coordinator is acquired BEFORE group/row locks.
-- This deliberately serializes identifier writers across businesses; benchmark
-- contention before release. Stock-only updates do not acquire this coordinator.
create function public.tenh_barcode_catalog_lock()
returns void language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
begin perform pg_catalog.pg_advisory_xact_lock(20261012,1); end $$;
revoke all on function public.tenh_barcode_catalog_lock() from public,anon,authenticated,service_role;

create function public.tenh_barcode_writer_lock(p_business uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_business is null then raise exception 'Business required.' using errcode='42501'; end if;
  if auth.uid() is null then
    if coalesce(auth.role(),'')<>'service_role' then raise exception 'Sign in.' using errcode='42501'; end if;
  elsif not (public.tenh_user_permission_allowed(p_business,auth.uid(),'products.update')
    or public.tenh_user_permission_allowed(p_business,auth.uid(),'products.create')
    or public.tenh_user_permission_allowed(p_business,auth.uid(),'products.disable')
    or public.tenh_user_permission_allowed(p_business,auth.uid(),'exports.manage')
    or public.tenh_user_permission_allowed(p_business,auth.uid(),'pos.access')
    or public.tenh_user_permission_allowed(p_business,auth.uid(),'orders.update')) then
    raise exception 'Identifier access denied.' using errcode='42501';
  end if;
  perform public.tenh_barcode_catalog_lock();
end $$;
revoke all on function public.tenh_barcode_writer_lock(uuid) from public,anon;
grant execute on function public.tenh_barcode_writer_lock(uuid) to authenticated,service_role;

create function public.tenh_barcode_lock_required()
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from pg_catalog.pg_locks where locktype='advisory' and pid=pg_catalog.pg_backend_pid()
    and classid=20261012::oid and objid=1::oid and objsubid=2 and granted) then
    raise exception 'Use a reviewed identifier writer: acquire the catalog coordinator before rows.' using errcode='42501';
  end if;
end $$;
revoke all on function public.tenh_barcode_lock_required() from public,anon,authenticated,service_role;

create function public.tenh_barcode_statement_lock()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.tenh_barcode_catalog_lock(); return null; end $$;
revoke all on function public.tenh_barcode_statement_lock() from public,anon,authenticated,service_role;

create function public.tenh_barcode_branch_lock_required()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.sku is distinct from old.sku or new.barcode is distinct from old.barcode then perform public.tenh_barcode_lock_required(); end if;
  return new;
end $$;
revoke all on function public.tenh_barcode_branch_lock_required() from public,anon,authenticated,service_role;

-- View writes acquire the coordinator before the INSTEAD OF trigger touches rows.
-- Raw branch-details changes must have entered through a reviewed writer. Do not
-- acquire the coordinator late in a row trigger: that recreates the deadlock.
create trigger tenh_barcode_coordinator before insert or delete or update of sku,barcode on public.products
  for each statement execute function public.tenh_barcode_statement_lock();
create trigger tenh_barcode_coordinator before update of sku,barcode on public.branch_products
  for each statement execute function public.tenh_barcode_statement_lock();
create trigger tenh_barcode_coordinator before insert or delete on public.branch_product_details
  for each statement execute function public.tenh_barcode_statement_lock();
create trigger tenh_barcode_coordinator before insert or delete on public.product_location_stock
  for each statement execute function public.tenh_barcode_statement_lock();
create trigger tenh_barcode_coordinator before insert or delete or update of order_number,order_code on public.orders
  for each statement execute function public.tenh_barcode_statement_lock();
create trigger tenh_barcode_writer_required before update of sku,barcode on public.branch_product_details
  for each row execute function public.tenh_barcode_branch_lock_required();

do $$ begin
  if current_user<>'postgres' then raise exception 'Apply the reviewed proposal as postgres, not an API role.'; end if;
end $$;

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
revoke all on public.tenh_product_identifiers from public,anon,authenticated,service_role;
create index tenh_product_identifiers_lookup on public.tenh_product_identifiers(business_id,lookup_key);

create table public.tenh_order_identifiers (
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  identifier text not null,
  lookup_key text generated always as (lower(identifier)) stored,
  origin text not null check (origin in ('order-code','order-number','legacy-reviewed')),
  primary key(business_id,lookup_key)
);
alter table public.tenh_order_identifiers enable row level security;
revoke all on public.tenh_order_identifiers from public,anon,authenticated,service_role;
create index tenh_order_identifiers_lookup on public.tenh_order_identifiers(lookup_key);

-- One business lock serializes allocation and claims across shared/branch copies,
-- all writers and product groups. The unique indexes are the final race guard.
create function public.tenh_claim_product_identifier(p_business uuid,p_location uuid,p_product uuid,p_value text,p_origin text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_value is null or p_value='' then return; end if;
  perform public.tenh_barcode_lock_required();
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
  perform public.tenh_barcode_lock_required();
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
  perform public.tenh_barcode_lock_required();
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
  if tg_op='UPDATE' and new.sku is not distinct from old.sku and new.barcode is not distinct from old.barcode then return new; end if;
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
  perform public.tenh_barcode_catalog_lock();
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
  if tg_op='UPDATE' and new.order_code is not distinct from old.order_code and new.order_number is not distinct from old.order_number then return new; end if;
  perform public.tenh_barcode_lock_required();
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
  perform public.tenh_barcode_lock_required();
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
  source:=patched;
  patched:=replace(source, 'perform public.tenh_assert_effective_permission(p_business,''products.update'');',
    'perform public.tenh_assert_effective_permission(p_business,''products.update''); perform public.tenh_barcode_writer_lock(p_business);');
  if patched=source then raise exception 'Batch entry guard differs. Review before installing lock coordination.'; end if;
  execute patched;
  -- Import coordinator precedes its own business mutex and all mutation loops.
  if to_regprocedure('public.tenh_import_business_safe(uuid,text,text,jsonb,uuid,boolean,text,uuid,text)') is null then raise exception 'Reviewed import RPC required.'; end if;
  source:=pg_get_functiondef('public.tenh_import_business_safe(uuid,text,text,jsonb,uuid,boolean,text,uuid,text)'::regprocedure);
  patched:=replace(source, 'perform pg_advisory_xact_lock(hashtextextended(p_business_id::text,9616));',
    'perform public.tenh_barcode_writer_lock(p_business_id); perform pg_advisory_xact_lock(hashtextextended(p_business_id::text,9616));');
  if patched=source then raise exception 'Import mutex differs. Reconcile the entry lock before rollout.'; end if;
  execute patched;
  if to_regprocedure('public.tenh_mobile_management(uuid,uuid,uuid,text,jsonb)') is not null then
    source:=pg_get_functiondef('public.tenh_mobile_management(uuid,uuid,uuid,text,jsonb)'::regprocedure);
    patched:=replace(source, 'barcode=coalesce(nullif(item->>''barcode'',''''),item->>''sku'')',
      'barcode=case when item ? ''barcode'' and item->>''barcode''<>'''' then item->>''barcode'' else product.barcode end');
    if patched=source then raise exception 'Mobile management RPC differs from the reviewed source. Reconcile before mixed-version rollout.'; end if;
    source:=patched;
    patched:=replace(source, 'perform public.tenh_assert_effective_permission(p_business_id,permission);',
      'perform public.tenh_assert_effective_permission(p_business_id,permission); if p_operation in (''product-create'',''product-edit'',''bundle-create'',''bundle-edit'',''bundle-toggle'',''bundle-delete'') then perform public.tenh_barcode_writer_lock(p_business_id); end if;');
    if patched=source then raise exception 'Mobile entry guard differs. Reconcile before acquiring request/row locks.'; end if;
    execute patched;
  end if;
end $$;


-- Install-time structural evidence must match the reviewed prerequisites.
-- Hashes freeze those reviewed function bodies/ACLs; they do NOT substitute for
-- target-schema review, RLS/branch testing or real multi-session verification.
create table public.tenh_barcode_contract_v2 (
  singleton boolean primary key check(singleton),
  protocol integer not null check(protocol=2),
  functions jsonb not null,
  triggers jsonb not null,
  indexes jsonb not null
);
alter table public.tenh_barcode_contract_v2 enable row level security;
revoke all on public.tenh_barcode_contract_v2 from public,anon,authenticated,service_role;

do $install$
declare signature text; function_id oid; functions jsonb:='[]'; bindings jsonb:='[]'; indexes jsonb:='[]'; r record;
begin
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.orders'::regclass
    and attname='order_code' and atttypid='text'::regtype and attnotnull and not attisdropped) then raise exception 'Order code must be NOT NULL text.'; end if;
  if not exists(select 1 from pg_catalog.pg_constraint where conrelid='public.orders'::regclass and conname='orders_order_code_format'
    and contype='c' and convalidated and pg_catalog.pg_get_expr(conbin,conrelid)='(order_code ~ ''^[1-9][0-9]{11}$''::text)') then raise exception 'Reviewed order-code format constraint required.'; end if;
  if not exists(select 1 from pg_catalog.pg_index i join pg_catalog.pg_attribute a on a.attrelid=i.indrelid and a.attname='order_code'
    where i.indexrelid=to_regclass('public.orders_order_code_key') and i.indrelid='public.orders'::regclass
    and i.indisunique and i.indisvalid and i.indisready and i.indnkeyatts=1 and i.indkey[0]=a.attnum and i.indpred is null and i.indexprs is null) then raise exception 'Global unique order-code index required.'; end if;
  if not exists(select 1 from pg_catalog.pg_proc where oid=to_regprocedure('public.tenh_assign_order_code()')
    and md5(regexp_replace(prosrc,'[[:space:]]','','g'))='a1dabd37e35dd79333ad15cfec49054a') then raise exception 'Reviewed immutable order-code trigger body required.'; end if;
  if not exists(select 1 from pg_catalog.pg_class where oid='public.branch_products'::regclass and relkind='v'
    and reloptions @> array['security_invoker=true']) then raise exception 'Reviewed security-invoker branch view required.'; end if;

  foreach signature in array array[
    'public.tenh_barcode_catalog_lock()','public.tenh_barcode_writer_lock(uuid)','public.tenh_barcode_lock_required()',
    'public.tenh_barcode_statement_lock()','public.tenh_barcode_branch_lock_required()',
    'public.tenh_claim_product_identifier(uuid,uuid,uuid,text,text)','public.tenh_assert_barcode_text(text)',
    'public.tenh_allocate_product_identifier(uuid)','public.tenh_preserve_product_barcode()',
    'public.tenh_capture_product_identifiers()','public.tenh_preserve_branch_barcode()',
    'public.tenh_capture_order_identifiers()','public.tenh_new_order_code()',
    'public.tenh_scan_product_ids(uuid,text)','public.tenh_scan_order_ids(uuid,text)','public.tenh_pos_barcode_aliases(uuid)',
    'public.tenh_edit_product_rows(uuid,uuid,uuid,jsonb)',
    'public.tenh_import_business_safe(uuid,text,text,jsonb,uuid,boolean,text,uuid,text)',
    'public.tenh_write_branch_product()','public.tenh_seed_branch_product()','public.tenh_assign_order_code()',
    'public.tenh_user_permission_allowed(uuid,uuid,text)','public.tenh_assert_effective_permission(uuid,text)',
    'public.tenh_request_branch(uuid)','public.tenh_receive_all_online_orders(uuid)'
  ] loop
    function_id:=to_regprocedure(signature);
    if function_id is null or not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_roles o on o.oid=p.proowner where p.oid=function_id and o.rolname='postgres') then raise exception 'Reviewed postgres-owned function required: %',signature; end if;
    select functions||jsonb_build_array(jsonb_build_object('signature',signature,'oid',p.oid,'owner',p.proowner,
      'source',md5(pg_catalog.pg_get_functiondef(p.oid)),'acl',coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))::text))
      into functions from pg_catalog.pg_proc p where p.oid=function_id;
  end loop;
  function_id:=to_regprocedure('public.tenh_mobile_management(uuid,uuid,uuid,text,jsonb)');
  if function_id is not null then
    if not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_roles o on o.oid=p.proowner where p.oid=function_id and o.rolname='postgres') then raise exception 'Review mobile function owner.'; end if;
    select functions||jsonb_build_array(jsonb_build_object('signature','public.tenh_mobile_management(uuid,uuid,uuid,text,jsonb)',
      'oid',p.oid,'owner',p.proowner,'source',md5(pg_catalog.pg_get_functiondef(p.oid)),'acl',coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))::text))
      into functions from pg_catalog.pg_proc p where p.oid=function_id;
  end if;

  for r in select * from (values
    ('public.products','tenh_barcode_coordinator','public.tenh_barcode_statement_lock()',30),
    ('public.branch_products','tenh_barcode_coordinator','public.tenh_barcode_statement_lock()',18),
    ('public.branch_product_details','tenh_barcode_coordinator','public.tenh_barcode_statement_lock()',14),
    ('public.product_location_stock','tenh_barcode_coordinator','public.tenh_barcode_statement_lock()',14),
    ('public.orders','tenh_barcode_coordinator','public.tenh_barcode_statement_lock()',30),
    ('public.branch_product_details','tenh_barcode_writer_required','public.tenh_barcode_branch_lock_required()',19),
    ('public.products','tenh_preserve_barcode','public.tenh_preserve_product_barcode()',23),
    ('public.products','tenh_capture_identifiers','public.tenh_capture_product_identifiers()',21),
    ('public.branch_product_details','tenh_preserve_barcode','public.tenh_preserve_branch_barcode()',23),
    ('public.branch_product_details','tenh_capture_identifiers','public.tenh_capture_product_identifiers()',21),
    ('public.orders','tenh_capture_identifiers','public.tenh_capture_order_identifiers()',21),
    ('public.orders','tenh_order_code','public.tenh_assign_order_code()',23),
    ('public.branch_products','branch_product_write','public.tenh_write_branch_product()',89),
    ('public.product_location_stock','tenh_seed_branch_product','public.tenh_seed_branch_product()',5)
  ) b(relation,name,function_signature,kind) loop
    if not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=to_regclass(r.relation)
      and t.tgname=r.name and t.tgfoid=to_regprocedure(r.function_signature) and t.tgtype=r.kind and t.tgenabled='O' and not t.tgisinternal) then
      raise exception 'Authoritative trigger binding required: %.%',r.relation,r.name;
    end if;
    select bindings||jsonb_build_array(jsonb_build_object('oid',t.oid,'relation',t.tgrelid,'name',t.tgname,'function',t.tgfoid,
      'kind',t.tgtype,'source',md5(pg_catalog.pg_get_triggerdef(t.oid))))
      into bindings from pg_catalog.pg_trigger t where t.tgrelid=to_regclass(r.relation) and t.tgname=r.name;
  end loop;
  for r in select i.indexrelid from pg_catalog.pg_index i where i.indrelid in ('public.tenh_product_identifiers'::regclass,'public.tenh_order_identifiers'::regclass)
    or i.indexrelid=to_regclass('public.orders_order_code_key') loop
    indexes:=indexes||jsonb_build_array(jsonb_build_object('oid',r.indexrelid,'source',md5(pg_catalog.pg_get_indexdef(r.indexrelid))));
  end loop;
  insert into public.tenh_barcode_contract_v2 values(true,2,functions,bindings,indexes);
end $install$;

create function public.tenh_barcode_contract_v2_ready()
returns boolean language plpgsql stable security definer set search_path='' as $ready$
declare contract public.tenh_barcode_contract_v2%rowtype; r record; f record; signature text; function_id oid;
begin
  if not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_roles o on o.oid=p.proowner
    where p.oid=to_regprocedure('public.tenh_barcode_contract_v2_ready()') and o.rolname='postgres' and p.prosecdef and p.provolatile='s') then return false; end if;
  select * into contract from public.tenh_barcode_contract_v2 where singleton and protocol=2;
  if not found then return false; end if;
  for f in select value from jsonb_array_elements(contract.functions) loop
    function_id:=to_regprocedure(f.value->>'signature');
    if function_id is null or function_id<>(f.value->>'oid')::oid then return false; end if;
    if not exists(select 1 from pg_catalog.pg_proc p where p.oid=function_id and p.proowner=(f.value->>'owner')::oid
      and md5(pg_catalog.pg_get_functiondef(p.oid))=f.value->>'source'
      and coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))::text=f.value->>'acl') then return false; end if;
  end loop;
  for f in select value from jsonb_array_elements(contract.triggers) loop
    if not exists(select 1 from pg_catalog.pg_trigger t where t.oid=(f.value->>'oid')::oid and t.tgrelid=(f.value->>'relation')::oid
      and t.tgname=f.value->>'name' and t.tgfoid=(f.value->>'function')::oid and t.tgtype=(f.value->>'kind')::smallint
      and t.tgenabled='O' and not t.tgisinternal and md5(pg_catalog.pg_get_triggerdef(t.oid))=f.value->>'source') then return false; end if;
  end loop;
  for f in select value from jsonb_array_elements(contract.indexes) loop
    if not exists(select 1 from pg_catalog.pg_index i where i.indexrelid=(f.value->>'oid')::oid and i.indisvalid and i.indisready
      and md5(pg_catalog.pg_get_indexdef(i.indexrelid))=f.value->>'source') then return false; end if;
  end loop;

  foreach signature in array array[
    'public.tenh_barcode_catalog_lock()','public.tenh_barcode_lock_required()','public.tenh_barcode_statement_lock()',
    'public.tenh_barcode_branch_lock_required()','public.tenh_claim_product_identifier(uuid,uuid,uuid,text,text)',
    'public.tenh_assert_barcode_text(text)','public.tenh_allocate_product_identifier(uuid)','public.tenh_preserve_product_barcode()',
    'public.tenh_capture_product_identifiers()','public.tenh_preserve_branch_barcode()','public.tenh_capture_order_identifiers()','public.tenh_new_order_code()'
  ] loop
    function_id:=to_regprocedure(signature);
    if has_function_privilege('anon',function_id,'EXECUTE') or has_function_privilege('authenticated',function_id,'EXECUTE') or has_function_privilege('service_role',function_id,'EXECUTE')
      or exists(select 1 from pg_catalog.pg_proc p cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
        where p.oid=function_id and a.grantee=0 and a.privilege_type='EXECUTE') then return false; end if;
  end loop;
  foreach signature in array array['public.tenh_scan_product_ids(uuid,text)','public.tenh_scan_order_ids(uuid,text)','public.tenh_pos_barcode_aliases(uuid)','public.tenh_edit_product_rows(uuid,uuid,uuid,jsonb)'] loop
    function_id:=to_regprocedure(signature);
    if not has_function_privilege('authenticated',function_id,'EXECUTE') or has_function_privilege('anon',function_id,'EXECUTE')
      or has_function_privilege('service_role',function_id,'EXECUTE')
      or exists(select 1 from pg_catalog.pg_proc p cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
        where p.oid=function_id and a.grantee=0 and a.privilege_type='EXECUTE') then return false; end if;
  end loop;
  foreach signature in array array['public.tenh_barcode_writer_lock(uuid)','public.tenh_barcode_contract_v2_ready()'] loop
    function_id:=to_regprocedure(signature);
    if not has_function_privilege('authenticated',function_id,'EXECUTE') or not has_function_privilege('service_role',function_id,'EXECUTE') or has_function_privilege('anon',function_id,'EXECUTE')
      or exists(select 1 from pg_catalog.pg_proc p cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
        where p.oid=function_id and a.grantee=0 and a.privilege_type='EXECUTE') then return false; end if;
  end loop;
  for r in select oid from pg_catalog.pg_class where oid in ('public.tenh_product_identifiers'::regclass,'public.tenh_order_identifiers'::regclass,'public.tenh_barcode_contract_v2'::regclass) loop
    if not exists(select 1 from pg_catalog.pg_class where oid=r.oid and relrowsecurity) then return false; end if;
    if has_table_privilege('anon',r.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_table_privilege('authenticated',r.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_table_privilege('service_role',r.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then return false; end if;
  end loop;
  if exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.products'::regclass and tgname='tenh_numeric_barcode' and not tgisinternal) then return false; end if;
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.orders'::regclass and attname='order_code' and atttypid='text'::regtype and attnotnull and not attisdropped) then return false; end if;
  if not exists(select 1 from pg_catalog.pg_constraint where conrelid='public.orders'::regclass and conname='orders_order_code_format'
    and contype='c' and convalidated and pg_catalog.pg_get_expr(conbin,conrelid)='(order_code ~ ''^[1-9][0-9]{11}$''::text)') then return false; end if;
  if not exists(select 1 from pg_catalog.pg_class where oid='public.branch_products'::regclass and reloptions @> array['security_invoker=true']) then return false; end if;
  return true;
exception when undefined_table or undefined_function then return false;
end $ready$;
revoke all on function public.tenh_barcode_contract_v2_ready() from public,anon;
grant execute on function public.tenh_barcode_contract_v2_ready() to authenticated,service_role;
do $$ begin if not public.tenh_barcode_contract_v2_ready() then raise exception 'Incomplete v2 barcode contract; transaction aborted.'; end if; end $$;

-- BEGIN V3 SUCCESSOR ADAPTER STAGE
-- Unapplied v3 support source; composed into the successor by the local builder.
create schema tenh_barcode_v3_private;
revoke all on schema tenh_barcode_v3_private from public,anon,authenticated,service_role;
create table tenh_barcode_v3_private.tenant_mutex(business_id uuid primary key references public.businesses(id) on delete cascade);
insert into tenh_barcode_v3_private.tenant_mutex select id from public.businesses order by id;
alter table tenh_barcode_v3_private.tenant_mutex enable row level security;
revoke all on tenh_barcode_v3_private.tenant_mutex from public,anon,authenticated,service_role;

create function tenh_barcode_v3_private.scope_exists()
returns boolean language plpgsql security definer set search_path='' as $$
declare obj oid:=pg_catalog.to_regclass('pg_temp.tenh_barcode_transaction_scope');cache oid:=pg_catalog.to_regclass('pg_temp.tenh_barcode_deleted_parents');
begin
 if obj is null then return false;end if;
 if not exists(select 1 from pg_catalog.pg_class where oid=obj and relowner='postgres'::regrole and relpersistence='t')
  or has_table_privilege('authenticated',obj,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  or has_table_privilege('service_role',obj,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  or has_table_privilege('anon',obj,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  or (select array_agg(attname::text||':'||atttypid::regtype::text order by attnum) from pg_catalog.pg_attribute where attrelid=obj and attnum>0 and not attisdropped)
    is distinct from array['transaction_id:xid8','backend_pid:integer','businesses:uuid[]'] then
  raise exception 'Untrusted transaction scope relation.' using errcode='42501';
 end if;
 if cache is null or not exists(select 1 from pg_catalog.pg_class where oid=cache and relowner='postgres'::regrole and relpersistence='t')
  or has_table_privilege('authenticated',cache,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  or has_table_privilege('service_role',cache,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  or has_table_privilege('anon',cache,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  or (select array_agg(attname::text||':'||atttypid::regtype::text order by attnum) from pg_catalog.pg_attribute where attrelid=cache and attnum>0 and not attisdropped)
    is distinct from array['relation:oid','key:uuid','business_id:uuid'] then
  raise exception 'Untrusted deleted-parent ownership cache.' using errcode='42501';
 end if;
 return exists(select 1 from pg_temp.tenh_barcode_transaction_scope where transaction_id=pg_catalog.pg_current_xact_id() and backend_pid=pg_catalog.pg_backend_pid());
end $$;
create function tenh_barcode_v3_private.require_scope(p_business uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_business is null or not tenh_barcode_v3_private.scope_exists() then raise exception 'Verified tenant scope required before rows.' using errcode='42501';end if;
 if not exists(select 1 from pg_temp.tenh_barcode_transaction_scope where transaction_id=pg_catalog.pg_current_xact_id() and backend_pid=pg_catalog.pg_backend_pid() and p_business=any(businesses)) then
  raise exception 'Writer business is outside the predeclared scope.' using errcode='42501';
 end if;
end $$;
create function tenh_barcode_v3_private.enter_scope(p_businesses uuid[],p_statement_relation oid default null,p_fresh_genesis boolean default false)
returns void language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare wanted uuid[];prior uuid[];tenant uuid;
begin
 if p_businesses is null or cardinality(p_businesses)=0 or array_position(p_businesses,null) is not null then raise exception 'Explicit tenant scope required.' using errcode='42501';end if;
 select array_agg(id order by id) into wanted from(select distinct unnest(p_businesses) id) q;
 if tenh_barcode_v3_private.scope_exists() then
  select businesses into prior from pg_temp.tenh_barcode_transaction_scope where transaction_id=pg_catalog.pg_current_xact_id();
  if not wanted<@prior then raise exception 'Predeclare every bulk tenant; scope cannot widen.' using errcode='42501';end if;
  return;
 end if;
 -- Reject late RPC/SQL entry rather than wait behind another tenant after
 -- SELECT FOR UPDATE or mutation locks. The current direct REST statement may
 -- hold its target relation lock before BEFORE STATEMENT, but not tuple locks.
 if not p_fresh_genesis and exists(select 1 from pg_catalog.pg_locks l join tenh_barcode_v3_private.row_ownership r on r.relation=l.relation
  where l.pid=pg_catalog.pg_backend_pid() and l.granted and l.mode in('RowShareLock','RowExclusiveLock','ShareRowExclusiveLock','ExclusiveLock','AccessExclusiveLock')
   and not(l.mode='RowExclusiveLock' and coalesce(l.relation=p_statement_relation,false))) then
  raise exception 'Late tenant entry rejected: enter before relation/row locks.' using errcode='42501';
 end if;
 if pg_catalog.to_regclass('pg_temp.tenh_barcode_transaction_scope') is null then
  create temporary table tenh_barcode_transaction_scope(transaction_id xid8 primary key,backend_pid integer not null,businesses uuid[] not null) on commit delete rows;
  create temporary table tenh_barcode_deleted_parents(relation oid,key uuid,business_id uuid,primary key(relation,key)) on commit delete rows;
  revoke all on pg_temp.tenh_barcode_transaction_scope from public,anon,authenticated,service_role;
  revoke all on pg_temp.tenh_barcode_deleted_parents from public,anon,authenticated,service_role;
 end if;
 foreach tenant in array wanted loop
  perform 1 from tenh_barcode_v3_private.tenant_mutex where business_id=tenant for no key update;
  if not found then raise exception 'Missing tenant coordinator; use reviewed business genesis.' using errcode='42501';end if;
 end loop;
 insert into pg_temp.tenh_barcode_transaction_scope values(pg_catalog.pg_current_xact_id(),pg_catalog.pg_backend_pid(),wanted);
end $$;

-- Public entry helper is called WITHIN the reviewed writer transaction. Calling
-- it as a separate RPC cannot carry proof into a later HTTP request.
create function public.tenh_barcode_enter_business_v3(p_business uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_business is null then raise exception 'Business required.' using errcode='42501';end if;
 if auth.uid() is null then
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Sign in.' using errcode='42501';end if;
 else
  -- Existing branch resolver checks active membership, team password and header.
  perform public.tenh_request_branch(p_business);
 end if;
 perform tenh_barcode_v3_private.enter_scope(array[p_business]);
end $$;
revoke all on function public.tenh_barcode_enter_business_v3(uuid) from public,anon;
grant execute on function public.tenh_barcode_enter_business_v3(uuid) to authenticated,service_role;

create function tenh_barcode_v3_private.statement_entry()
returns trigger language plpgsql security definer set search_path='' as $$
declare headers jsonb;business uuid;route text:=coalesce(current_setting('request.path',true),'');method text:=coalesce(current_setting('request.method',true),'');
begin
 if tenh_barcode_v3_private.scope_exists() then return null;end if;
 -- New businesses have no existing tenant row to lock. The root-row guard
 -- validates ownership and AFTER INSERT genesis establishes fresh scope.
 if tg_table_name='businesses' and tg_op='INSERT' then return null;end if;
 if route<>'/'||tg_table_name or method not in('POST','PATCH','DELETE') then
  raise exception 'Unsupported writer: tenant entry must precede row locks.' using errcode='42501';
 end if;
 headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 -- Global service/own-user audit rows are outside business import snapshots.
 -- The row guard permits ONLY NULL business/location; any tenant row still needs
 -- explicit scope. This is not a fallback for a missing tenant header.
 if tg_table_name='audit_logs' and tg_op='INSERT' and (auth.uid() is not null or coalesce(auth.role(),'')='service_role') and nullif(headers->>'x-tenh-business-id','') is null then return null;end if;
 begin business:=nullif(headers->>'x-tenh-business-id','')::uuid;
 exception when invalid_text_representation then raise exception 'Invalid business header.' using errcode='42501';end;
 if auth.uid() is null then
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Sign in.' using errcode='42501';end if;
 else perform public.tenh_request_branch(business);end if;
 if business is null then raise exception 'Explicit business header required.' using errcode='42501';end if;
 perform tenh_barcode_v3_private.enter_scope(array[business],tg_relid);
 return null;
end $$;

create table tenh_barcode_v3_private.row_ownership(
 relation oid primary key,tenant_field text,parent_relation regclass,parent_key text,row_key text
);
alter table tenh_barcode_v3_private.row_ownership enable row level security;
revoke all on tenh_barcode_v3_private.row_ownership from public,anon,authenticated,service_role;
create function tenh_barcode_v3_private.row_business(p_relation oid,p_row jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare rule tenh_barcode_v3_private.row_ownership%rowtype;business uuid;
begin
 select * into rule from tenh_barcode_v3_private.row_ownership where relation=p_relation;
 if not found then raise exception 'Unsupported row ownership.' using errcode='42501';end if;
 if rule.tenant_field is not null then business:=nullif(p_row->>rule.tenant_field,'')::uuid;
 else
  execute pg_catalog.format('select business_id from %s where %I=$1',rule.parent_relation,rule.parent_key) into business using (p_row->>rule.row_key)::uuid;
  if business is null and tenh_barcode_v3_private.scope_exists() then
   select business_id into business from pg_temp.tenh_barcode_deleted_parents where relation=rule.parent_relation and key=(p_row->>rule.row_key)::uuid;
  end if;
 end if;
 if business is null then raise exception 'Missing verified row business.' using errcode='42501';end if;
 return business;
end $$;
-- Validate changed foreign keys before PostgreSQL acquires their parent locks.
-- This prevents a service/bulk child row from crossing tenant ownership even
-- when a historical FK references only the parent's globally unique UUID.
create function tenh_barcode_v3_private.require_parent_scope(p_relation oid,p_new jsonb,p_old jsonb,p_business uuid)
returns void language plpgsql security definer set search_path='' as $$
declare fk record;predicate text;parent jsonb;values_json jsonb;changed boolean;
begin
 for fk in select c.oid,c.confrelid,c.conkey,c.confkey from pg_catalog.pg_constraint c join tenh_barcode_v3_private.row_ownership r on r.relation=c.confrelid where c.conrelid=p_relation and c.contype='f' loop
  select string_agg(pg_catalog.format('to_jsonb(p)->>%L=$1->>%L',pa.attname,ca.attname),' and ' order by k.ordinality),
    jsonb_object_agg(ca.attname,p_new->ca.attname),bool_or(p_old is null or p_new->ca.attname is distinct from p_old->ca.attname)
   into predicate,values_json,changed
   from unnest(fk.conkey,fk.confkey) with ordinality k(child_num,parent_num,ordinality)
   join pg_catalog.pg_attribute ca on ca.attrelid=p_relation and ca.attnum=k.child_num
   join pg_catalog.pg_attribute pa on pa.attrelid=fk.confrelid and pa.attnum=k.parent_num;
  if not changed or exists(select 1 from jsonb_each(values_json) where value='null'::jsonb) then continue;end if;
  execute pg_catalog.format('select to_jsonb(p) from %s p where %s',fk.confrelid::regclass,predicate) into parent using values_json;
  if parent is not null and tenh_barcode_v3_private.row_business(fk.confrelid,parent) is distinct from p_business then raise exception 'Foreign key crosses business scope.' using errcode='42501';end if;
 end loop;
end $$;
create function tenh_barcode_v3_private.row_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare old_business uuid;new_business uuid;
begin
 if tg_table_name='audit_logs' and tg_op='INSERT' and to_jsonb(new)->>'business_id' is null and to_jsonb(new)->>'location_id' is null
  and ((auth.uid() is not null and (to_jsonb(new)->>'user_id')::uuid is not distinct from auth.uid()) or coalesce(auth.role(),'')='service_role') then return new;end if;
 if tg_table_name='businesses' and tg_op='INSERT' then
  if not ((auth.uid() is not null and new.owner_id is not distinct from auth.uid()) or coalesce(auth.role(),'')='service_role') then raise exception 'Business genesis denied.' using errcode='42501';end if;
  return new; -- Normal INSERT RLS/constraints still apply.
 end if;
 if tg_op<>'INSERT' then old_business:=tenh_barcode_v3_private.row_business(tg_relid,to_jsonb(old));perform tenh_barcode_v3_private.require_scope(old_business);end if;
 if tg_op<>'DELETE' then new_business:=tenh_barcode_v3_private.row_business(tg_relid,to_jsonb(new));perform tenh_barcode_v3_private.require_scope(new_business);end if;
 if tg_op='UPDATE' and old_business is distinct from new_business then raise exception 'Tenant reassignment unsupported.' using errcode='42501';end if;
 if tg_op<>'DELETE' then perform tenh_barcode_v3_private.require_parent_scope(tg_relid,to_jsonb(new),case when tg_op='UPDATE' then to_jsonb(old) else null end,new_business);end if;
 if tg_op='DELETE' and nullif(to_jsonb(old)->>'id','') is not null then
  insert into pg_temp.tenh_barcode_deleted_parents values(tg_relid,(to_jsonb(old)->>'id')::uuid,old_business) on conflict do nothing;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create function tenh_barcode_v3_private.genesis()
returns trigger language plpgsql security definer set search_path='' as $$
declare prior uuid[];
begin
 -- This UUID is a newly inserted, uncommitted PK row; it is not an existing
 -- business. Extending scope with it cannot wait on another writer's mutex.
 insert into tenh_barcode_v3_private.tenant_mutex values(new.id);
 if tenh_barcode_v3_private.scope_exists() then
  select businesses into prior from pg_temp.tenh_barcode_transaction_scope where transaction_id=pg_catalog.pg_current_xact_id();
  perform 1 from tenh_barcode_v3_private.tenant_mutex where business_id=new.id for no key update;
  update pg_temp.tenh_barcode_transaction_scope set businesses=(select array_agg(id order by id) from(select distinct unnest(prior||new.id) id) q) where transaction_id=pg_catalog.pg_current_xact_id();
 else perform tenh_barcode_v3_private.enter_scope(array[new.id],tg_relid,true);end if;
 return new;
end $$;
-- Alphabetically precedes other seed triggers; their writes inherit new scope.
do $$ begin
 if exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.businesses'::regclass and not tgisinternal and(tgtype&5)=5 and(tgtype&2)=0 and tgname<'a00_tenh_barcode_genesis') then raise exception 'Business seed trigger precedes reviewed genesis; reconcile trigger ordering.';end if;
end $$;
create trigger a00_tenh_barcode_genesis after insert on public.businesses for each row execute function tenh_barcode_v3_private.genesis();
revoke all on all functions in schema tenh_barcode_v3_private from public,anon,authenticated,service_role;

-- tenh_edit_product_rows: docs/proposed/20261005_edit_product_rows_v2.PROPOSED.sql
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.tenh_edit_product_rows(uuid,uuid,uuid,jsonb)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.tenh_edit_product_rows(uuid,uuid,uuid,jsonb)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: tenh_edit_product_rows';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.tenh_edit_product_rows(uuid,uuid,uuid,jsonb)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'ee9cb3e253d55f64f425a7b374229e9e' then raise exception 'Reviewed writer body differs: tenh_edit_product_rows';end if;
  source:=pg_get_functiondef('public.tenh_edit_product_rows(uuid,uuid,uuid,jsonb)'::regprocedure);
  execute replace(source,body,'
declare
  rep record; prior record; item jsonb; vals jsonb;
  patch public.branch_product_details%rowtype;
  ids uuid[]; group_ids uuid[]; priors jsonb := ''{}''::jsonb;
  row_id uuid; affected uuid; saved_version timestamptz;
  saved_ids jsonb := ''[]''::jsonb; saved_versions jsonb := ''{}''::jsonb;
begin
  perform public.tenh_barcode_enter_business_v3(p_business); -- v3 entry precedes original locks; original permissions/revisions remain.

  if auth.uid() is null then raise exception ''Sign in to continue.'' using errcode=''42501''; end if;
  perform public.tenh_assert_effective_permission(p_business,''products.update''); perform public.tenh_barcode_enter_business_v3(p_business);
  if p_branch is null or public.tenh_request_branch(p_business) is distinct from p_branch then
    raise exception ''Your operating branch changed. Reload before saving.'' using errcode=''42501'';
  end if;
  -- tenh_assert_plan_branch is not executable by authenticated (captured ACL); the
  -- SECURITY DEFINER write trigger enforces the plan/branch gate on every row below.
  if jsonb_typeof(p_rows) is distinct from ''array''
    or jsonb_array_length(p_rows) not between 1 and 500 or octet_length(p_rows::text)>1048576 then
    raise exception ''Submit 1–500 saved product rows within the edit limit.'' using errcode=''22023'';
  end if;

  select v.id, v.product_type, v.variant_group_id into rep from public.branch_products v
    where v.business_id=p_business and v.id=p_product;
  if not found or rep.product_type=''bundle'' then
    raise exception ''Product was not found in this branch.'' using errcode=''42501'';
  end if;
  -- Serialise batch saves of the same group; later statements then read committed versions.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    ''tenh_edit_product_rows:''||p_business::text||'':''||coalesce(rep.variant_group_id,rep.id)::text, 0));

  select array_agg(v.id order by v.id) into group_ids from public.branch_products v
    where v.business_id=p_business
      and (v.id=p_product or (rep.product_type=''variant'' and rep.variant_group_id is not null and v.variant_group_id=rep.variant_group_id));
  begin
    select array_agg((value->>''id'')::uuid order by (value->>''id'')::uuid) into ids from jsonb_array_elements(p_rows);
  exception when invalid_text_representation then
    raise exception ''Invalid product row ID.'' using errcode=''22023'';
  end;
  if ids is distinct from group_ids then
    raise exception ''The saved variant list changed. Reload before saving.'' using errcode=''PT409'';
  end if;

  for item in select value from jsonb_array_elements(p_rows) loop
    vals := item->''values'';
    if jsonb_typeof(vals) is distinct from ''object'' or nullif(item->>''expectedUpdatedAt'','''') is null then
      raise exception ''The product row edit is incomplete.'' using errcode=''22023'';
    end if;
    if exists(select 1 from jsonb_object_keys(vals) k where k not in (
      ''name'',''category_id'',''description'',''sku'',''barcode'',''size'',''color'',''cost_price'',''selling_price'',
      ''low_stock_quantity'',''is_active'',''is_online'',''image_url'',''image_urls'',''variant_image_url'')) then
      raise exception ''Use the dedicated workflow for stock or product structure.'' using errcode=''22023'';
    end if;
    if not (vals ?& array[''name'',''category_id'',''description'',''sku'',''size'',''color'',''cost_price'',''selling_price'',''low_stock_quantity'',''is_active'',''is_online'']) then
      raise exception ''The product row edit is incomplete.'' using errcode=''22023'';
    end if;
    if vals ? ''image_urls'' and (jsonb_typeof(vals->''image_urls'') is distinct from ''array'' or jsonb_array_length(vals->''image_urls'')>8
      or exists(select 1 from jsonb_array_elements(vals->''image_urls'') u where jsonb_typeof(u) is distinct from ''string'')) then
      raise exception ''Use up to 8 product images.'' using errcode=''22023'';
    end if;
    row_id := (item->>''id'')::uuid;
    select v.updated_at, v.is_active, v.barcode into prior from public.branch_products v
      where v.business_id=p_business and v.id=row_id;
    if not found or prior.updated_at is distinct from (item->>''expectedUpdatedAt'')::timestamptz then
      raise exception ''A variant changed while editing. Reload before saving.'' using errcode=''PT409'';
    end if;
    priors := priors || jsonb_build_object(row_id::text, jsonb_build_object(''barcode'', prior.barcode));
    patch := jsonb_populate_record(null::public.branch_product_details, vals);
    if patch.is_active is null or patch.is_online is null
      or length(btrim(coalesce(patch.name,''''))) not between 2 and 160
      or length(btrim(coalesce(patch.sku,''''))) not between 1 and 80
      or patch.cost_price is null or patch.selling_price is null or patch.cost_price<0 or patch.selling_price<0
      or patch.cost_price::text in (''NaN'',''Infinity'',''-Infinity'') or patch.selling_price::text in (''NaN'',''Infinity'',''-Infinity'')
      or patch.low_stock_quantity is null or patch.low_stock_quantity<0
      or (not patch.is_active and patch.is_online) then
      raise exception ''Enter a valid name, SKU, prices, low-stock threshold and visibility.'' using errcode=''22023'';
    end if;
    if rep.product_type=''variant'' and (nullif(btrim(patch.size),'''') is null or nullif(btrim(patch.color),'''') is null) then
      raise exception ''Each variant needs size and colour.'' using errcode=''22023'';
    end if;
    if prior.is_active is distinct from patch.is_active then
      perform public.tenh_assert_effective_permission(p_business,''products.disable'');
    end if;
  end loop;
  if (select count(distinct lower(btrim(value->''values''->>''sku''))) from jsonb_array_elements(p_rows))<>cardinality(ids)
    or (select count(*)<>count(distinct b) from (select lower(coalesce(nullif(value->''values''->>''barcode'',''''), nullif(priors->(value->>''id'')->>''barcode'',''''))) b
          from jsonb_array_elements(p_rows) where not (value->''values'' ? ''barcode'' and nullif(btrim(value->''values''->>''barcode''),'''') is null)) x where b is not null)
    or (rep.product_type=''variant'' and (select count(distinct (lower(btrim(value->''values''->>''color'')), lower(btrim(value->''values''->>''size'')))) from jsonb_array_elements(p_rows))<>cardinality(ids)) then
    raise exception ''Each SKU, barcode and variant combination must be unique.'' using errcode=''22023'';
  end if;

  -- Phase 1 (id order): version-guarded placeholder identifiers lock every row and free
  -- the group''s SKUs/barcodes so swaps between variants pass the per-row trigger check.
  for item in select value from jsonb_array_elements(p_rows) order by (value->>''id'')::uuid loop
    row_id := (item->>''id'')::uuid; affected := null;
    update public.branch_products v set sku=''~tenh-edit-''||v.id::text, barcode=case when v.barcode='''' then v.barcode else null end
      where v.business_id=p_business and v.id=row_id and v.updated_at=(item->>''expectedUpdatedAt'')::timestamptz
      returning v.id into affected;
    if affected is null then raise exception ''A variant changed while saving. Reload before saving.'' using errcode=''PT409''; end if;
  end loop;
  -- Phase 2: final values. Absent barcode keeps the saved one.
  for item in select value from jsonb_array_elements(p_rows) order by (value->>''id'')::uuid loop
    row_id := (item->>''id'')::uuid; vals := item->''values''; affected := null;
    patch := jsonb_populate_record(null::public.branch_product_details, vals);
    update public.branch_products v set
      name=btrim(patch.name), category_id=patch.category_id, description=patch.description, sku=btrim(patch.sku),
      barcode=case when vals ? ''barcode'' and patch.barcode is not null and patch.barcode<>'''' then patch.barcode else priors->row_id::text->>''barcode'' end,
      size=nullif(btrim(patch.size),''''), color=nullif(btrim(patch.color),''''),
      cost_price=patch.cost_price, selling_price=patch.selling_price,
      low_stock_quantity=patch.low_stock_quantity, is_active=patch.is_active, is_online=patch.is_online,
      image_url=case when vals ? ''image_url'' then patch.image_url else v.image_url end,
      image_urls=case when vals ? ''image_urls'' then patch.image_urls else v.image_urls end,
      variant_image_url=case when vals ? ''variant_image_url'' then patch.variant_image_url else v.variant_image_url end
      where v.business_id=p_business and v.id=row_id
      returning v.id, v.updated_at into affected, saved_version;
    if affected is null then raise exception ''A variant changed while saving. Reload before saving.'' using errcode=''PT409''; end if;
    saved_ids := saved_ids || jsonb_build_array(affected);
    saved_versions := saved_versions || jsonb_build_object(affected::text, saved_version);
  end loop;
  return jsonb_build_object(''success'',true,''ids'',saved_ids,''versions'',saved_versions);
end;
');
 end if;
end $patch$;
-- tenh_import_business_safe: supabase/migrations/20260924018000_branch_import_scope.sql
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.tenh_import_business_safe(uuid,text,text,jsonb,uuid,boolean,text,uuid,text)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.tenh_import_business_safe(uuid,text,text,jsonb,uuid,boolean,text,uuid,text)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: tenh_import_business_safe';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.tenh_import_business_safe(uuid,text,text,jsonb,uuid,boolean,text,uuid,text)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'3dcd22dee70046e70f2c0e166ce318c6' then raise exception 'Reviewed writer body differs: tenh_import_business_safe';end if;
  source:=pg_get_functiondef('public.tenh_import_business_safe(uuid,text,text,jsonb,uuid,boolean,text,uuid,text)'::regprocedure);
  execute replace(source,body,'
declare
 t text; r jsonb; eligible jsonb:=''[]''; inventory_exists boolean; old_row jsonb; full_row jsonb; patch jsonb; snap jsonb; report jsonb; prior record;
 tables text[]; fields text[]; keys text[]; pk text[]; condition text; cols text; vals text; write_table text;
 row_id uuid; matches uuid[]; n integer:=0; added integer:=0; changed integer:=0; unchanged integer:=0;
 fingerprint text; payload_hash text; safe_table boolean; seen text[]:=array[]::text[]; identity text;
 allowed text[]:=array[''businesses'',''business_locations'',''business_storefronts'',''business_receipt_settings'',''business_customer_settings'',''business_delivery_zones'',''business_tables'',''products'',''product_variants'',''categories'',''product_location_stock'',''product_option_groups'',''product_options'',''bundle_items'',''inventory_movements'',''stock_adjustments'',''stock_transfers'',''stock_transfer_items'',''orders'',''order_items'',''returns'',''return_items'',''tenh_pos_holds'',''tenh_pos_points_used'',''customers'',''customer_credit_accounts'',''customer_credit_ledger'',''customer_loyalty_transactions'',''business_coupons'',''coupon_redemptions'',''suppliers'',''purchases'',''purchase_items'',''purchase_orders'',''purchase_order_items'',''expenses'',''cash_register_shifts'',''cash_movements'',''audit_logs'',''business_activity_history'',''branch_product_details'',''branch_receipt_settings'',''branch_customer_settings'',''branch_pos_settings'',''branch_bundle_recipes'',''branch_role_permissions'',''branch_notification_role_settings''];
begin
  perform public.tenh_barcode_enter_business_v3(p_business_id); -- v3 entry precedes original locks; original permissions/revisions remain.

 p_branch_id:=coalesce(p_branch_id,public.tenh_request_branch(p_business_id));
 if p_branch_id is distinct from public.tenh_request_branch(p_business_id) or p_branch_id is null then raise exception ''The operating branch changed. Validate the file again.'';end if;
 perform public.tenh_assert_effective_permission(p_business_id,''exports.manage'');
 perform public.tenh_assert_plan_branch(p_business_id,p_branch_id);
 if exists(select 1 from public.business_locations where id=p_branch_id and plan_disable_pending) then raise exception ''This branch is closing after a plan change.'';end if;
 if p_commit is null then raise exception ''Invalid confirmation.'';end if;
 if auth.uid() is null or not exists(select 1 from public.business_members where business_id=p_business_id and user_id=auth.uid() and role::text=''owner'' and is_active) then raise exception ''Only the business owner can import data.'';end if;
 if p_kind is null or p_kind not in (''backup'',''products'',''customers'',''suppliers'',''inventory'') or p_mode is null or p_mode not in (''insert'',''merge'',''update'') then raise exception ''Invalid import options.'';end if;
 if p_payload is null or octet_length(p_payload::text)>10000000 then raise exception ''Import exceeds the 10 MB limit.'';end if;
 if p_kind=''backup'' then
  if p_mode=''insert'' then raise exception ''Use a CSV template to add new records. JSON templates restore existing records only.'';end if;
  if jsonb_typeof(p_payload)<>''object'' then raise exception ''Invalid backup datasets.'';end if;
  select array_agg(key order by key) into tables from jsonb_each(p_payload);
  if tables is null or not tables<@allowed then raise exception ''Backup contains an unsupported dataset.'';end if;
 else
  if jsonb_typeof(p_payload)<>''array'' or jsonb_array_length(p_payload) not between 1 and 1000 then raise exception ''CSV imports require 1 to 1,000 rows.'';end if;
  if not exists(select 1 from public.business_locations where id=p_branch_id and business_id=p_business_id and is_active) then raise exception ''Choose an active branch in this business.'';end if;
  tables:=case when p_kind=''inventory'' then array[''business_locations'',''product_location_stock'',''products'',''stock_adjustments''] else array[''business_locations'',p_kind] end;
 end if;
 perform public.tenh_barcode_enter_business_v3(p_business_id); -- Tenant mutex already held.
 payload_hash:=md5(jsonb_build_array(p_kind,p_mode,p_payload,p_branch_id)::text);
 if p_commit then
  if p_request_id is null or p_expected is null then raise exception ''Validate and confirm the file first.'';end if;
  select * into prior from public.business_import_requests where business_id=p_business_id and request_id=p_request_id;
  if found then
   if prior.payload_hash<>payload_hash or prior.user_id<>auth.uid() then raise exception ''This import reference belongs to another request.'';end if;
   return prior.result||jsonb_build_object(''replayed'',true);
  end if;
 end if;
 -- Prevent a sale or edit between comparison and write. Locks end with this RPC.
 -- Tenant snapshot protected by all guarded writer entries; no table lock.
 if p_kind<>''backup'' and not exists(select 1 from public.business_locations where id=p_branch_id and business_id=p_business_id and is_active) then raise exception ''Choose an active branch in this business.'';end if;
 -- Shared branch datasets inherit the verified tenant scope.
 snap:=public.tenh_export_business(p_business_id,tables);
 select md5(coalesce(jsonb_object_agg(key,(select coalesce(jsonb_agg(value order by value::text),''[]'') from jsonb_array_elements(e.value))),''{}'')::text) into fingerprint from jsonb_each(snap) e;
 fingerprint:=md5(jsonb_build_array(fingerprint,payload_hash)::text);
 if p_commit and p_expected<>fingerprint then raise exception ''Data changed since validation. Validate again before importing.'';end if;
 -- Preview executes real constraints and triggers in a rolled-back subtransaction.
 begin
 if p_kind=''backup'' then
  foreach t in array tables loop
   write_table:=case t when ''products'' then ''branch_products'' when ''business_receipt_settings'' then ''branch_receipt_settings'' when ''business_customer_settings'' then ''branch_customer_settings'' else t end;
   if jsonb_typeof(p_payload->t)<>''array'' then raise exception ''Dataset % must contain rows.'',t;end if;
   n:=n+jsonb_array_length(p_payload->t);
   if n>20000 then raise exception ''Import at most 20,000 records at a time.'';end if;
   select array_agg(a.attname::text order by k.ordinality) into pk from pg_catalog.pg_constraint c cross join lateral unnest(c.conkey) with ordinality k(num,ordinality) join pg_catalog.pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num where c.conrelid=format(''public.%I'',t)::regclass and c.contype=''p'';
   if pk is null then raise exception ''Dataset % has no safe record identity.'',t;end if;
   fields:=case t
    when ''products'' then array[''name'',''sku'',''barcode'',''description'',''cost_price'',''selling_price'',''low_stock_quantity'',''is_active'',''image_url'',''style_name'',''brand_name'']
    when ''customers'' then array[''name'',''phone'',''email'',''address'',''note'',''birthday'']
    when ''suppliers'' then array[''name'',''contact_person'',''phone'',''email'',''address'',''notes'',''is_active'']
    else array[]::text[] end;
   safe_table:=t in (''branch_receipt_settings'',''branch_customer_settings'',''branch_pos_settings'',''business_storefronts'',''business_receipt_settings'',''business_customer_settings'',''business_delivery_zones'',''business_tables'',''categories'');
   for r in select value from jsonb_array_elements(p_payload->t) loop
    if jsonb_typeof(r)<>''object'' or exists(select 1 from unnest(pk) k where nullif(r->>k,'''') is null) then raise exception ''Invalid record identity in %.'',t;end if;
    if public.tenh_export_redact(r) is distinct from r then raise exception ''Security credentials cannot be imported.'';end if;
    identity:=t||'':''||(select jsonb_object_agg(k,r->k)::text from unnest(pk) k);
    if identity=any(seen) then raise exception ''Duplicate record in %.'',t;end if;
    seen:=array_append(seen,identity);
    select value into old_row from jsonb_array_elements(snap->t) where not exists(select 1 from unnest(pk) k where value->k is distinct from r->k);
    if old_row is null then raise exception ''% contains a missing or foreign record. Backup import only updates existing records; use CSV to add products, customers or suppliers.'',t;end if;
    if r=old_row then unchanged:=unchanged+1;continue;end if;
    if safe_table then select array_agg(key) into fields from jsonb_each(old_row) where key<>all(pk) and key not in (''id'',''business_id'',''owner_id'',''location_id'',''created_at'',''updated_at'') and key !~* ''(password|secret|token|credential|api.?key|authorization|fingerprint|raw_payload|provider_response|payway_response)'';end if;
    fields:=coalesce(fields,array[]::text[]);
    -- Full row comparison protects IDs, balances, inventory and security fields.
    if (r-fields-array[''updated_at'']) is distinct from (old_row-fields-array[''updated_at'']) or cardinality(fields)=0 then raise exception ''% contains changed protected data. Orders, balances, stock, branches and history cannot be restored over live records.'',t;end if;
    select coalesce(jsonb_object_agg(key,value),''{}'') into patch from jsonb_each(r) where key=any(fields) and value is distinct from old_row->key;
    if patch=''{}'' then unchanged:=unchanged+1;continue;end if;
    select string_agg(format(''%I=(jsonb_populate_record(null::public.%I,$1)).%I'',key,write_table,key),'','') into cols from jsonb_each(patch);
    select string_agg(format(''to_jsonb(target)->%L=$2->%L'',k,k),'' and '') into condition from unnest(pk) k;
    if write_table in (''branch_receipt_settings'',''branch_customer_settings'',''branch_pos_settings'') then condition:=condition||format('' and target.location_id=%L::uuid'',p_branch_id);end if;
    execute format(''select to_jsonb(target) from public.%I target where %s'',write_table,replace(condition,''$2'',''$1'')) into full_row using r;
    if exists(select 1 from jsonb_object_keys(patch) k where full_row->k is distinct from old_row->k) then raise exception ''Sensitive settings must be edited in Settings; import would remove hidden credentials.'';end if;
    execute format(''update public.%I target set %s where %s'',write_table,cols,condition) using patch,r;
    changed:=changed+1;
   end loop;
  end loop;
 elsif p_kind=''inventory'' then
  for r in select value from jsonb_array_elements(p_payload) loop
   if not exists(select 1 from public.business_locations where id=p_branch_id and business_id=p_business_id and upper(code)=upper(r->>''branch_code'')) then raise exception ''Inventory file contains a different branch. Switch branch before importing.'';end if;
   if upper(r->>''sku'')=any(seen) then raise exception ''Duplicate inventory SKU.'';end if;seen:=array_append(seen,upper(r->>''sku''));
   select array_agg(id) into matches from public.branch_products where business_id=p_business_id and upper(sku)=upper(r->>''sku'');
   if coalesce(cardinality(matches),0)<>1 then raise exception ''Inventory SKU must match exactly one product in this business.'';end if;
   select exists(select 1 from public.product_location_stock where business_id=p_business_id and location_id=p_branch_id and product_id=matches[1]) into inventory_exists;
   if (p_mode=''insert'' and inventory_exists) or (p_mode=''update'' and not inventory_exists) then unchanged:=unchanged+1;continue;end if;
   if coalesce((r->>''quantity'')::integer,-1)<0 or coalesce((r->>''low_stock_threshold'')::integer,0)<0 then raise exception ''Inventory quantities must be zero or greater.'';end if;
   eligible:=eligible||jsonb_build_array(r);
   if inventory_exists then changed:=changed+1;else added:=added+1;end if;
  end loop;
  if jsonb_array_length(eligible)>0 then
   for r in select value from jsonb_array_elements(eligible) loop
    select id into row_id from public.branch_products where business_id=p_business_id and upper(sku)=upper(r->>''sku'');
    select quantity into n from public.product_location_stock where business_id=p_business_id and location_id=p_branch_id and product_id=row_id;
    perform public.tenh_adjust_branch_stock(p_business_id,p_branch_id,row_id,''set'',(r->>''quantity'')::integer,''Inventory import'',p_filename,gen_random_uuid(),n);
    update public.product_location_stock set low_stock_threshold=coalesce((r->>''low_stock_threshold'')::integer,0) where business_id=p_business_id and location_id=p_branch_id and product_id=row_id;
   end loop;
  end if;
  n:=jsonb_array_length(p_payload);
 else
  
  fields:=case p_kind when ''products'' then array[''name'',''sku'',''barcode'',''description'',''cost_price'',''selling_price'',''low_stock_quantity'',''is_active''] when ''customers'' then array[''name'',''phone'',''email'',''address'',''note''] else array[''name'',''contact_person'',''phone'',''email'',''address'',''notes'',''is_active''] end;
  for r in select value from jsonb_array_elements(p_payload) loop
   n:=n+1;
   if jsonb_typeof(r)<>''object'' or length(trim(coalesce(r->>''name'','''')))<2 or exists(select 1 from jsonb_object_keys(r) k where not k=any(fields)) then raise exception ''Invalid or unsupported fields in row %.'',n;end if;
   if p_kind=''products'' then
    if nullif(trim(r->>''sku''),'''') is null or coalesce((r->>''cost_price'')::numeric,-1)<0 or coalesce((r->>''selling_price'')::numeric,-1)<0 or coalesce((r->>''low_stock_quantity'')::integer,-1)<0 then raise exception ''Invalid product values in row %.'',n;end if;
    select array_agg(id) into matches from public.branch_products where business_id=p_business_id and upper(sku)=upper(r->>''sku'');
   elsif p_kind=''customers'' then
    if nullif(r->>''email'','''') is null and nullif(r->>''phone'','''') is null then raise exception ''Customer row % needs email or phone to prevent duplicates.'',n;end if;
    select array_agg(id) into matches from public.customers where business_id=p_business_id and location_id=p_branch_id and ((nullif(r->>''email'','''') is not null and lower(email)=lower(r->>''email'')) or (nullif(r->>''phone'','''') is not null and phone=r->>''phone''));
   else
    select array_agg(id) into matches from public.suppliers where business_id=p_business_id and location_id=p_branch_id and ((nullif(r->>''email'','''') is not null and lower(email)=lower(r->>''email'')) or lower(name)=lower(r->>''name''));
   end if;
   if cardinality(matches)>1 then raise exception ''Row % matches multiple records. Resolve duplicates first.'',n;end if;
   row_id:=matches[1];
   if row_id is not null and p_mode=''insert'' then unchanged:=unchanged+1;continue;end if;
   if row_id is not null and row_id::text=any(seen) then raise exception ''Multiple rows match the same record.'';end if;
   if row_id is null and p_mode=''update'' then unchanged:=unchanged+1;continue;end if;
   patch:=r;
   if row_id is null then
    row_id:=gen_random_uuid();
    patch:=patch||jsonb_build_object(''id'',row_id,''business_id'',p_business_id,''owner_id'',auth.uid());
    if p_kind<>''products'' then patch:=patch||jsonb_build_object(''location_id'',p_branch_id);end if;
    select string_agg(format(''%I'',key),'',''),string_agg(format(''(jsonb_populate_record(null::public.%I,$1)).%I'',p_kind,key),'','') into cols,vals from jsonb_each(patch);
    execute format(''insert into public.%I (%s) select %s'',p_kind,cols,vals) using patch;
    if p_kind=''products'' then
     insert into public.product_location_stock(business_id,location_id,product_id,quantity,low_stock_threshold) values(p_business_id,p_branch_id,row_id,0,coalesce((r->>''low_stock_quantity'')::integer,0));
    end if;
    added:=added+1;
   else
    select value into old_row from jsonb_array_elements(snap->p_kind) where value->>''id''=row_id::text;
    if old_row @> patch then unchanged:=unchanged+1;
    else
     select string_agg(format(''%I=(jsonb_populate_record(null::public.%I,$1)).%I'',key,p_kind,key),'','') into cols from jsonb_each(patch);
     execute format(''update public.%I set %s,updated_at=now() where id=$2 and business_id=$3'',case when p_kind=''products'' then ''branch_products'' else p_kind end,cols) using patch,row_id,p_business_id;
     changed:=changed+1;
    end if;
   end if;
   seen:=array_append(seen,row_id::text);
  end loop;
 end if;
 report:=jsonb_build_object(''inserted'',added,''updated'',changed,''skipped'',unchanged,''rowCount'',n,''fingerprint'',fingerprint,''datasets'',tables);
 if not p_commit then raise exception using errcode=''P0099'',message=''preview rollback'';end if;
 exception when sqlstate ''P0099'' then null;
 end;
 if p_commit then
  insert into public.business_import_requests(business_id,request_id,user_id,payload_hash,result) values(p_business_id,p_request_id,auth.uid(),payload_hash,report);
  insert into public.data_transfer_jobs(business_id,user_id,direction,entity,format,mode,filename,row_count,status,summary) values(p_business_id,auth.uid(),''import'',case when p_kind=''backup'' then ''all'' else p_kind end,case when p_kind=''backup'' then ''json'' else ''csv'' end,p_mode,left(p_filename,255),n,''completed'',report);
 end if;
 return report;
end;');
 end if;
end $patch$;
-- tenh_mobile_management: supabase/migrations/20260927004000_mobile_management.sql
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.tenh_mobile_management(uuid,uuid,uuid,text,jsonb)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.tenh_mobile_management(uuid,uuid,uuid,text,jsonb)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: tenh_mobile_management';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.tenh_mobile_management(uuid,uuid,uuid,text,jsonb)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'4e6dd9724d78bcd3d3bde16fa278eff0' then raise exception 'Reviewed writer body differs: tenh_mobile_management';end if;
  source:=pg_get_functiondef('public.tenh_mobile_management(uuid,uuid,uuid,text,jsonb)'::regprocedure);
  execute replace(source,body,'
declare saved public.mobile_management_requests%rowtype; v_result jsonb; permission text; target uuid;
  item jsonb; product public.branch_product_details%rowtype; transfer public.stock_transfers%rowtype;
  store public.business_storefronts%rowtype; supplier public.suppliers%rowtype;
  v_total numeric:=0; v_quantity integer; price numeric; cost numeric; threshold integer; category uuid;
  mode text; kind text; row_id uuid; ids jsonb:=''[]''; option_group jsonb; option_item jsonb; group_id uuid;
begin
  perform public.tenh_barcode_enter_business_v3(p_business_id); -- v3 entry precedes original locks; original permissions/revisions remain.

  if auth.uid() is null then raise exception ''Sign in to continue.'' using errcode=''42501''; end if;
  permission:=case p_operation when ''product-create'' then ''products.create'' when ''product-edit'' then ''products.update''
    when ''bundle-create'' then ''products.create'' when ''bundle-edit'' then ''products.update'' when ''bundle-toggle'' then ''products.update'' when ''bundle-pack'' then ''products.stock_adjust''
    when ''bundle-delete'' then ''products.disable'' when ''purchase-create'' then ''purchases.create'' when ''transfer-save'' then ''transfers.manage'' when ''storefront-save'' then ''storefront.update'' end;
  if permission is null then raise exception ''Unsupported operation.''; end if;
  perform public.tenh_assert_effective_permission(p_business_id,permission); if p_operation in (''product-create'',''product-edit'',''bundle-create'',''bundle-edit'',''bundle-toggle'',''bundle-delete'') then perform public.tenh_barcode_enter_business_v3(p_business_id); end if;
  if p_branch_id is null or public.tenh_request_branch(p_business_id) is distinct from p_branch_id then raise exception ''Your operating branch changed.'' using errcode=''42501''; end if;
  perform public.tenh_assert_plan_branch(p_business_id,p_branch_id);
  if not exists(select 1 from business_locations where id=p_branch_id and business_id=p_business_id and is_active and not coalesce(plan_disable_pending,false)) then raise exception ''This branch is unavailable.''; end if;
  if p_request_id is null or jsonb_typeof(p_input) is distinct from ''object'' or octet_length(p_input::text)>65536 then raise exception ''Invalid save request.''; end if;
  insert into public.mobile_management_requests(business_id,request_id,user_id,branch_id,operation,input)
    values(p_business_id,p_request_id,auth.uid(),p_branch_id,p_operation,p_input) on conflict do nothing;
  select * into saved from public.mobile_management_requests where business_id=p_business_id and request_id=p_request_id for update;
  if saved.user_id<>auth.uid() or saved.branch_id<>p_branch_id or saved.operation<>p_operation or saved.input<>p_input then raise exception ''This request belongs to different details.''; end if;
  if saved.result is not null then return saved.result; end if;
  begin
    if nullif(p_input->>''imageUrl'','''') is not null then
      if p_input->>''imagePath'' is null
        or p_input->>''imagePath'' !~ (''^''||p_business_id::text||''/''||auth.uid()::text||''/''||p_request_id::text||''-[0-9a-f]{64}\.(jpg|png|webp)$'')
        or p_input->>''imageUrl'' !~ ''^https://[^/]+/storage/v1/object/public/product-images/''
        or right(p_input->>''imageUrl'',length(''/storage/v1/object/public/product-images/''||(p_input->>''imagePath''))) <> ''/storage/v1/object/public/product-images/''||(p_input->>''imagePath'')
        or not exists(select 1 from storage.objects where bucket_id=''product-images'' and name=p_input->>''imagePath'') then raise exception ''Upload a valid product image before saving.''; end if;
    end if;
    if p_operation=''bundle-create'' then
      item:=p_input||jsonb_build_object(''sellingPrice'',p_input->>''price'',''isPos'',coalesce((p_input->>''showPos'')::boolean,true),''isOnline'',coalesce((p_input->>''showOnline'')::boolean,true));
      if nullif(p_input->>''imageUrl'','''') is not null then
        target:=public.tenh_create_packed_bundle_with_image(p_business_id,p_branch_id,p_request_id,item);
      else target:=public.tenh_create_packed_bundle(p_business_id,p_branch_id,p_request_id,item); end if;
      update products set is_pos=coalesce((p_input->>''showPos'')::boolean,true),is_online=coalesce((p_input->>''showOnline'')::boolean,true),is_active=coalesce((p_input->>''showPos'')::boolean,true) or coalesce((p_input->>''showOnline'')::boolean,true) where business_id=p_business_id and id=target;
      update branch_product_details set is_pos=coalesce((p_input->>''showPos'')::boolean,true),is_online=coalesce((p_input->>''showOnline'')::boolean,true),is_active=coalesce((p_input->>''showPos'')::boolean,true) or coalesce((p_input->>''showOnline'')::boolean,true) where business_id=p_business_id and location_id=p_branch_id and id=target;
      v_result:=jsonb_build_object(''success'',true,''id'',target);
    elsif p_operation in (''bundle-edit'',''bundle-toggle'',''bundle-delete'') then
      if p_operation=''bundle-toggle'' and (p_input->>''action'') not in (''pos'',''online'') then raise exception ''Invalid display setting.''; end if;
      perform public.tenh_manage_bundle(p_business_id,p_branch_id,(p_input->>''id'')::uuid,case when p_operation=''bundle-edit'' then ''edit'' when p_operation=''bundle-delete'' then ''delete'' else p_input->>''action'' end,p_input,(p_input->>''expected'')::timestamptz);
      v_result:=jsonb_build_object(''success'',true);
    elsif p_operation=''bundle-pack'' then
      perform public.tenh_pack_bundle(p_business_id,p_branch_id,(p_input->>''id'')::uuid,(p_input->>''quantity'')::integer,p_request_id);
      v_result:=jsonb_build_object(''success'',true);
    elsif p_operation in (''product-create'',''product-edit'') then
      if length(btrim(coalesce(p_input->>''name'','''')))<2 or length(p_input->>''name'')>160 then raise exception ''Enter a product name (2–160 characters).''; end if;
      category:=nullif(p_input->>''categoryId'','''')::uuid;
      if category is not null and not exists(select 1 from categories where id=category and business_id=p_business_id and (branch_ids is null or p_branch_id=any(branch_ids))) then raise exception ''Choose a category in this branch.''; end if;
      if p_operation=''product-edit'' then
        target:=(p_input->>''id'')::uuid;
        select * into product from branch_product_details where business_id=p_business_id and location_id=p_branch_id and id=target and not branch_archived for update;
        if not found or product.product_type=''bundle'' then raise exception ''Product not found. Use the bundle editor for bundles.''; end if;
        if product.updated_at is distinct from (p_input->>''expected'')::timestamptz then raise exception ''Product changed. Reload before saving.''; end if;
      end if;
      if p_operation=''product-create'' then
        select product_mode into mode from businesses where id=p_business_id;
        kind:=coalesce(p_input->>''type'',''standard'');
        if coalesce(mode,'''') not in (''standard'',''variant'',''configurable'') or kind not in (''standard'',''variant'',''configurable'') or (mode=''variant'' and kind<>''variant'') or (mode=''configurable'' and kind<>''configurable'') or (mode=''standard'' and kind=''configurable'') then raise exception ''Choose the product type for this business.''; end if;
        if jsonb_typeof(p_input->''variants'') is distinct from ''array'' or jsonb_array_length(p_input->''variants'') not between 1 and 40 then raise exception ''Add 1–40 product rows.''; end if;
        if kind<>''variant'' and jsonb_array_length(p_input->''variants'')<>1 then raise exception ''Use one row for this product type.''; end if;
        if kind=''variant'' and (select count(distinct (lower(btrim(value->>''size'')),lower(btrim(value->>''color'')))) from jsonb_array_elements(p_input->''variants''))<>jsonb_array_length(p_input->''variants'') then raise exception ''Each size and colour combination must be unique.''; end if;
      end if;
      for item in select value from jsonb_array_elements(case when p_operation=''product-edit'' then jsonb_build_array(p_input) else p_input->''variants'' end) loop
        if length(btrim(coalesce(item->>''sku'','''')))<1 or length(item->>''sku'')>80 then raise exception ''Enter a SKU (up to 80 characters).''; end if;
        price:=(item->>''price'')::numeric; cost:=(item->>''cost'')::numeric; threshold:=(item->>''lowStock'')::integer;
        if price is null or cost is null or threshold is null or price not between 0 and 999999999 or cost not between 0 and 999999999 or threshold not between 0 and 999999 or price<>round(price,2) or cost<>round(cost,2) then raise exception ''Enter valid prices and low-stock quantity.''; end if;
        if (kind=''variant'' or product.product_type=''variant'') and (nullif(btrim(item->>''size''),'''') is null or nullif(btrim(item->>''color''),'''') is null) then raise exception ''Each variant needs size and colour.''; end if;
        if p_operation=''product-create'' then
          if kind=''variant'' and (nullif(btrim(item->>''size''),'''') is null or nullif(btrim(item->>''color''),'''') is null) then raise exception ''Each variant needs size and colour.''; end if;
          if exists(select 1 from products where business_id=p_business_id and (lower(sku)=lower(item->>''sku'') or barcode=case when item ? ''barcode'' and item->>''barcode''<>'''' then item->>''barcode'' else product.barcode end)) then raise exception ''SKU or barcode already exists.''; end if;
          row_id:=gen_random_uuid();
          insert into products(id,business_id,owner_id,category_id,name,sku,barcode,description,cost_price,selling_price,stock_quantity,low_stock_quantity,is_active,is_pos,is_online,product_type,variant_group_id,size,color,image_url)
          values(row_id,p_business_id,auth.uid(),category,btrim(p_input->>''name''),btrim(item->>''sku''),coalesce(nullif(item->>''barcode'',''''),item->>''sku''),p_input->>''description'',cost,price,0,threshold,true,coalesce((p_input->>''showPos'')::boolean,true),coalesce((p_input->>''showOnline'')::boolean,true),kind,case when kind=''variant'' then p_request_id else null end,nullif(item->>''size'',''''),nullif(item->>''color'',''''),nullif(p_input->>''imageUrl'',''''));
          insert into product_location_stock(business_id,location_id,product_id,quantity,low_stock_threshold) values(p_business_id,p_branch_id,row_id,0,threshold) on conflict(location_id,product_id) do nothing;
          ids:=ids||jsonb_build_array(row_id);
        else
          update branch_products set name=btrim(p_input->>''name''),sku=btrim(item->>''sku''),barcode=case when item ? ''barcode'' and item->>''barcode''<>'''' then item->>''barcode'' else product.barcode end,description=p_input->>''description'',category_id=category,cost_price=cost,selling_price=price,low_stock_quantity=threshold,size=nullif(item->>''size'',''''),color=nullif(item->>''color'',''''),is_pos=coalesce((p_input->>''showPos'')::boolean,true),is_online=coalesce((p_input->>''showOnline'')::boolean,true),is_active=coalesce((p_input->>''active'')::boolean,true),variant_image_url=case when p_input ? ''imageUrl'' then nullif(p_input->>''imageUrl'','''') else product.variant_image_url end,image_url=case when p_input ? ''imageUrl'' then nullif(p_input->>''imageUrl'','''') else product.image_url end where business_id=p_business_id and id=target;
          ids:=jsonb_build_array(target);
        end if;
      end loop;
      if p_operation=''product-create'' and kind=''configurable'' then
        if jsonb_typeof(p_input->''groups'') is distinct from ''array'' or jsonb_array_length(p_input->''groups'') not between 1 and 12 then raise exception ''Add 1–12 option groups.''; end if;
        for option_group in select value from jsonb_array_elements(p_input->''groups'') loop
          if nullif(btrim(option_group->>''name''),'''') is null or jsonb_typeof(option_group->''options'') is distinct from ''array'' or jsonb_array_length(option_group->''options'') not between 1 and 30 then raise exception ''Each option group needs a name and 1–30 options.''; end if;
          group_id:=gen_random_uuid();
          insert into product_option_groups(id,business_id,product_id,name,selection_type,is_required,min_selections,max_selections,sort_order)
            values(group_id,p_business_id,row_id,option_group->>''name'',''single'',coalesce((option_group->>''required'')::boolean,false),case when (option_group->>''required'')::boolean then 1 else 0 end,1,0);
          for option_item in select value from jsonb_array_elements(option_group->''options'') loop
            if nullif(btrim(option_item->>''name''),'''') is null or (option_item->>''price'')::numeric is null or (option_item->>''price'')::numeric not between 0 and 999999999 then raise exception ''Enter a name and valid option price.''; end if;
            insert into product_options(id,business_id,product_id,group_id,name,price_adjustment,is_default,is_active,sort_order) values(gen_random_uuid(),p_business_id,row_id,group_id,option_item->>''name'',(option_item->>''price'')::numeric,false,true,0);
          end loop;
        end loop;
      end if;
      v_result:=jsonb_build_object(''success'',true,''ids'',ids);
    elsif p_operation in (''purchase-create'',''transfer-save'') then
      if jsonb_typeof(p_input->''items'') is distinct from ''array'' or jsonb_array_length(p_input->''items'') not between 1 and 100 then raise exception ''Choose 1–100 items.''; end if;
      if (select count(distinct value->>''productId'') from jsonb_array_elements(p_input->''items''))<>jsonb_array_length(p_input->''items'') then raise exception ''Choose each product once.''; end if;
      target:=coalesce(nullif(p_input->>''id'','''')::uuid,p_request_id);
      if p_operation=''purchase-create'' then
        select * into supplier from suppliers where id=(p_input->>''supplierId'')::uuid and business_id=p_business_id and location_id=p_branch_id and is_active;
        if not found then raise exception ''Choose an active supplier in this branch.''; end if;
        insert into purchase_orders(id,business_id,location_id,supplier_id,supplier_name,po_number,status,order_date,expected_date,notes,created_by,subtotal,total)
          values(target,p_business_id,p_branch_id,supplier.id,supplier.name,''PO-''||upper(replace(target::text,''-'','''')),''draft'',current_date,nullif(p_input->>''expectedDate'','''')::date,p_input->>''note'',auth.uid(),0,0);
      else
        perform public.tenh_assert_plan_branch(p_business_id,(p_input->>''destinationId'')::uuid);
        if not exists(select 1 from business_locations where business_id=p_business_id and id=(p_input->>''destinationId'')::uuid and id<>p_branch_id and is_active and not coalesce(plan_disable_pending,false)) then raise exception ''Choose another active destination branch.''; end if;
        if nullif(p_input->>''id'','''') is not null then
          select * into transfer from stock_transfers where id=target and business_id=p_business_id and source_location_id=p_branch_id for update;
          if not found or transfer.status<>''draft'' or transfer.updated_at is distinct from (p_input->>''expected'')::timestamptz then raise exception ''Draft changed. Reload before editing.''; end if;
          update stock_transfers set destination_location_id=(p_input->>''destinationId'')::uuid,note=p_input->>''note'',updated_at=now() where id=target;
          delete from stock_transfer_items where transfer_id=target;
        else
          insert into stock_transfers(id,business_id,transfer_number,source_location_id,destination_location_id,status,note,created_by) values(target,p_business_id,''TR-''||upper(replace(target::text,''-'','''')),p_branch_id,(p_input->>''destinationId'')::uuid,''draft'',p_input->>''note'',auth.uid());
        end if;
      end if;
      for item in select value from jsonb_array_elements(p_input->''items'') loop
        v_quantity:=(item->>''quantity'')::integer;
        if v_quantity is null or v_quantity not between 1 and 999999 or v_quantity::numeric<>(item->>''quantity'')::numeric then raise exception ''Enter a positive whole quantity.''; end if;
        select * into product from branch_product_details where business_id=p_business_id and location_id=p_branch_id and id=(item->>''productId'')::uuid and is_active and not branch_archived;
        if not found or product.product_type=''bundle'' then raise exception ''Choose individual products in this branch. Use Pack for bundles.''; end if;
        if p_operation=''purchase-create'' then
          cost:=(item->>''cost'')::numeric;
          if cost is null or cost not between 0 and 999999999 or cost<>round(cost,2) then raise exception ''Enter a valid unit cost.''; end if;
          insert into purchase_order_items(business_id,purchase_order_id,product_id,product_name,sku,ordered_quantity,received_quantity,unit_cost) values(p_business_id,target,product.id,product.name,product.sku,v_quantity,0,cost);
          v_total:=v_total+round(cost,2)*v_quantity;
        else
          if not exists(select 1 from product_location_stock where business_id=p_business_id and location_id=p_branch_id and product_id=product.id and product_location_stock.quantity>=v_quantity) then raise exception ''Not enough stock in this branch.''; end if;
          insert into stock_transfer_items(business_id,transfer_id,product_id,quantity) values(p_business_id,target,product.id,v_quantity);
        end if;
      end loop;
      if p_operation=''purchase-create'' then update purchase_orders set subtotal=v_total,total=v_total where id=target; end if;
      v_result:=jsonb_build_object(''success'',true,''id'',target);
    elsif p_operation=''storefront-save'' then
      select * into store from business_storefronts where business_id=p_business_id for update;
      if not found then raise exception ''Set up the Online Store on the website first.''; end if;
      if store.updated_at is distinct from (p_input->>''expected'')::timestamptz then raise exception ''Store settings changed. Reload before saving.''; end if;
      if coalesce((p_input->>''acceptOrders'')::boolean,false) and (not (coalesce(store.allow_pickup,false) or coalesce(store.allow_delivery,false) or coalesce(store.allow_dine_in,false)) or not (coalesce(store.accept_cod,false) or coalesce(store.accept_khqr,false))) then raise exception ''Enable fulfillment and a payment method on the website first.''; end if;
      if length(btrim(coalesce(p_input->>''name'','''')))<2 or length(p_input->>''name'')>80 or length(p_input->>''description'')>500 or length(p_input->>''phone'')>40 or length(p_input->>''address'')>500 then raise exception ''Check store name and contact details.''; end if;
      update business_storefronts set display_name=btrim(p_input->>''name''),description=p_input->>''description'',phone=p_input->>''phone'',address=p_input->>''address'',is_published=coalesce((p_input->>''published'')::boolean,false),accept_online_orders=coalesce((p_input->>''acceptOrders'')::boolean,false),updated_at=now() where business_id=p_business_id;
      v_result:=jsonb_build_object(''success'',true);
    end if;
  exception when others then
    v_result:=jsonb_build_object(''success'',false,''rolledBack'',true,''message'',sqlerrm);
  end;
  update mobile_management_requests set result=v_result where business_id=p_business_id and request_id=p_request_id;
  return v_result;
end ');
 end if;
end $patch$;
-- tenh_pos_checkout: tests/fixtures/order-safety-callers-live-20261008.json
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.tenh_pos_checkout(uuid,jsonb)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.tenh_pos_checkout(uuid,jsonb)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: tenh_pos_checkout';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.tenh_pos_checkout(uuid,jsonb)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'b536b2d45809f896b0417a930522627a' then raise exception 'Reviewed writer body differs: tenh_pos_checkout';end if;
  source:=pg_get_functiondef('public.tenh_pos_checkout(uuid,jsonb)'::regprocedure);
  execute replace(source,body,'
declare
  v_role text; v_request uuid; v_hash text; v_existing public.orders%rowtype;
  v_store public.business_storefronts%rowtype; v_base text; v_rate numeric; v_enabled boolean;
  v_quote jsonb; v_display text; v_snapshot jsonb; v_input jsonb; v_receipt jsonb; v_order uuid;
  v_shipping jsonb; v_method text; v_name text; v_phone text; v_address text; v_phone_key text;
  v_amount numeric; v_foreign numeric; v_back numeric; v_parts_total numeric; v_foreign_total numeric; v_foreign_paid numeric;
  v_carrier text; v_carrier_other text; v_customer uuid; v_create boolean; v_created boolean:=false;
begin
  perform public.tenh_barcode_enter_business_v3(p_business_id); -- v3 entry precedes original locks; original permissions/revisions remain.

  v_role:=public.tenh_pos_guard(p_business_id);
  if p_input is null or jsonb_typeof(p_input)<>''object'' or pg_column_size(p_input)>200000 then raise exception ''Invalid sale data.''; end if;
  v_request:=(p_input->>''requestId'')::uuid;
  if v_request is null then raise exception ''A sale request ID is required.''; end if;
  v_hash:=md5(p_input::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_business_id::text||'':''||v_request::text,0));
  -- Return a committed retry BEFORE checking today''s rate or creating a customer.
  select * into v_existing from public.orders where business_id=p_business_id and pos_request_id=v_request;
  if found then
    if v_existing.pos_request_hash is distinct from v_hash
       or (v_existing.pos_checkout->>''createdBy'') is distinct from auth.uid()::text then
      raise exception ''This sale request was already used with different data. Check Orders before starting another sale.'';
    end if;
    return v_existing.pos_checkout->''receipt'';
  end if;

  select * into v_store from public.business_storefronts where business_id=p_business_id for share; v_store:=jsonb_populate_record(v_store,(select to_jsonb(bs) from public.branch_pos_settings bs where bs.business_id=p_business_id and bs.location_id=public.tenh_request_branch(p_business_id)));
  v_base:=coalesce(v_store.currency,''USD'');v_rate:=coalesce(v_store.pos_usd_khr_rate,4000);
  v_enabled:=coalesce(v_store.pos_dual_currency_enabled,true) and v_base in (''USD'',''KHR'');
  v_display:=v_base;
  if p_input ? ''currencyQuote'' then
    v_quote:=p_input->''currencyQuote'';
    if jsonb_typeof(v_quote) is distinct from ''object''
       or jsonb_typeof(v_quote->''enabled'') is distinct from ''boolean''
       or jsonb_typeof(v_quote->''usdKhrRate'') is distinct from ''number''
       or jsonb_typeof(v_quote->''displayCurrency'') is distinct from ''string''
       or jsonb_typeof(v_quote->''baseCurrency'') is distinct from ''string'' then
      raise exception ''Invalid currency quote. Refresh POS.'';
    end if;
    if (v_quote->>''baseCurrency'') is distinct from v_base
       or (v_quote->>''usdKhrRate'')::numeric is distinct from v_rate
       or (v_quote->>''enabled'')::boolean is distinct from v_enabled then
      raise exception ''POS currency settings changed. Refresh POS and review payment before confirming.'';
    end if;
    v_display:=v_quote->>''displayCurrency'';
    if v_display<>v_base and (not v_enabled or v_display not in (''USD'',''KHR'')) then
      raise exception ''This display currency is not enabled for the business.'';
    end if;
  elsif p_input->>''uiVersion''=''3'' then
    raise exception ''A current currency quote is required. Refresh POS.'';
  end if;
  v_snapshot:=jsonb_build_object(''baseCurrency'',v_base,''displayCurrency'',v_display,''usdKhrRate'',v_rate,''enabled'',v_enabled);
  if p_input->>''uiVersion''=''3'' and v_display<>v_base then
    -- Never mark a base-currency debt paid with a rounded-to-zero foreign amount.
    for v_amount in
      select (p_input->>''expectedTotal'')::numeric union all select (p_input->>''amountPaid'')::numeric
      union all select (t->>''amount'')::numeric from jsonb_array_elements(coalesce(p_input->''tenders'',''[]''::jsonb)) t
    loop
      if v_amount is null or v_amount::text in (''NaN'',''Infinity'',''-Infinity'') or v_amount<0 or v_amount>999999999 then raise exception ''Invalid payment amounts.''; end if;
      v_foreign:=round(case when v_base=''USD'' then v_amount*v_rate else v_amount/v_rate end,2);
      v_back:=round(case when v_base=''USD'' then v_foreign/v_rate else v_foreign*v_rate end,2);
      if v_back<>v_amount then raise exception ''This order/payment has a currency precision difference. Use the accounting currency to avoid rounding a payment.''; end if;
    end loop;
    v_amount:=(p_input->>''expectedTotal'')::numeric;
    v_foreign_total:=round(case when v_base=''USD'' then v_amount*v_rate else v_amount/v_rate end,2);
    v_amount:=(p_input->>''amountPaid'')::numeric;
    v_foreign_paid:=round(case when v_base=''USD'' then v_amount*v_rate else v_amount/v_rate end,2);
    if p_input->>''paymentMethod''=''split'' then
      select sum(round(case when v_base=''USD'' then (t->>''amount'')::numeric*v_rate else (t->>''amount'')::numeric/v_rate end,2))
        into v_parts_total from jsonb_array_elements(p_input->''tenders'') t;
      if v_parts_total is distinct from v_foreign_total then raise exception ''Split payments have a currency rounding difference. Adjust the parts or use the accounting currency.''; end if;
    elsif (p_input->>''amountPaid'')::numeric>(p_input->>''expectedTotal'')::numeric then
      v_amount:=(p_input->>''amountPaid'')::numeric-(p_input->>''expectedTotal'')::numeric;
      v_foreign:=round(case when v_base=''USD'' then v_amount*v_rate else v_amount/v_rate end,2);
      if v_foreign<>v_foreign_paid-v_foreign_total then raise exception ''Cash change has a currency rounding difference. Use exact cash or the accounting currency.''; end if;
    end if;
  end if;
  v_input:=p_input;
  v_shipping:=p_input->''shipping'';v_method:=v_shipping->>''method'';
  v_name:=btrim(coalesce(v_shipping->>''recipientName'',''''));v_phone:=btrim(coalesce(v_shipping->>''phone'',''''));
  v_address:=btrim(coalesce(v_shipping->>''address'',''''));v_carrier:=coalesce(v_shipping->>''carrier'','''');
  v_carrier_other:=btrim(coalesce(v_shipping->>''carrierOther'',''''));
  v_customer:=nullif(p_input->>''customerId'','''')::uuid;
  if p_input ? ''createCustomer'' and jsonb_typeof(p_input->''createCustomer'') is distinct from ''boolean'' then raise exception ''Invalid customer save option.''; end if;
  v_create:=coalesce((p_input->>''createCustomer'')::boolean,false);

  if p_input->>''uiVersion''=''3'' then
    if jsonb_typeof(v_shipping) is distinct from ''object'' or coalesce(v_method,'''') not in (''in_store'',''pickup'',''delivery'') then raise exception ''Choose an order type.''; end if;
    if v_method=''in_store'' and (v_name<>'''' or v_phone<>'''' or v_address<>'''') then raise exception ''In-store sales do not need recipient details. Select a customer separately.''; end if;
    if v_method in (''pickup'',''delivery'') and (v_name='''' or v_phone='''') then raise exception ''Pickup and delivery need a recipient name and phone number.''; end if;
    if v_method=''delivery'' and (v_address='''' or v_carrier not in (''jt'',''vet'',''grab'',''other'')) then raise exception ''Choose a shipping type and enter the delivery address.''; end if;
    if length(v_carrier_other)>80 then raise exception ''Carrier name must be 80 characters or fewer.''; end if;
  end if;
  if v_create then
    if v_role not in (''owner'',''cashier'') then raise exception ''You do not have permission to create customers.'' using errcode=''42501''; end if;
    if v_customer is not null or coalesce(v_method,'''') not in (''pickup'',''delivery'') or v_name='''' or length(v_name)>120
       or v_phone !~ ''^[+0-9() .-]{5,40}$'' or length(v_address)>500 then raise exception ''Enter a recipient name and valid phone before saving a new customer.''; end if;
    v_phone_key:=regexp_replace(v_phone,''[^0-9]'','''',''g'');
    if length(v_phone_key) not between 5 and 20 then raise exception ''Enter a valid customer phone number.''; end if;
    -- Serializes opt-in customer creation through this POS route. Do not link an
    -- account automatically just because its phone matches: require selection.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(''tenh-pos-customer:''||p_business_id::text||'':''||v_phone_key,0));
    if exists(select 1 from public.customers c where c.business_id=p_business_id and regexp_replace(coalesce(c.phone,''''),''[^0-9]'','''',''g'')=v_phone_key) then
      raise exception ''A customer with this phone already exists. Select that customer, or turn off Save as new customer.'';
    end if;
    insert into public.customers(owner_id,business_id,name,phone,address,note)
      values(auth.uid(),p_business_id,v_name,v_phone,case when v_method=''delivery'' then nullif(v_address,'''') else null end,null)
      returning id into v_customer;
    v_created:=true;
    v_input:=jsonb_set(v_input,''{customerId}'',to_jsonb(v_customer));
    insert into public.audit_logs(business_id,user_id,action,entity_type,entity_id,description,metadata)
      values(p_business_id,auth.uid(),''create'',''customer'',v_customer,''Created customer with explicit POS confirmation'',jsonb_build_object(''requestId'',v_request));
  end if;

  -- All amounts passed to the existing stock/payment engine remain in the store''s
  -- accounting currency. Currency display never modifies product prices or stock.
  v_receipt:=public.tenh_pos_checkout_before_currency(p_business_id,v_input);
  v_order:=(v_receipt->>''orderId'')::uuid;
  if v_order is null then raise exception ''Checkout did not return an order ID.''; end if;
  v_shipping:=v_receipt->''shipping'';
  if jsonb_typeof(v_shipping)=''object'' and v_shipping->>''method''=''delivery'' then
    v_shipping:=v_shipping||jsonb_build_object(''carrier'',v_carrier,''carrierOther'',case when v_carrier=''other'' then v_carrier_other else '''' end);
  end if;
  v_receipt:=v_receipt||jsonb_build_object(''currencyQuote'',v_snapshot,''customerId'',v_customer,''customerCreated'',v_created,''shipping'',v_shipping);
  update public.orders set pos_request_hash=v_hash,
    pos_checkout=pos_checkout||jsonb_build_object(''receipt'',v_receipt,''currencyQuote'',v_snapshot,''shipping'',v_shipping,''customerCreated'',v_created)
    where id=v_order and business_id=p_business_id;
  -- Any child validation failure rolls back customer creation too. Success stores
  -- the ORIGINAL client hash, so retrying cannot create a second customer or sale.
  return v_receipt;
end ');
 end if;
end $patch$;
-- tenh_pos_checkout_registered: tests/fixtures/order-safety-callers-live-20261008.json
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.tenh_pos_checkout_registered(uuid,jsonb)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.tenh_pos_checkout_registered(uuid,jsonb)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: tenh_pos_checkout_registered';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.tenh_pos_checkout_registered(uuid,jsonb)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'ca4c54ad9a74efa9ac9011e71747609f' then raise exception 'Reviewed writer body differs: tenh_pos_checkout_registered';end if;
  source:=pg_get_functiondef('public.tenh_pos_checkout_registered(uuid,jsonb)'::regprocedure);
  execute replace(source,body,'
DECLARE
  v_existing jsonb; v_result jsonb; v_shift public.cash_register_shifts%rowtype;
  v_order public.orders%rowtype; v_branch uuid; v_request_branch uuid; v_item jsonb;
BEGIN
  perform public.tenh_barcode_enter_business_v3(p_business_id); -- v3 entry precedes original locks; original permissions/revisions remain.

  PERFORM public.tenh_assert_effective_permission(p_business_id,''pos.access'');
  PERFORM public.tenh_assert_effective_permission(p_business_id,''orders.create'');
  IF p_input IS NULL OR jsonb_typeof(p_input) IS DISTINCT FROM ''object'' THEN RAISE EXCEPTION ''Invalid sale request.''; END IF;
  v_existing := public.tenh_pos_checkout_status(p_business_id,(p_input->>''requestId'')::uuid);
  IF v_existing IS NOT NULL AND v_existing->>''orderId'' IS NOT NULL THEN
    RETURN public.tenh_pos_checkout(p_business_id,p_input);
  END IF;
  v_branch := (p_input->>''branchId'')::uuid;
  v_request_branch := public.tenh_request_branch(p_business_id);
  IF v_request_branch IS NULL OR v_branch IS DISTINCT FROM v_request_branch THEN
    RAISE EXCEPTION ''The operating branch changed. Review this sale in its original branch.'' USING ERRCODE=''42501'';
  END IF;
  PERFORM public.tenh_lock_checkout_branch(p_business_id,v_branch);
  SELECT * INTO v_shift FROM public.cash_register_shifts
    WHERE business_id=p_business_id AND location_id=v_branch AND status=''open'' FOR UPDATE;
  IF v_shift.id IS NULL AND coalesce((select require_open_register from public.branch_pos_settings where business_id=p_business_id and location_id=v_branch),true) THEN RAISE EXCEPTION ''Open the register for this POS branch before taking payment.''; END IF;
  IF jsonb_typeof(p_input->''items'') IS DISTINCT FROM ''array'' OR jsonb_array_length(p_input->''items'') NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION ''Add 1–100 items to the sale.'';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_input->''items'') LOOP
    IF NOT EXISTS(
      SELECT 1 FROM public.products p JOIN public.product_location_stock s ON s.product_id=p.id AND s.business_id=p.business_id
      WHERE p.business_id=p_business_id AND p.id=(v_item->>''productId'')::uuid AND p.is_active AND s.location_id=v_branch
        AND (p.category_id IS NULL OR EXISTS(SELECT 1 FROM public.categories c WHERE c.id=p.category_id AND c.business_id=p_business_id
          AND (c.branch_ids IS NULL OR v_branch=ANY(c.branch_ids))))
    ) THEN RAISE EXCEPTION ''A cart product or category is not assigned to this branch. Refresh POS.''; END IF;
  END LOOP;
  v_result := public.tenh_pos_checkout(p_business_id,p_input);
  SELECT * INTO v_order FROM public.orders WHERE id=(v_result->>''orderId'')::uuid AND business_id=p_business_id FOR UPDATE;
  IF NOT FOUND OR v_order.location_id IS DISTINCT FROM v_branch THEN RAISE EXCEPTION ''POS order branch does not match the open register.''; END IF;
  IF v_order.register_shift_id IS NOT NULL AND v_order.register_shift_id<>v_shift.id THEN RAISE EXCEPTION ''POS order is linked to a different shift.''; END IF;
  UPDATE public.orders SET register_shift_id=v_shift.id WHERE id=v_order.id AND business_id=p_business_id;
  RETURN v_result;
END;
');
 end if;
end $patch$;
-- tenh_pos_checkout_before_currency: tests/fixtures/order-safety-live-20261008.json
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.tenh_pos_checkout_before_currency(uuid,jsonb)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.tenh_pos_checkout_before_currency(uuid,jsonb)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: tenh_pos_checkout_before_currency';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.tenh_pos_checkout_before_currency(uuid,jsonb)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'a722f295f4947a9d6ad7fd8d916512da' then raise exception 'Reviewed writer body differs: tenh_pos_checkout_before_currency';end if;
  source:=pg_get_functiondef('public.tenh_pos_checkout_before_currency(uuid,jsonb)'::regprocedure);
  execute replace(source,body,'
-- TENH_PROMOTIONS_V1
declare
  v_coupon_quote jsonb; v_promo_lines jsonb:=''[]''; v_discount_type text; v_discount_value numeric; v_derived_discount numeric; v_calculated_subtotal numeric:=0;
  v_shipping jsonb; v_shipping_method text; v_sync_count integer; v_before_global numeric;
  v_role text; v_request uuid; v_hash text; v_existing public.orders%rowtype;
  v_branch uuid; v_customer uuid; v_items jsonb; v_item jsonb; v_product public.products%rowtype;
  v_store public.business_storefronts%rowtype; v_hold public.tenh_pos_holds%rowtype;
  v_shift public.cash_register_shifts%rowtype; v_core jsonb; v_order uuid; v_receipt jsonb;
  v_method text; v_db_method public.orders.payment_method%type;
  v_discount numeric; v_delivery numeric; v_tax numeric; v_total numeric; v_subtotal numeric;
  v_redeem integer; v_reward numeric; v_rate numeric; v_unit numeric; v_paid numeric; v_change numeric:=0;
  v_remaining numeric:=0; v_cash numeric:=0; v_points integer:=0; v_balance integer;
  v_tenders jsonb:=''[]''::jsonb; v_tender jsonb; v_record record; v_qty integer; v_available integer;
  v_label text; v_customer_name text:=''Walk-in customer''; v_branch_name text; v_business_name text; v_note text;
  v_expected numeric; v_earn_id uuid; v_order_number text; v_currency text; v_created timestamptz;
begin
  perform public.tenh_barcode_enter_business_v3(p_business_id); -- v3 entry precedes original locks; original permissions/revisions remain.

  v_role:=public.tenh_pos_guard(p_business_id);
  if p_input is null or jsonb_typeof(p_input)<>''object'' or pg_column_size(p_input)>200000 then raise exception ''Invalid sale data.''; end if;
  v_request:=(p_input->>''requestId'')::uuid;
  if v_request is null then raise exception ''A sale request ID is required.''; end if;
  v_hash:=md5(p_input::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_business_id::text||'':''||v_request::text,0));
  select * into v_existing from public.orders where business_id=p_business_id and pos_request_id=v_request;
  if found then
    if v_existing.pos_request_hash is distinct from v_hash or (v_existing.pos_checkout->>''createdBy'') is distinct from auth.uid()::text then
      raise exception ''This sale request was already used with different data. Check Orders before starting another sale.''; end if;
    return v_existing.pos_checkout->''receipt'';
  end if;
  v_branch:=(p_input->>''branchId'')::uuid; v_customer:=nullif(p_input->>''customerId'','''')::uuid;
  v_items:=p_input->''items''; v_method:=p_input->>''paymentMethod'';
  if jsonb_typeof(v_items) is distinct from ''array'' or jsonb_array_length(v_items) not between 1 and 100 then raise exception ''Add 1–100 cart items.''; end if;
  if v_method is null or v_method not in (''cash'',''cod'',''deposit'',''bank_transfer'',''other'',''credit'',''split'') then raise exception ''Invalid payment method.''; end if;
  select name into v_branch_name from public.business_locations where id=v_branch and business_id=p_business_id and is_active=true for share;
  if not found then raise exception ''Branch not found or inactive.''; end if;
  select * into v_shift from public.cash_register_shifts where business_id=p_business_id and opened_by=auth.uid() and status=''open'' order by opened_at desc limit 1 for update;
  if found and v_shift.location_id<>v_branch then raise exception ''Use the branch of your open register, or close the shift first.''; end if;
  if nullif(p_input->>''holdId'','''') is not null then
    select * into v_hold from public.tenh_pos_holds where id=(p_input->>''holdId'')::uuid and business_id=p_business_id and created_by=auth.uid() for update;
    if not found or v_hold.order_id is not null then raise exception ''This hold is missing or already completed.''; end if;
    if v_hold.version is distinct from (p_input->>''holdVersion'')::integer then raise exception ''The held order changed. Refresh and resume it again.'' using errcode=''40001''; end if;
  end if;
  if v_customer is not null then
    select name,loyalty_points into v_customer_name,v_balance from public.customers where id=v_customer and business_id=p_business_id for update;
    if not found then raise exception ''Customer not found for this business.''; end if;
  end if;
  select * into v_store from public.business_storefronts where business_id=p_business_id for share; v_store:=jsonb_populate_record(v_store,(select to_jsonb(bs) from public.branch_pos_settings bs where bs.business_id=p_business_id and bs.location_id=public.tenh_request_branch(p_business_id)));
  v_rate:=coalesce(v_store.pos_tax_rate,0); v_currency:=coalesce(v_store.currency,''USD'');
  v_discount:=(p_input->>''discount'')::numeric; v_delivery:=(p_input->>''deliveryFee'')::numeric;
  v_paid:=(p_input->>''amountPaid'')::numeric; v_redeem:=(p_input->>''redeemPoints'')::integer;
  v_expected:=(p_input->>''expectedTotal'')::numeric; v_note:=coalesce(p_input->>''note'','''');
  if v_discount is null or v_delivery is null or v_paid is null or v_expected is null or v_redeem is null
    or v_discount::text in (''NaN'',''Infinity'',''-Infinity'') or v_delivery::text in (''NaN'',''Infinity'',''-Infinity'')
    or v_paid::text in (''NaN'',''Infinity'',''-Infinity'') or v_expected::text in (''NaN'',''Infinity'',''-Infinity'')
    or least(v_discount,v_delivery,v_paid,v_expected,v_redeem)<0 or greatest(v_discount,v_delivery,v_paid,v_expected)>999999999
    or v_redeem>1000000 or length(v_note)>1000 then raise exception ''Invalid sale amounts or note.''; end if;
  v_discount:=round(v_discount,2); v_delivery:=round(v_delivery,2); v_paid:=round(v_paid,2);
  if (p_input ? ''discountType'') <> (p_input ? ''discountValue'') then raise exception ''Discount type and value must be provided together.''; end if;
  v_discount_type:=coalesce(p_input->>''discountType'',''amount'');
  v_discount_value:=case when p_input ? ''discountValue'' then (p_input->>''discountValue'')::numeric else v_discount end;
  if v_discount_type not in (''amount'',''percent'') or v_discount_value is null or v_discount_value::text in (''NaN'',''Infinity'',''-Infinity'')
    or v_discount_value<0 or v_discount_value<>round(v_discount_value,2)
    or v_discount_value > (case when v_discount_type=''percent'' then 100 else 999999999 end) then raise exception ''Enter a valid percentage or fixed discount.''; end if;
  -- Legacy interrupted requests without shipping metadata remain retryable.
  if p_input ? ''shipping'' then
    v_shipping:=p_input->''shipping''; v_shipping_method:=v_shipping->>''method'';
    if jsonb_typeof(v_shipping) is distinct from ''object'' or coalesce(v_shipping_method,'''') not in (''in_store'',''pickup'',''delivery'')
      or jsonb_typeof(v_shipping->''recipientName'') is distinct from ''string'' or jsonb_typeof(v_shipping->''phone'') is distinct from ''string''
      or jsonb_typeof(v_shipping->''address'') is distinct from ''string'' or length(v_shipping->>''recipientName'')>120
      or length(v_shipping->>''phone'')>40 or length(v_shipping->>''address'')>500 then raise exception ''Enter valid shipping details.''; end if;
    v_shipping:=jsonb_build_object(''method'',v_shipping_method,''recipientName'',btrim(v_shipping->>''recipientName''),''phone'',btrim(v_shipping->>''phone''),''address'',btrim(v_shipping->>''address''));
    if v_shipping_method=''delivery'' and (v_shipping->>''recipientName''='''' or v_shipping->>''phone''='''' or v_shipping->>''address''='''') then
      raise exception ''Delivery needs a recipient name, phone number and address.''; end if;
    if v_shipping_method<>''delivery'' and v_delivery<>0 then raise exception ''Delivery fees only apply to Delivery.''; end if;
  end if;
  if v_rate is distinct from (p_input->>''expectedTaxRate'')::numeric then raise exception ''The tax rate changed. Refresh POS and review the total.''; end if;
  if v_redeem>0 and (v_customer is null or not coalesce(v_store.loyalty_enabled,false) or coalesce(v_store.pos_point_value,0)<=0 or v_balance<v_redeem) then
    raise exception ''The customer does not have enough redeemable points, or redemption is not configured.''; end if;
  v_reward:=round(v_redeem*coalesce(v_store.pos_point_value,0),2);

  -- Consistent global-product lock order avoids cart-order-dependent locking.
  perform p.id from public.products p where p.business_id=p_business_id
    and p.id in (select (j->>''productId'')::uuid from jsonb_array_elements(v_items) j) order by p.id for update;
  -- Freeze selected option prices while the trusted core validates option groups.
  perform o.id from public.product_options o where o.business_id=p_business_id
    and o.product_id in (select (j->>''productId'')::uuid from jsonb_array_elements(v_items) j) order by o.id for share;
  perform g.id from public.product_option_groups g where g.business_id=p_business_id
    and g.product_id in (select (j->>''productId'')::uuid from jsonb_array_elements(v_items) j) order by g.id for share;
  for v_item in select value from jsonb_array_elements(v_items) loop
    if (v_item->>''quantity'')::numeric<>trunc((v_item->>''quantity'')::numeric) then raise exception ''Quantities must be whole numbers.''; end if;
    v_qty:=(v_item->>''quantity'')::integer;
    if v_qty is null or v_qty not between 1 and 999 or jsonb_typeof(v_item->''optionIds'') is distinct from ''array'' or jsonb_array_length(v_item->''optionIds'')>50 then raise exception ''Invalid quantity or options.''; end if;
    select * into v_product from public.products where id=(v_item->>''productId'')::uuid and business_id=p_business_id and is_active=true;
    if not found then raise exception ''A cart product is no longer available.''; end if; v_product:=public.tenh_pos_priced_product(v_product);
    if (select count(*) from jsonb_array_elements_text(v_item->''optionIds''))<>(select count(distinct x) from jsonb_array_elements_text(v_item->''optionIds'') x) then raise exception ''Duplicate option IDs are not allowed.''; end if;
    select round(v_product.selling_price+coalesce(sum(o.price_adjustment),0),2) into v_unit from public.product_options o
      where o.business_id=p_business_id and o.product_id=v_product.id and o.is_active=true and o.id in (select x::uuid from jsonb_array_elements_text(v_item->''optionIds'') x);
    if v_unit is null or v_unit<0 or v_unit::text in (''NaN'',''Infinity'',''-Infinity'') or v_unit is distinct from (v_item->>''expectedUnitPrice'')::numeric then
      raise exception ''A product price changed. Refresh POS, update cart prices, and review the total.''; end if;
    v_calculated_subtotal:=v_calculated_subtotal+v_unit*v_qty; v_promo_lines:=v_promo_lines||jsonb_build_array(jsonb_build_object(''productId'',v_product.id,''subtotal'',v_unit*v_qty));
  end loop;
  v_derived_discount:=case when v_discount_type=''percent'' then round(v_calculated_subtotal*v_discount_value/100,2) else v_discount_value end;
  if nullif(btrim(p_input->>''couponCode''),'''') is not null then
    v_coupon_quote:=public.tenh_coupon_quote(p_business_id,v_branch,''pos'',p_input->>''couponCode'',v_promo_lines,v_customer);
    v_derived_discount:=(v_coupon_quote->>''discount'')::numeric;
  end if;
  if v_derived_discount<>v_discount then raise exception ''The discount or prices changed. Review the order again.''; end if;
  v_discount:=v_derived_discount;
  if v_discount+v_reward>v_calculated_subtotal then raise exception ''Discount and points cannot exceed the merchandise subtotal.''; end if;
  for v_record in select (j->>''productId'')::uuid id,sum((j->>''quantity'')::integer)::integer qty from jsonb_array_elements(v_items) j group by 1 order by 1 loop
    -- For a genuinely single-location business, the existing global total is
    -- authoritative. Legacy product creation/adjustment writes that total but may
    -- leave a ZERO (not just missing) branch mirror. Synchronize while the product
    -- is locked. Never increase global stock; count inactive locations as well.
    if (select count(*) from public.business_locations where business_id=p_business_id)=1 then
      select stock_quantity into v_before_global from public.products where id=v_record.id and business_id=p_business_id;
      insert into public.product_location_stock as existing(business_id,location_id,product_id,quantity,low_stock_threshold)
        select p_business_id,v_branch,p.id,greatest(coalesce(p.stock_quantity,0),0),coalesce(p.low_stock_quantity,0)
        from public.products p where p.id=v_record.id and p.business_id=p_business_id
        on conflict(location_id,product_id) do update set quantity=excluded.quantity
        where existing.business_id=p_business_id and existing.quantity is distinct from excluded.quantity;
      get diagnostics v_sync_count = row_count;
      if (select stock_quantity from public.products where id=v_record.id and business_id=p_business_id) is distinct from v_before_global then
        raise exception ''An inventory trigger changed total stock while synchronizing the branch. No sale was saved. Review Inventory configuration.'';
      end if;
      if v_sync_count>0 then
        insert into public.audit_logs(business_id,user_id,action,entity_type,entity_id,description,metadata)
        values(p_business_id,auth.uid(),''update'',''product'',v_record.id,''Synchronized single-location POS stock mirror'',jsonb_build_object(''locationId'',v_branch,''operation'',''sync_branch_mirror'',''globalStockUnchanged'',true));
      end if;
    end if;
    select quantity into v_available from public.product_location_stock where business_id=p_business_id and location_id=v_branch and product_id=v_record.id for update;
    if coalesce(v_available,0)<v_record.qty then raise exception ''Insufficient stock at the selected branch. Refresh POS or transfer stock first.''; end if;
  end loop;

  -- The existing core remains the authority for product availability, options, prices,
  -- order-item snapshots and global stock deduction. Nothing commits until this RPC ends.
  -- Attach the customer AFTER final totals, to avoid issuing loyalty on a provisional total.
  select jsonb_agg(j order by j->>''productId'',j->''optionIds'') into v_items from jsonb_array_elements(v_items) j;
  perform pg_catalog.set_config(''search_path'',''pg_catalog, public, pg_temp'',true);
  v_core:=public.checkout_order_with_options(p_business_id,v_items,''cod'',0,null,v_discount+v_reward,v_delivery);
  perform pg_catalog.set_config(''search_path'','''',true);
  v_order:=(v_core->>''order_id'')::uuid;
  if v_order is null then raise exception ''Checkout did not return an order ID.''; end if;
  select subtotal,order_number,created_at into v_subtotal,v_order_number,v_created from public.orders where id=v_order and business_id=p_business_id for update;
  if v_discount+v_reward>v_subtotal then raise exception ''Discount and redeemed points cannot exceed the merchandise subtotal.''; end if;
  v_tax:=round((v_subtotal-v_discount-v_reward)*v_rate/100,2);
  v_total:=round(v_subtotal-v_discount-v_reward+v_tax+v_delivery,2);
  if v_total<>round(v_expected,2) then raise exception ''The order total changed. Refresh POS and review the cart before paying.''; end if;

  if v_method=''cash'' then
    if v_paid<v_total then raise exception ''Cash received is less than the total.''; end if;
    v_db_method:=''cod''; v_change:=v_paid-v_total; v_cash:=v_total;
    v_tenders:=case when v_paid>0 then jsonb_build_array(jsonb_build_object(''method'',''cash'',''amount'',v_paid,''reference'','''')) else ''[]''::jsonb end;
  elsif v_method=''cod'' then
    if v_paid>v_total then raise exception ''COD received amount cannot exceed the total.''; end if;
    v_db_method:=''cod''; v_remaining:=v_total-v_paid; v_cash:=v_paid;
    v_tenders:=case when v_paid>0 then jsonb_build_array(jsonb_build_object(''method'',''cash'',''amount'',v_paid,''reference'',''COD amount received'')) else ''[]''::jsonb end;
  elsif v_method=''deposit'' then
    if v_paid<=0 or v_paid>=v_total then raise exception ''A cash deposit must be greater than zero and less than the total.''; end if;
    v_db_method:=''deposit''; v_remaining:=v_total-v_paid; v_cash:=v_paid;
    v_tenders:=jsonb_build_array(jsonb_build_object(''method'',''cash'',''amount'',v_paid,''reference'',''Cash deposit''));
  elsif v_method=''credit'' then
    if v_customer is null or v_total<=0 then raise exception ''Customer credit requires a customer and a positive total.''; end if;
    v_db_method:=''credit''; v_paid:=0; v_remaining:=v_total;
  elsif v_method=''split'' then
    v_tenders:=p_input->''tenders'';
    if jsonb_typeof(v_tenders) is distinct from ''array'' or jsonb_array_length(v_tenders) not between 2 and 5 then raise exception ''Enter 2–5 split payments.''; end if;
    v_paid:=0;
    for v_tender in select value from jsonb_array_elements(v_tenders) loop
      v_unit:=(v_tender->>''amount'')::numeric;
      if coalesce(v_tender->>''method'','''') not in (''cash'',''bank_transfer'',''other'') or v_unit is null or v_unit::text in (''NaN'',''Infinity'',''-Infinity'') or v_unit<=0 or v_unit>999999999 or v_unit<>round(v_unit,2) or length(coalesce(v_tender->>''reference'',''''))>120 then raise exception ''Invalid split payment.''; end if;
      v_paid:=v_paid+v_unit;
      if v_tender->>''method''=''cash'' then v_cash:=v_cash+v_unit; end if;
    end loop;
    if v_paid<>v_total or v_paid is distinct from (p_input->>''amountPaid'')::numeric then raise exception ''Split payments must add up exactly to the order total.''; end if;
    if coalesce((p_input->>''paymentsConfirmed'')::boolean,false)=false then raise exception ''Confirm all split payments were received.''; end if;
    v_db_method:=''other'';
  else
    if v_paid<>v_total or coalesce((p_input->>''paymentsConfirmed'')::boolean,false)=false then raise exception ''Confirm the full payment was received before recording it.''; end if;
    if v_method=''bank_transfer'' then v_db_method:=''bank_transfer''; else v_db_method:=''other''; end if;
    v_tenders:=case when v_paid>0 then jsonb_build_array(jsonb_build_object(''method'',v_method,''amount'',v_paid,''reference'',''Manually confirmed by cashier'')) else ''[]''::jsonb end;
  end if;
  if v_redeem>0 and v_remaining>0 then raise exception ''Points can only be redeemed on fully paid sales.''; end if;
  -- TENH_DELIVERY_NEW_V1: set fulfillment status inside this checkout transaction.
  update public.orders set status=case when v_shipping_method=''delivery'' then ''new'' else status end,
    customer_id=v_customer,total=v_total,payment_method=v_db_method,
    payment_status=case when v_remaining=0 then ''paid'' else ''unpaid'' end,
    amount_paid=v_paid,change_amount=v_change,remaining_balance=v_remaining,customer_note=nullif(btrim(v_note),''''),
    pos_request_id=v_request,pos_request_hash=v_hash,updated_at=clock_timestamp()
    where id=v_order and business_id=p_business_id;
  if v_shipping is not null then
    update public.orders set fulfillment_type=case when v_shipping_method=''delivery'' then ''delivery'' else ''pickup'' end,
      guest_name=nullif(v_shipping->>''recipientName'',''''),guest_phone=nullif(v_shipping->>''phone'',''''),
      guest_address=case when v_shipping_method=''delivery'' then nullif(v_shipping->>''address'','''') else null end
    where id=v_order and business_id=p_business_id;
    if v_customer is null then v_customer_name:=coalesce(nullif(v_shipping->>''recipientName'',''''),''Walk-in customer''); end if;
  end if;
  perform public.assign_pos_order_to_location(p_business_id,v_order,v_branch,v_shift.id);
  if v_method=''credit'' then
    perform public.post_customer_credit(p_business_id,v_customer,''charge'',v_total,''POS credit sale'',v_order::text,v_order);
  end if;
  if v_redeem>0 then
    update public.customers set loyalty_points=loyalty_points-v_redeem,updated_at=clock_timestamp() where id=v_customer and business_id=p_business_id;
    insert into public.tenh_pos_points_used(order_id,business_id,customer_id,points) values(v_order,p_business_id,v_customer,v_redeem);
    insert into public.customer_loyalty_transactions(business_id,customer_id,transaction_type,points,note)
      values(p_business_id,v_customer,''adjustment'',-v_redeem,''Points redeemed on POS order ''||v_order_number);
  end if;
  -- Same completed-order loyalty policy as the existing Phase 6 engine; tax and
  -- delivery are excluded from points. A status reversal still uses its existing trigger.
  if coalesce(v_shipping_method,''in_store'')<>''delivery'' and v_customer is not null and coalesce(v_store.loyalty_enabled,false) and v_total>=coalesce(v_store.loyalty_minimum_order,0) and coalesce(v_store.loyalty_spend_per_point,0)>0 then
    v_points:=floor(greatest(v_subtotal-v_discount-v_reward,0)/v_store.loyalty_spend_per_point)::integer;
    if v_points>0 then
      insert into public.customer_loyalty_transactions(business_id,customer_id,order_id,transaction_type,points,note)
      values(p_business_id,v_customer,v_order,''earn'',v_points,''Points earned from completed order ''||v_order_number)
      on conflict do nothing returning id into v_earn_id;
      if v_earn_id is not null then
        update public.customers set loyalty_points=loyalty_points+v_points,lifetime_loyalty_points=lifetime_loyalty_points+v_points,updated_at=clock_timestamp() where id=v_customer and business_id=p_business_id;
        update public.orders set loyalty_points_earned=v_points where id=v_order;
      end if;
    end if;
  end if;
  select name into v_business_name from public.businesses where id=p_business_id;
  v_receipt:=jsonb_build_object(''orderId'',v_order,''orderNumber'',v_order_number,''createdAt'',v_created,
    ''businessName'',v_business_name,''customerName'',v_customer_name,''branchName'',v_branch_name,''currency'',v_currency,
    ''shipping'',v_shipping,''discountType'',v_discount_type,''discountValue'',v_discount_value,
    ''subtotal'',v_subtotal,''manualDiscount'',v_discount,''discount'',v_discount+v_reward,''deliveryFee'',v_delivery,
    ''taxRate'',v_rate,''taxAmount'',v_tax,''total'',v_total,''amountPaid'',v_paid,''change'',v_change,''remaining'',v_remaining,
    ''pointsRedeemed'',v_redeem,''pointsEarned'',v_points,''note'',v_note,''tenders'',v_tenders,
    ''lines'',coalesce((select jsonb_agg(jsonb_build_object(''name'',i.product_name,''variant'',i.variant_label,''quantity'',i.quantity,''unitPrice'',i.unit_price,''subtotal'',i.subtotal,''options'',i.selected_options) order by i.id)
      from public.order_items i where i.order_id=v_order),''[]''::jsonb));
  v_receipt:=v_receipt||jsonb_build_object(''initialStatus'',case when v_shipping_method=''delivery'' then ''new'' else ''completed'' end);
  update public.orders set pos_checkout=jsonb_build_object(''version'',2,''shipping'',v_shipping,''discountType'',v_discount_type,''discountValue'',v_discount_value,''createdBy'',auth.uid(),''method'',v_method,''taxRate'',v_rate,''taxAmount'',v_tax,''cashReceived'',v_cash,''tenders'',v_tenders,''receipt'',v_receipt)
    where id=v_order and business_id=p_business_id;
  if v_hold.id is not null then update public.tenh_pos_holds set order_id=v_order,version=version+1,updated_at=clock_timestamp() where id=v_hold.id; end if;
  insert into public.audit_logs(business_id,user_id,action,entity_type,entity_id,description,metadata)
    values(p_business_id,auth.uid(),''create'',''order'',v_order,''Created POS order ''||v_order_number,jsonb_build_object(''branchId'',v_branch,''paymentMethod'',v_method,''amountPaid'',v_paid,''total'',v_total,''requestId'',v_request));
  if v_coupon_quote is not null then
    insert into public.coupon_redemptions(business_id,coupon_id,order_id,customer_id,discount_amount)
    values(p_business_id,(v_coupon_quote->>''id'')::uuid,v_order,v_customer,v_discount);
    update public.business_coupons set usage_count=usage_count+1,updated_at=now() where id=(v_coupon_quote->>''id'')::uuid;
    v_receipt:=v_receipt||jsonb_build_object(''couponCode'',v_coupon_quote->>''code'');
    update public.orders set coupon_id=(v_coupon_quote->>''id'')::uuid,coupon_code=v_coupon_quote->>''code'',coupon_discount=v_discount,
      pos_checkout=jsonb_set(pos_checkout,''{receipt}'',v_receipt) where id=v_order;
  end if;
  return v_receipt;
end ');
 end if;
end $patch$;
-- checkout_order_with_options: tests/fixtures/order-safety-dependencies-live-20261008.json
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.checkout_order_with_options(uuid,jsonb,text,numeric,uuid,numeric,numeric)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.checkout_order_with_options(uuid,jsonb,text,numeric,uuid,numeric,numeric)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: checkout_order_with_options';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.checkout_order_with_options(uuid,jsonb,text,numeric,uuid,numeric,numeric)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'a0223f048418c754e8135fcbc2c93481' then raise exception 'Reviewed writer body differs: checkout_order_with_options';end if;
  source:=pg_get_functiondef('public.checkout_order_with_options(uuid,jsonb,text,numeric,uuid,numeric,numeric)'::regprocedure);
  execute replace(source,body,'
-- TENH_PROMOTIONS_V1
declare
  v_user_id uuid := auth.uid();
  v_business public.businesses%rowtype;
  v_member public.business_members%rowtype;
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_quantity integer;
  v_option_ids uuid[];
  v_selected_options jsonb;
  v_option_total numeric(12,2);
  v_unit_price numeric(12,2);
  v_line_subtotal numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := greatest(0, coalesce(p_discount, 0));
  v_delivery_fee numeric(12,2) := greatest(0, coalesce(p_delivery_fee, 0));
  v_total numeric(12,2);
  v_amount_paid numeric(12,2) := coalesce(p_amount_paid, 0);
  v_change numeric(12,2) := 0;
  v_remaining numeric(12,2) := 0;
  v_payment_status text;
  v_payment_method text := lower(coalesce(nullif(btrim(p_payment_method), ''''), ''cod''));
  v_group record;
  v_group_selection_count integer;
  v_invalid_option_count integer;
  v_variant_label text;
  v_computed_items jsonb := ''[]''::jsonb;
  v_computed jsonb;
  v_requested_by_product jsonb := ''{}''::jsonb;
  v_requested_quantity integer;
  v_order_id uuid;
  v_order_number text;
begin
  perform public.tenh_barcode_enter_business_v3(p_business_id); -- v3 entry precedes original locks; original permissions/revisions remain.

  if v_user_id is null then
    raise exception ''Your login session has expired.'';
  end if;

  select * into v_business
  from public.businesses
  where id = p_business_id
  limit 1;

  if not found or not v_business.is_active then
    raise exception ''Business not found or inactive.'';
  end if;

  select * into v_member
  from public.business_members
  where business_id = v_business.id
    and user_id = v_user_id
    and is_active = true
  limit 1;

  if not found then
    raise exception ''You no longer have access to this business.'';
  end if;

  if v_business.subscription_expires_at is not null
     and v_business.subscription_expires_at <= now() then
    raise exception ''This business subscription has expired.'';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> ''array''
     or jsonb_array_length(p_items) = 0 then
    raise exception ''Your cart is empty.'';
  end if;

  if jsonb_array_length(p_items) > 100 then
    raise exception ''Too many items in one order.'';
  end if;

  if v_payment_method not in (''cod'', ''deposit'', ''bank_transfer'', ''other'') then
    raise exception ''Invalid payment method.'';
  end if;

  if v_amount_paid < 0 then
    raise exception ''Invalid payment amount.'';
  end if;

  if p_discount is null or p_delivery_fee is null or p_discount < 0 or p_delivery_fee < 0 then
    raise exception ''Discount and delivery fee cannot be negative.'';
  end if;

  if p_customer_id is not null and not exists (
    select 1
    from public.customers
    where id = p_customer_id
      and business_id = v_business.id
  ) then
    raise exception ''Customer not found for this business.'';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    begin
      v_product_id := (v_item ->> ''productId'')::uuid;
      v_quantity := (v_item ->> ''quantity'')::integer;
    exception when others then
      raise exception ''The cart contains invalid product data.'';
    end;

    if v_quantity is null or v_quantity < 1 or v_quantity > 999 then
      raise exception ''Invalid product quantity.'';
    end if;

    select * into v_product
    from public.products
    where id = v_product_id
      and business_id = v_business.id
      and is_active = true
    for update;

    if not found then
      raise exception ''A product in your cart is no longer available.'';
    end if;

    v_product:=public.tenh_pos_priced_product(v_product); v_requested_quantity :=
      coalesce((v_requested_by_product ->> v_product.id::text)::integer, 0)
      + v_quantity;

    if coalesce(v_product.stock_quantity, 0) < v_requested_quantity then
      raise exception ''Not enough stock for %.'', v_product.name;
    end if;

    v_requested_by_product := jsonb_set(
      v_requested_by_product,
      array[v_product.id::text],
      to_jsonb(v_requested_quantity),
      true
    );

    begin
      select coalesce(array_agg(distinct value::uuid), array[]::uuid[])
      into v_option_ids
      from jsonb_array_elements_text(
        coalesce(v_item -> ''optionIds'', ''[]''::jsonb)
      );
    exception when others then
      raise exception ''The cart contains invalid product option data.'';
    end;

    select count(*) into v_invalid_option_count
    from unnest(v_option_ids) option_id
    left join public.product_options po
      on po.id = option_id
      and po.business_id = v_business.id
      and po.product_id = v_product.id
      and po.is_active = true
    where po.id is null;

    if v_invalid_option_count > 0 then
      raise exception ''A selected product option is no longer available.'';
    end if;

    if coalesce(v_product.product_type, ''standard'') = ''configurable'' then
      for v_group in
        select *
        from public.product_option_groups
        where business_id = v_business.id
          and product_id = v_product.id
        order by sort_order, created_at
      loop
        select count(*) into v_group_selection_count
        from public.product_options po
        where po.group_id = v_group.id
          and po.id = any(v_option_ids)
          and po.is_active = true;

        if v_group.is_required and v_group_selection_count = 0 then
          raise exception ''Please choose an option for %.'', v_group.name;
        end if;

        if v_group_selection_count < v_group.min_selections
           or v_group_selection_count > v_group.max_selections then
          raise exception ''Invalid selection count for %.'', v_group.name;
        end if;
      end loop;
    elsif cardinality(v_option_ids) > 0 then
      raise exception ''This product does not support configurable options.'';
    end if;

    select
      coalesce(sum(po.price_adjustment), 0),
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            ''id'', po.id,
            ''name'', po.name,
            ''priceAdjustment'', po.price_adjustment,
            ''groupId'', po.group_id,
            ''groupName'', pog.name
          ) order by pog.sort_order, po.sort_order, po.created_at
        ) filter (where po.id is not null),
        ''[]''::jsonb
      )
    into v_option_total, v_selected_options
    from public.product_options po
    left join public.product_option_groups pog
      on pog.id = po.group_id
    where po.id = any(v_option_ids)
      and po.business_id = v_business.id
      and po.product_id = v_product.id
      and po.is_active = true;

    v_unit_price := round(
      (coalesce(v_product.selling_price, 0) + coalesce(v_option_total, 0))::numeric,
      2
    );
    v_line_subtotal := round((v_unit_price * v_quantity)::numeric, 2);
    v_subtotal := v_subtotal + v_line_subtotal;

    v_variant_label := nullif(
      concat_ws(
        '' / '',
        nullif(btrim(coalesce(v_product.color, '''')), ''''),
        nullif(btrim(coalesce(v_product.size, '''')), '''')
      ),
      ''''
    );

    v_computed_items := v_computed_items || jsonb_build_array(
      jsonb_build_object(
        ''productId'', v_product.id,
        ''productName'', v_product.name,
        ''quantity'', v_quantity,
        ''unitPrice'', v_unit_price,
        ''subtotal'', v_line_subtotal,
        ''variantLabel'', v_variant_label,
        ''selectedOptions'', v_selected_options
      )
    );
  end loop;

  v_subtotal := round(v_subtotal::numeric, 2);
  v_total := round((v_subtotal + v_delivery_fee - v_discount)::numeric, 2);

  if v_discount > v_subtotal + v_delivery_fee then
    raise exception ''Discount cannot be greater than the order amount.'';
  end if;

  if v_total < 0 then
    raise exception ''Invalid order total.'';
  end if;

  if v_payment_method = ''bank_transfer'' then
    v_amount_paid := v_total;
    v_remaining := 0;
    v_change := 0;
    v_payment_status := ''paid'';
  elsif v_payment_method = ''deposit'' then
    if v_amount_paid <= 0 or v_amount_paid >= v_total then
      raise exception ''Deposit must be greater than zero and less than the total.'';
    end if;
    v_remaining := round((v_total - v_amount_paid)::numeric, 2);
    v_change := 0;
    v_payment_status := ''unpaid'';
  elsif v_payment_method = ''cod'' then
    if v_amount_paid > v_total then
      raise exception ''COD amount paid cannot be greater than the total.'';
    end if;
    v_remaining := round(greatest(0, v_total - v_amount_paid)::numeric, 2);
    v_change := 0;
    v_payment_status := case when v_remaining <= 0 then ''paid'' else ''unpaid'' end;
  else
    if v_amount_paid < v_total then
      raise exception ''Amount paid must be equal to or greater than the total.'';
    end if;
    v_remaining := 0;
    v_change := round(greatest(0, v_amount_paid - v_total)::numeric, 2);
    v_payment_status := ''paid'';
  end if;

  v_order_number := ''POS-'' || upper(substr(replace(gen_random_uuid()::text, ''-'', ''''), 1, 10));

  insert into public.orders (
    owner_id,
    business_id,
    customer_id,
    order_number,
    subtotal,
    discount,
    delivery_fee,
    total,
    payment_method,
    payment_status,
    amount_paid,
    change_amount,
    remaining_balance,
    status,
    order_source,
    created_at,
    updated_at
  ) values (
    v_business.owner_id,
    v_business.id,
    p_customer_id,
    v_order_number,
    v_subtotal,
    v_discount,
    v_delivery_fee,
    v_total,
    v_payment_method,
    v_payment_status,
    v_amount_paid,
    v_change,
    v_remaining,
    ''completed'',
    ''pos'',
    now(),
    now()
  )
  returning id into v_order_id;

  for v_computed in
    select value from jsonb_array_elements(v_computed_items)
  loop
    insert into public.order_items (
      order_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      subtotal,
      variant_label,
      selected_options
    ) values (
      v_order_id,
      (v_computed ->> ''productId'')::uuid,
      v_computed ->> ''productName'',
      (v_computed ->> ''quantity'')::integer,
      (v_computed ->> ''unitPrice'')::numeric,
      (v_computed ->> ''subtotal'')::numeric,
      nullif(v_computed ->> ''variantLabel'', ''''),
      coalesce(v_computed -> ''selectedOptions'', ''[]''::jsonb)
    );

    update public.products
    set stock_quantity = stock_quantity - (v_computed ->> ''quantity'')::integer,
        updated_at = now()
    where id = (v_computed ->> ''productId'')::uuid
      and business_id = v_business.id;
  end loop;

  return jsonb_build_object(
    ''order_id'', v_order_id,
    ''id'', v_order_id,
    ''order_number'', v_order_number,
    ''subtotal'', v_subtotal,
    ''discount'', v_discount,
    ''delivery_fee'', v_delivery_fee,
    ''total'', v_total,
    ''amount_paid'', v_amount_paid,
    ''remaining_balance'', v_remaining,
    ''change_amount'', v_change,
    ''payment_status'', v_payment_status
  );
end;
');
 end if;
end $patch$;
-- tenh_pos_allocate_stock: tests/fixtures/order-safety-live-20261008.json
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.tenh_pos_allocate_stock(uuid,uuid,jsonb)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.tenh_pos_allocate_stock(uuid,uuid,jsonb)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: tenh_pos_allocate_stock';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.tenh_pos_allocate_stock(uuid,uuid,jsonb)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'d6cb10fff45267982aeb4b1000e79cda' then raise exception 'Reviewed writer body differs: tenh_pos_allocate_stock';end if;
  source:=pg_get_functiondef('public.tenh_pos_allocate_stock(uuid,uuid,jsonb)'::regprocedure);
  execute replace(source,body,'
declare v_row jsonb; v_product public.products%rowtype; v_assigned bigint; v_units integer; v_expected numeric; v_written integer; v_ids jsonb:=''[]''::jsonb;
begin
  perform public.tenh_barcode_enter_business_v3(p_business_id); -- v3 entry precedes original locks; original permissions/revisions remain.

  if public.tenh_pos_guard(p_business_id)<>''owner'' then raise exception ''Only the owner can allocate unassigned stock.'' using errcode=''42501''; end if;
  if jsonb_typeof(p_allocations) is distinct from ''array'' or jsonb_array_length(p_allocations) not between 1 and 100 then raise exception ''Review the stock allocation first.''; end if;
  perform id from public.business_locations where id=p_location_id and business_id=p_business_id and is_active=true for share;
  if not found then raise exception ''Choose an active branch for this business.''; end if;
  if (select count(*) from jsonb_array_elements(p_allocations))<>(select count(distinct j->>''productId'') from jsonb_array_elements(p_allocations) j) then raise exception ''Duplicate products in stock allocation.''; end if;
  -- Same product-first lock order as POS checkout. Concurrent allocations recheck
  -- the remainder after waiting; they cannot duplicate a pool of unassigned units.
  perform p.id from public.products p where p.business_id=p_business_id
    and p.id in (select (j->>''productId'')::uuid from jsonb_array_elements(p_allocations) j) order by p.id for update;
  for v_row in select value from jsonb_array_elements(p_allocations) order by value->>''productId'' loop
    select * into v_product from public.products where id=(v_row->>''productId'')::uuid and business_id=p_business_id and is_active=true;
    if not found then raise exception ''An allocation product is unavailable.''; end if;
    v_expected:=(v_row->>''quantity'')::numeric;
    if v_expected is null or v_expected::text in (''NaN'',''Infinity'',''-Infinity'') or v_expected<=0 or v_expected<>trunc(v_expected) or v_expected>2147483647 then raise exception ''Invalid stock allocation quantity.''; end if;
    perform product_id from public.product_location_stock where business_id=p_business_id and product_id=v_product.id order by location_id for update;
    if exists(select 1 from public.product_location_stock where business_id=p_business_id and product_id=v_product.id and quantity<0) then raise exception ''Review negative branch inventory in Inventory before allocating stock.''; end if;
    select coalesce(sum(quantity),0) into v_assigned from public.product_location_stock where business_id=p_business_id and product_id=v_product.id;
    v_units:=greatest(coalesce(v_product.stock_quantity,0)-v_assigned,0);
    if v_units=0 or v_units<>v_expected then raise exception ''Stock allocation changed. Refresh POS and review the unassigned units again.'' using errcode=''40001''; end if;
    insert into public.product_location_stock as existing(business_id,location_id,product_id,quantity,low_stock_threshold)
      values(p_business_id,p_location_id,v_product.id,v_units,coalesce(v_product.low_stock_quantity,0))
      on conflict(location_id,product_id) do update set quantity=existing.quantity+excluded.quantity where existing.business_id=p_business_id;
    get diagnostics v_written = row_count;
    if v_written<>1 then raise exception ''The branch stock record could not be assigned to this business.''; end if;
    if (select stock_quantity from public.products where id=v_product.id and business_id=p_business_id) is distinct from v_product.stock_quantity then
      raise exception ''An inventory trigger changed total stock while assigning existing units. No allocation was saved. Review Inventory configuration.'';
    end if;
    v_ids:=v_ids||jsonb_build_array(jsonb_build_object(''productId'',v_product.id,''quantity'',v_units));
    insert into public.audit_logs(business_id,user_id,action,entity_type,entity_id,description,metadata)
      values(p_business_id,auth.uid(),''update'',''product'',v_product.id,''Assigned existing unallocated stock to a branch'',jsonb_build_object(''locationId'',p_location_id,''quantity'',v_units,''operation'',''allocate_unassigned_stock'',''globalStockUnchanged'',true));
  end loop;
  return jsonb_build_object(''allocations'',v_ids);
end ');
 end if;
end $patch$;
-- tenh_pos_hold: tests/fixtures/order-safety-live-20261008.json
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.tenh_pos_hold(uuid,text,uuid,integer,text,jsonb)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.tenh_pos_hold(uuid,text,uuid,integer,text,jsonb)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: tenh_pos_hold';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.tenh_pos_hold(uuid,text,uuid,integer,text,jsonb)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'a610880213a887f603298eb90ffbda0c' then raise exception 'Reviewed writer body differs: tenh_pos_hold';end if;
  source:=pg_get_functiondef('public.tenh_pos_hold(uuid,text,uuid,integer,text,jsonb)'::regprocedure);
  execute replace(source,body,'
declare v_hold public.tenh_pos_holds%rowtype; v_line jsonb;
begin
  perform public.tenh_barcode_enter_business_v3(p_business_id); -- v3 entry precedes original locks; original permissions/revisions remain.

  perform public.tenh_pos_guard(p_business_id);
  if p_id is null then raise exception ''Invalid held order.''; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(''tenh-pos-hold:''||p_id::text,0));
  select * into v_hold from public.tenh_pos_holds where id=p_id for update;
  if found and (v_hold.business_id<>p_business_id or v_hold.created_by<>auth.uid()) then raise exception ''Held order not found.'' using errcode=''42501''; end if;
  if v_hold.id is not null and v_hold.order_id is not null then raise exception ''This held order has already been completed.''; end if;
  -- Retrying the same save after a lost response is harmless. A stale different
  -- draft is still rejected, and a completed hold can never be resold.
  if p_action=''save'' and v_hold.id is not null and v_hold.draft=p_draft and v_hold.label=btrim(p_label)
    and (v_hold.version=p_version or v_hold.version=coalesce(p_version,0)+1) then
    return jsonb_build_object(''id'',p_id,''version'',v_hold.version);
  end if;
  if v_hold.id is not null and v_hold.version is distinct from p_version then raise exception ''This held order changed on another screen. Refresh held orders.'' using errcode=''40001''; end if;
  if p_action=''delete'' then
    if v_hold.id is null then raise exception ''Held order not found.''; end if;
    delete from public.tenh_pos_holds where id=p_id;
    return jsonb_build_object(''id'',p_id);
  end if;
  if p_action is distinct from ''save'' or p_draft is null or jsonb_typeof(p_draft)<>''object'' or pg_column_size(p_draft)>200000
    or jsonb_typeof(p_draft->''lines'') is distinct from ''array'' or jsonb_array_length(p_draft->''lines'') not between 1 and 100
    or length(btrim(coalesce(p_label,''''))) not between 1 and 80 then raise exception ''Enter a label and 1–100 cart items.''; end if;
  if coalesce(p_draft->>''discountType'',''amount'') not in (''amount'',''percent'')
    or coalesce(p_draft->>''discount'','''') !~ ''^([0-9]+([.][0-9]{0,2})?|[.][0-9]{1,2})$''
    or (p_draft->>''discount'')::numeric > (case when p_draft->>''discountType''=''percent'' then 100 else 999999999 end)
    or coalesce(p_draft->>''deliveryFee'','''') !~ ''^([0-9]+([.][0-9]{0,2})?|[.][0-9]{1,2})$''
    or (p_draft->>''deliveryFee'')::numeric>999999999
    or coalesce(p_draft->>''points'','''') !~ ''^[0-9]+$'' or (p_draft->>''points'')::numeric>1000000
    or length(coalesce(p_draft->>''note'',''''))>1000 then raise exception ''Enter valid hold discount, delivery and points values.''; end if;
  if p_draft ? ''shipping'' and (jsonb_typeof(p_draft->''shipping'') is distinct from ''object''
    or coalesce(p_draft->''shipping''->>''method'','''') not in (''in_store'',''pickup'',''delivery'')
    or length(coalesce(p_draft->''shipping''->>''recipientName'',''''))>120
    or length(coalesce(p_draft->''shipping''->>''phone'',''''))>40 or length(coalesce(p_draft->''shipping''->>''address'',''''))>500) then
    raise exception ''Invalid shipping details in the hold.''; end if;
  if not exists(select 1 from public.business_locations where id=(p_draft->>''branchId'')::uuid and business_id=p_business_id and is_active=true) then raise exception ''Invalid branch.''; end if;
  if nullif(p_draft->>''customerId'','''') is not null and not exists(select 1 from public.customers where id=(p_draft->>''customerId'')::uuid and business_id=p_business_id) then raise exception ''Invalid customer.''; end if;
  for v_line in select value from jsonb_array_elements(p_draft->''lines'') loop
    if jsonb_typeof(v_line) is distinct from ''object'' or jsonb_typeof(v_line->''optionIds'') is distinct from ''array''
      or coalesce((v_line->>''quantity'')::numeric,0) not between 1 and 999
      or (v_line->>''quantity'')::numeric <> trunc((v_line->>''quantity'')::numeric)
      or not exists(select 1 from public.products p where p.id=(v_line->>''productId'')::uuid and p.business_id=p_business_id) then
      raise exception ''The held cart contains invalid items.'';
    end if;
  end loop;
  if v_hold.id is null then
    if p_version is not null then raise exception ''Held order not found. Save a new hold.''; end if;
    insert into public.tenh_pos_holds(id,business_id,created_by,label,draft) values(p_id,p_business_id,auth.uid(),btrim(p_label),p_draft);
  else
    update public.tenh_pos_holds set label=btrim(p_label),draft=p_draft,version=version+1,updated_at=clock_timestamp() where id=p_id;
  end if;
  return jsonb_build_object(''id'',p_id);
end ');
 end if;
end $patch$;
-- place_branch_online_order: supabase/migrations/20260924007000_shared_online_store.sql
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.place_branch_online_order(text,jsonb)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.place_branch_online_order(text,jsonb)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: place_branch_online_order';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.place_branch_online_order(text,jsonb)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'e10de6d385b07efeb9e4c877d7b38b40' then raise exception 'Reviewed writer body differs: place_branch_online_order';end if;
  source:=pg_get_functiondef('public.place_branch_online_order(text,jsonb)'::regprocedure);
  execute replace(source,body,'
declare v_business uuid; v_location uuid; r record; v_stock integer; v_global integer; v_reserved jsonb:=''[]''; v_result jsonb; v_store record;
begin
  if coalesce(auth.role(),'''')<>''service_role'' then raise exception ''Online creation requires reviewed service entry.'' using errcode=''42501'';end if; perform public.tenh_barcode_enter_business_v3((select id from public.businesses where slug=p_business_slug and is_active)); -- v3 entry precedes original locks; original permissions/revisions remain.

 if coalesce(auth.role(),'''')<>''service_role'' then raise exception ''Server access required.''; end if;
 select id into v_business from businesses where slug=p_business_slug and is_active for update;
 if v_business is null then raise exception ''Store not found.''; end if;
 -- Share-lock the status through commit so a saved closure cannot race a new order.
 select is_published,accept_online_orders into v_store from business_storefronts where business_id=v_business for share;
 if not found or not coalesce(v_store.is_published,false) then raise exception ''This online store is not published.''; end if;
 if not coalesce(v_store.accept_online_orders,false) then raise exception ''This store is not accepting online orders right now.''; end if;
 if jsonb_typeof(p_checkout->''p_items'') is distinct from ''array'' then raise exception ''Your cart is empty.''; end if;
 if jsonb_array_length(p_checkout->''p_items'') not between 1 and 100 then raise exception ''Choose between 1 and 100 cart items.''; end if;
 -- Match the stock writers'' product lock ordering before choosing a branch.
 perform 1 from products p where p.business_id=v_business and p.id in
   (select (i->>''productId'')::uuid from jsonb_array_elements(p_checkout->''p_items'') i) order by p.id for update;
 v_location:=public.tenh_choose_online_branch(v_business,p_checkout);
 perform public.tenh_assert_plan_branch(v_business,v_location);
 for r in select (i->>''productId'')::uuid product_id,sum((i->>''quantity'')::integer)::integer quantity from jsonb_array_elements(p_checkout->''p_items'') i group by 1 order by 1 loop
  select stock_quantity into v_global from products where id=r.product_id and business_id=v_business;
  select quantity into v_stock from product_location_stock where product_id=r.product_id and location_id=v_location and business_id=v_business for update;
  if not found or r.quantity>least(v_global,v_stock) then raise exception ''Stock changed. Review your cart and try again.''; end if;
  v_reserved:=v_reserved||jsonb_build_object(''id'',r.product_id,''after'',v_stock-r.quantity);
 end loop;
 perform set_config(''tenh.online_branch'',v_location::text,true);
 v_result:=public.place_online_order(p_business_slug=>p_business_slug,p_items=>p_checkout->''p_items'',p_fulfillment_type=>p_checkout->>''p_fulfillment_type'',p_guest_name=>p_checkout->>''p_guest_name'',p_guest_phone=>p_checkout->>''p_guest_phone'',p_guest_address=>p_checkout->>''p_guest_address'',p_customer_note=>p_checkout->>''p_customer_note'',p_table_token=>(p_checkout->>''p_table_token'')::uuid,p_payment_method=>p_checkout->>''p_payment_method'',p_payment_reference=>p_checkout->>''p_payment_reference'',p_delivery_zone_id=>(p_checkout->>''p_delivery_zone_id'')::uuid,p_requested_for=>(p_checkout->>''p_requested_for'')::timestamptz,p_coupon_code=>p_checkout->>''p_coupon_code'');
 if not exists(select 1 from orders where id=(v_result->>''orderId'')::uuid and business_id=v_business and location_id=v_location) then raise exception ''Order fulfillment branch could not be verified.''; end if;
 perform set_config(''tenh.online_branch'','''',true);
 for r in select value as item from jsonb_array_elements(v_reserved) loop
  update product_location_stock set quantity=(r.item->>''after'')::integer,updated_at=now() where business_id=v_business and location_id=v_location and product_id=(r.item->>''id'')::uuid;
 end loop;
 return v_result;
end ');
 end if;
end $patch$;
-- place_online_order: tests/fixtures/shared-storefront-checkout.json
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.place_online_order(text,jsonb,text,text,text,text,text,uuid,text,text,uuid,timestamp with time zone,text)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.place_online_order(text,jsonb,text,text,text,text,text,uuid,text,text,uuid,timestamp with time zone,text)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: place_online_order';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.place_online_order(text,jsonb,text,text,text,text,text,uuid,text,text,uuid,timestamp with time zone,text)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'9c884e835041cf16865bb8f9424d1cf2' then raise exception 'Reviewed writer body differs: place_online_order';end if;
  source:=pg_get_functiondef('public.place_online_order(text,jsonb,text,text,text,text,text,uuid,text,text,uuid,timestamp with time zone,text)'::regprocedure);
  execute replace(source,body,'
declare
  v_business public.businesses%rowtype;
  v_store public.business_storefronts%rowtype;
  v_table public.business_tables%rowtype;
  v_zone public.business_delivery_zones%rowtype;
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_quantity integer;
  v_option_ids uuid[];
  v_selected_options jsonb;
  v_option_total numeric(12,2);
  v_unit_price numeric(12,2);
  v_line_subtotal numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_delivery_fee numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_group record;
  v_group_selection_count integer;
  v_invalid_option_count integer;
  v_variant_label text;
  v_computed_items jsonb := ''[]''::jsonb;
  v_computed jsonb;
  v_order_id uuid;
  v_order_number text;
  v_public_token uuid;
  v_order_source text := ''online'';
  v_payment_method text := lower(coalesce(nullif(btrim(p_payment_method), ''''), ''cod''));
  v_payment_status text := ''unpaid'';
  v_active_zone_count integer := 0;
  v_customer_id uuid;
  v_phone_key text;
  v_coupon public.business_coupons%rowtype;
  v_coupon_code text;
  v_coupon_discount numeric(12,2) := 0;
  v_customer_coupon_uses integer := 0;
begin
  if coalesce(auth.role(),'''')<>''service_role'' then raise exception ''Online creation requires reviewed service entry.'' using errcode=''42501'';end if; perform public.tenh_barcode_enter_business_v3((select id from public.businesses where slug=p_business_slug and is_active)); -- v3 entry precedes original locks; original permissions/revisions remain.

  if p_business_slug is null or btrim(p_business_slug) = '''' then
    raise exception ''Store not found.'';
  end if;

  select *
    into v_business
  from public.businesses
  where slug = lower(btrim(p_business_slug))
  limit 1;

  if not found then
    raise exception ''Store not found.'';
  end if;

  if not v_business.is_active then
    raise exception ''This business is currently unavailable.'';
  end if;

  if v_business.subscription_expires_at is not null
     and v_business.subscription_expires_at <= now() then
    raise exception ''This business subscription has expired.'';
  end if;

  select *
    into v_store
  from public.business_storefronts
  where business_id = v_business.id
  limit 1;

  if not found or not v_store.is_published then
    raise exception ''This online store is not published.'';
  end if;

  if not v_store.accept_online_orders then
    raise exception ''This store is not accepting online orders right now.'';
  end if;

  if v_payment_method not in (''cod'', ''khqr'') then
    raise exception ''Invalid online payment method.'';
  end if;

  if v_payment_method = ''cod'' and not coalesce(v_store.accept_cod, true) then
    raise exception ''Pay later is not available for this store.'';
  end if;

  if v_payment_method = ''khqr'' then
    if not coalesce(v_store.accept_khqr, false) then
      raise exception ''KHQR payment is not available for this store.'';
    end if;

    if v_store.khqr_image_url is null or btrim(v_store.khqr_image_url) = '''' then
      raise exception ''The store has not configured its KHQR code yet.'';
    end if;

    v_payment_status := ''pending_verification'';
  end if;

  if p_fulfillment_type not in (''pickup'', ''delivery'', ''dine_in'') then
    raise exception ''Invalid fulfillment type.'';
  end if;

  if p_fulfillment_type = ''pickup'' and not v_store.allow_pickup then
    raise exception ''Pickup is not available.'';
  end if;

  if p_fulfillment_type = ''delivery'' and not v_store.allow_delivery then
    raise exception ''Delivery is not available.'';
  end if;

  if p_fulfillment_type = ''dine_in'' and not v_store.allow_dine_in then
    raise exception ''Dine in ordering is not available.'';
  end if;

  if p_guest_name is null or char_length(btrim(p_guest_name)) < 2 then
    raise exception ''Please enter your name.'';
  end if;

  if p_guest_phone is null or char_length(btrim(p_guest_phone)) < 5 then
    raise exception ''Please enter a valid phone number.'';
  end if;

  if p_fulfillment_type = ''delivery''
     and (p_guest_address is null or char_length(btrim(p_guest_address)) < 4) then
    raise exception ''Please enter a delivery address.'';
  end if;

  -- Phase 6: link guest checkout to the existing customer CRM by normalized phone.
  -- This runs inside the same transaction, so a later checkout validation failure
  -- also rolls back any new customer record.
  v_phone_key := regexp_replace(p_guest_phone, ''[^0-9]'', '''', ''g'');

  if char_length(v_phone_key) < 5 then
    raise exception ''Please enter a valid phone number.'';
  end if;

  select id
    into v_customer_id
  from public.customers
  where business_id = v_business.id
    and regexp_replace(coalesce(phone, ''''), ''[^0-9]'', '''', ''g'') = v_phone_key
  order by created_at asc
  limit 1
  for update;

  if not found then
    insert into public.customers (
      owner_id,
      business_id,
      name,
      phone,
      address,
      note,
      created_at,
      updated_at
    )
    values (
      v_business.owner_id,
      v_business.id,
      left(btrim(p_guest_name), 120),
      left(btrim(p_guest_phone), 60),
      case when p_guest_address is null then null else left(btrim(p_guest_address), 500) end,
      ''Created automatically from online checkout'',
      now(),
      now()
    )
    returning id into v_customer_id;
  else
    update public.customers
    set
      phone = coalesce(nullif(phone, ''''), left(btrim(p_guest_phone), 60)),
      address = coalesce(
        nullif(address, ''''),
        case when p_guest_address is null then null else left(btrim(p_guest_address), 500) end
      ),
      updated_at = now()
    where id = v_customer_id
      and business_id = v_business.id;
  end if;

  if p_table_token is not null then
    select *
      into v_table
    from public.business_tables
    where business_id = v_business.id
      and public_token = p_table_token
      and is_active = true
    limit 1;

    if not found then
      raise exception ''This table QR code is no longer valid.'';
    end if;

    v_order_source := ''qr'';

    if p_fulfillment_type <> ''dine_in'' then
      raise exception ''Table QR orders must use dine in.'';
    end if;
  elsif p_fulfillment_type = ''dine_in'' then
    raise exception ''Please scan a valid table QR code for dine in ordering.'';
  end if;

  if p_fulfillment_type = ''delivery'' then
    select count(*)
      into v_active_zone_count
    from public.business_delivery_zones
    where business_id = v_business.id
      and is_active = true;

    if p_delivery_zone_id is not null then
      select *
        into v_zone
      from public.business_delivery_zones
      where id = p_delivery_zone_id
        and business_id = v_business.id
        and is_active = true
      limit 1;

      if not found then
        raise exception ''The selected delivery zone is no longer available.'';
      end if;
    elsif v_active_zone_count > 0 then
      raise exception ''Please select a delivery zone.'';
    end if;
  elsif p_delivery_zone_id is not null then
    raise exception ''Delivery zones can only be used for delivery orders.'';
  end if;

  if p_requested_for is not null then
    if not coalesce(v_store.allow_scheduled_orders, false) then
      raise exception ''Scheduled ordering is not available for this store.'';
    end if;

    if p_table_token is not null then
      raise exception ''Table QR orders must be placed for now.'';
    end if;

    if p_requested_for < now() + make_interval(mins => greatest(coalesce(v_store.min_schedule_lead_minutes, 30), 0)) then
      raise exception ''The requested time is too soon.'';
    end if;

    if p_requested_for > now() + make_interval(days => greatest(coalesce(v_store.max_schedule_days, 7), 1)) then
      raise exception ''The requested time is too far in advance.'';
    end if;
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> ''array''
     or jsonb_array_length(p_items) = 0 then
    raise exception ''Your cart is empty.'';
  end if;

  if jsonb_array_length(p_items) > 100 then
    raise exception ''Too many items in one order.'';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    begin
      v_product_id := (v_item ->> ''productId'')::uuid;
      v_quantity := (v_item ->> ''quantity'')::integer;
    exception when others then
      raise exception ''The cart contains invalid product data.'';
    end;

    if v_quantity is null or v_quantity < 1 or v_quantity > 999 then
      raise exception ''Invalid product quantity.'';
    end if;

    select *
      into v_product
    from public.products
    where id = v_product_id
      and business_id = v_business.id
      and is_active = true
      and is_online = true
    for update;

    if not found then
      raise exception ''A product in your cart is no longer available.'';
    end if;

    if coalesce(v_product.stock_quantity, 0) < v_quantity then
      raise exception ''Not enough stock for %.'', v_product.name;
    end if;

    select coalesce(
      array_agg(value::uuid),
      array[]::uuid[]
    )
    into v_option_ids
    from jsonb_array_elements_text(
      coalesce(v_item -> ''optionIds'', ''[]''::jsonb)
    );

    select count(*)
      into v_invalid_option_count
    from unnest(v_option_ids) option_id
    left join public.product_options po
      on po.id = option_id
      and po.business_id = v_business.id
      and po.product_id = v_product.id
      and po.is_active = true
    where po.id is null;

    if v_invalid_option_count > 0 then
      raise exception ''A selected product option is no longer available.'';
    end if;

    if coalesce(v_product.product_type, ''standard'') = ''configurable'' then
      for v_group in
        select *
        from public.product_option_groups
        where business_id = v_business.id
          and product_id = v_product.id
        order by sort_order, created_at
      loop
        select count(*)
          into v_group_selection_count
        from public.product_options po
        where po.group_id = v_group.id
          and po.id = any(v_option_ids)
          and po.is_active = true;

        if v_group.is_required and v_group_selection_count = 0 then
          raise exception ''Please choose an option for %.'', v_group.name;
        end if;

        if v_group_selection_count < v_group.min_selections
           or v_group_selection_count > v_group.max_selections then
          raise exception ''Invalid selection count for %.'', v_group.name;
        end if;
      end loop;
    elsif cardinality(v_option_ids) > 0 then
      raise exception ''This product does not support configurable options.'';
    end if;

    select
      coalesce(sum(po.price_adjustment), 0),
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            ''id'', po.id,
            ''name'', po.name,
            ''priceAdjustment'', po.price_adjustment,
            ''groupId'', po.group_id
          ) order by pog.sort_order, po.sort_order, po.created_at
        ) filter (where po.id is not null),
        ''[]''::jsonb
      )
    into v_option_total, v_selected_options
    from public.product_options po
    left join public.product_option_groups pog
      on pog.id = po.group_id
    where po.id = any(v_option_ids)
      and po.business_id = v_business.id
      and po.product_id = v_product.id
      and po.is_active = true;

    v_unit_price := round(
      (coalesce(v_product.selling_price, 0) + coalesce(v_option_total, 0))::numeric,
      2
    );

    v_line_subtotal := round(
      (v_unit_price * v_quantity)::numeric,
      2
    );

    v_subtotal := v_subtotal + v_line_subtotal;

    v_variant_label := nullif(
      concat_ws(
        '' / '',
        nullif(btrim(coalesce(v_product.color, '''')), ''''),
        nullif(btrim(coalesce(v_product.size, '''')), '''')
      ),
      ''''
    );

    v_computed_items := v_computed_items || jsonb_build_array(
      jsonb_build_object(
        ''productId'', v_product.id,
        ''productName'', v_product.name,
        ''quantity'', v_quantity,
        ''unitPrice'', v_unit_price,
        ''subtotal'', v_line_subtotal,
        ''variantLabel'', v_variant_label,
        ''selectedOptions'', v_selected_options
      )
    );
  end loop;

  if v_subtotal < coalesce(v_store.minimum_order, 0) then
    raise exception ''Minimum order is %.'', v_store.minimum_order;
  end if;

  if p_fulfillment_type = ''delivery'' then
    if p_delivery_zone_id is not null then
      if v_subtotal < coalesce(v_zone.minimum_order, 0) then
        raise exception ''Minimum order for % is %.'', v_zone.name, v_zone.minimum_order;
      end if;
      v_delivery_fee := coalesce(v_zone.fee, 0);
    else
      v_delivery_fee := coalesce(v_store.delivery_fee, 0);
    end if;
  end if;

  v_coupon_code := upper(nullif(btrim(p_coupon_code), ''''));

  if v_coupon_code is not null then
    if not coalesce(v_store.enable_coupons, true) then
      raise exception ''Coupons are not enabled for this store.'';
    end if;

    select *
      into v_coupon
    from public.business_coupons
    where business_id = v_business.id
      and upper(code) = v_coupon_code
      and is_active = true
      and (starts_at is null or starts_at <= now())
      and (ends_at is null or ends_at >= now())
    limit 1
    for update;

    if not found then
      raise exception ''This coupon is invalid or expired.'';
    end if;

    if v_subtotal < coalesce(v_coupon.minimum_order, 0) then
      raise exception ''This coupon requires a minimum order of %.'', v_coupon.minimum_order;
    end if;

    if v_coupon.usage_limit is not null
       and v_coupon.usage_count >= v_coupon.usage_limit then
      raise exception ''This coupon has reached its usage limit.'';
    end if;

    if v_coupon.per_customer_limit is not null then
      select count(*)
        into v_customer_coupon_uses
      from public.coupon_redemptions
      where coupon_id = v_coupon.id
        and customer_id = v_customer_id;

      if v_customer_coupon_uses >= v_coupon.per_customer_limit then
        raise exception ''You have already used this coupon the maximum number of times.'';
      end if;
    end if;

    if v_coupon.discount_type = ''percentage'' then
      v_coupon_discount := round((v_subtotal * v_coupon.discount_value / 100)::numeric, 2);
    else
      v_coupon_discount := least(v_subtotal, v_coupon.discount_value);
    end if;

    if v_coupon.max_discount is not null then
      v_coupon_discount := least(v_coupon_discount, v_coupon.max_discount);
    end if;

    v_coupon_discount := greatest(0, least(v_coupon_discount, v_subtotal));
  end if;

  v_total := round((v_subtotal - v_coupon_discount + v_delivery_fee)::numeric, 2);
  v_order_number := ''WEB-'' || upper(substr(replace(gen_random_uuid()::text, ''-'', ''''), 1, 10));
  v_public_token := gen_random_uuid();

  insert into public.orders (
    owner_id,
    business_id,
    customer_id,
    order_number,
    subtotal,
    discount,
    coupon_id,
    coupon_code,
    coupon_discount,
    delivery_fee,
    total,
    payment_method,
    payment_status,
    payment_reference,
    amount_paid,
    change_amount,
    remaining_balance,
    status,
    order_source,
    fulfillment_type,
    online_status,
    guest_name,
    guest_phone,
    guest_address,
    customer_note,
    delivery_zone_id,
    delivery_zone_name,
    requested_for,
    table_id,
    table_name,
    public_order_token,
    created_at,
    updated_at
  )
  values (
    v_business.owner_id,
    v_business.id,
    v_customer_id,
    v_order_number,
    v_subtotal,
    v_coupon_discount,
    case when v_coupon_code is null then null else v_coupon.id end,
    v_coupon_code,
    v_coupon_discount,
    v_delivery_fee,
    v_total,
    v_payment_method,
    v_payment_status,
    case when p_payment_reference is null then null else left(btrim(p_payment_reference), 120) end,
    0,
    0,
    v_total,
    ''new'',
    v_order_source,
    p_fulfillment_type,
    ''new'',
    left(btrim(p_guest_name), 120),
    left(btrim(p_guest_phone), 60),
    case when p_guest_address is null then null else left(btrim(p_guest_address), 500) end,
    case when p_customer_note is null then null else left(btrim(p_customer_note), 1000) end,
    case when p_delivery_zone_id is null then null else v_zone.id end,
    case when p_delivery_zone_id is null then null else v_zone.name end,
    p_requested_for,
    case when p_table_token is null then null else v_table.id end,
    case when p_table_token is null then null else v_table.name end,
    v_public_token,
    now(),
    now()
  )
  returning id into v_order_id;

  if v_coupon_code is not null then
    insert into public.coupon_redemptions (
      business_id,
      coupon_id,
      order_id,
      customer_id,
      guest_phone,
      discount_amount,
      created_at
    )
    values (
      v_business.id,
      v_coupon.id,
      v_order_id,
      v_customer_id,
      left(btrim(p_guest_phone), 60),
      v_coupon_discount,
      now()
    );

    update public.business_coupons
    set usage_count = usage_count + 1,
        updated_at = now()
    where id = v_coupon.id
      and business_id = v_business.id;
  end if;

  for v_computed in
    select value from jsonb_array_elements(v_computed_items)
  loop
    insert into public.order_items (
      order_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      subtotal,
      variant_label,
      selected_options
    )
    values (
      v_order_id,
      (v_computed ->> ''productId'')::uuid,
      v_computed ->> ''productName'',
      (v_computed ->> ''quantity'')::integer,
      (v_computed ->> ''unitPrice'')::numeric,
      (v_computed ->> ''subtotal'')::numeric,
      nullif(v_computed ->> ''variantLabel'', ''''),
      coalesce(v_computed -> ''selectedOptions'', ''[]''::jsonb)
    );

    update public.products
    set stock_quantity = stock_quantity - (v_computed ->> ''quantity'')::integer,
        updated_at = now()
    where id = (v_computed ->> ''productId'')::uuid
      and business_id = v_business.id;
  end loop;

  return jsonb_build_object(
    ''orderId'', v_order_id,
    ''orderNumber'', v_order_number,
    ''publicToken'', v_public_token,
    ''subtotal'', v_subtotal,
    ''discount'', v_coupon_discount,
    ''couponCode'', v_coupon_code,
    ''deliveryFee'', v_delivery_fee,
    ''total'', v_total,
    ''customerId'', v_customer_id,
    ''currency'', v_store.currency,
    ''onlineStatus'', ''new'',
    ''paymentMethod'', v_payment_method,
    ''paymentStatus'', v_payment_status,
    ''deliveryZoneName'', case when p_delivery_zone_id is null then null else v_zone.name end,
    ''requestedFor'', p_requested_for
  );
end;
');
 end if;
end $patch$;
-- cancel_order: tests/fixtures/order-safety-live-20261008.json
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.cancel_order(uuid,text)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.cancel_order(uuid,text)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: cancel_order';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.cancel_order(uuid,text)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'7964999466ed0937c8c2f63b34809eb4' then raise exception 'Reviewed writer body differs: cancel_order';end if;
  source:=pg_get_functiondef('public.cancel_order(uuid,text)'::regprocedure);
  execute replace(source,body,'
declare
  v_user_id uuid;
  v_business_id uuid;
  v_order_owner_id uuid;
  v_order_status text;

  v_item record;
  v_stock_before integer;
  v_stock_after integer;
begin
  perform public.tenh_barcode_enter_business_v3((select business_id from public.orders where id=p_order_id)); -- v3 entry precedes original locks; original permissions/revisions remain.

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception ''You must be logged in.'';
  end if;

  select
    o.business_id,
    o.owner_id,
    o.status
  into
    v_business_id,
    v_order_owner_id,
    v_order_status
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception ''Order not found.'';
  end if;

  if not exists (
    select 1
    from public.business_members bm
    where bm.business_id = v_business_id
      and bm.user_id = v_user_id
      and bm.is_active = true
  ) then
    raise exception
      ''You do not have permission to cancel this order.'';
  end if;

  if v_order_status = ''cancelled'' then
    raise exception
      ''This order is already cancelled.'';
  end if;

  if v_order_status not in (
    ''new'', ''pending'', ''in_progress'', ''completed''
  ) then
    raise exception
      ''Only new, pending, or completed orders can be cancelled.'';
  end if;

  for v_item in
    select
      oi.product_id,
      oi.product_name,
      oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id
  loop
    if v_item.product_id is not null then
      select p.stock_quantity
      into v_stock_before
      from public.products p
      where p.id = v_item.product_id
        and p.business_id = v_business_id
      for update;

      if not found then
        raise exception
          ''Product "%" was not found.'',
          v_item.product_name;
      end if;

      v_stock_after :=
        v_stock_before + v_item.quantity;

      update public.products
      set
        stock_quantity = v_stock_after,
        updated_at = now()
      where id = v_item.product_id
        and business_id = v_business_id;

      insert into public.inventory_movements (
        business_id,
        owner_id,
        product_id,
        order_id,
        movement_type,
        quantity,
        stock_before,
        stock_after,
        note
      )
      values (
        v_business_id,
        v_user_id,
        v_item.product_id,
        p_order_id,
        ''order_cancelled'',
        v_item.quantity,
        v_stock_before,
        v_stock_after,
        concat(
          ''Stock restored after order cancellation'',
          case
            when nullif(trim(p_reason), '''') is not null
              then '': '' || trim(p_reason)
            else ''''
          end
        )
      );
    end if;
  end loop;

  update public.orders
  set
    status = ''cancelled'',
    updated_at = now()
  where id = p_order_id
    and business_id = v_business_id;

  if not found then
    raise exception
      ''Unable to cancel order.'';
  end if;
end;
');
 end if;
end $patch$;
-- cancel_purchase: tests/fixtures/branch-purchase-functions.sql
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.cancel_purchase(uuid,text)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.cancel_purchase(uuid,text)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: cancel_purchase';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.cancel_purchase(uuid,text)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'2fe26fc12bdfa4401afa0bcff817f8d1' then raise exception 'Reviewed writer body differs: cancel_purchase';end if;
  source:=pg_get_functiondef('public.cancel_purchase(uuid,text)'::regprocedure);
  execute replace(source,body,'
declare
    v_user_id uuid;
    v_business_id uuid;
    v_owner_id uuid;

    v_purchase_number text;
    v_purchase_status text;

    v_item record;

    v_current_stock integer;
    v_new_stock integer;
begin
  perform public.tenh_barcode_enter_business_v3((select business_id from public.purchases where id=p_purchase_id)); -- v3 entry precedes original locks; original permissions/revisions remain.

    raise exception ''USER=%'', auth.uid();

    if v_user_id is null then
        raise exception ''You must be logged in.'';
    end if;

    if p_reason is null or trim(p_reason) = '''' then
        raise exception ''Cancellation reason is required.'';
    end if;

    /*
     * Load purchase
     */
    select
        business_id,
        owner_id,
        purchase_number,
        status
    into
        v_business_id,
        v_owner_id,
        v_purchase_number,
        v_purchase_status
    from purchases
    where id = p_purchase_id
    for update;

    if not found then
        raise exception ''Purchase not found.'';
    end if;

    if v_purchase_status = ''cancelled'' then
        raise exception ''Purchase has already been cancelled.'';
    end if;

    if v_purchase_status <> ''received'' then
        raise exception ''Only received purchases can be cancelled.'';
    end if;

    /*
     * Validate stock first
     */
    for v_item in
        select
            product_id,
            product_name,
            quantity
        from purchase_items
        where purchase_id = p_purchase_id
    loop

        select stock_quantity
        into v_current_stock
        from products
        where id = v_item.product_id
          and business_id = v_business_id
        for update;

        if not found then
            raise exception
                ''Product "%" no longer exists.'',
                v_item.product_name;
        end if;

        if v_current_stock < v_item.quantity then
            raise exception
                ''Cannot cancel purchase. Product "%": current stock is %, cancellation requires %.'',
                v_item.product_name,
                v_current_stock,
                v_item.quantity;
        end if;

    end loop;

    /*
     * Reverse stock
     */
    for v_item in
        select
            product_id,
            product_name,
            quantity
        from purchase_items
        where purchase_id = p_purchase_id
    loop

        select stock_quantity
        into v_current_stock
        from products
        where id = v_item.product_id
          and business_id = v_business_id
        for update;

        v_new_stock :=
            v_current_stock - v_item.quantity;

        update products
        set
            stock_quantity = v_new_stock,
            updated_at = now()
        where id = v_item.product_id
          and business_id = v_business_id;

        insert into inventory_movements (
            business_id,
            owner_id,
            product_id,
            order_id,
            movement_type,
            quantity,
            stock_before,
            stock_after,
            note
        )
        values (
            v_business_id,
            v_owner_id,
            v_item.product_id,
            null,
            ''purchase_cancelled'',
            v_item.quantity,
            v_current_stock,
            v_new_stock,
            ''Purchase cancelled: ''
                || v_purchase_number
                || ''. Reason: ''
                || trim(p_reason)
        );

    end loop;

    update purchases
    set
        status = ''cancelled'',
        cancellation_reason = trim(p_reason),
        cancelled_at = now(),
        updated_at = now()
    where id = p_purchase_id;
end;
');
 end if;
end $patch$;
-- create_order_return: tests/fixtures/order-safety-dependencies-live-20261008.json
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.create_order_return(uuid,text,jsonb)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.create_order_return(uuid,text,jsonb)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: create_order_return';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.create_order_return(uuid,text,jsonb)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'3f51f6ab42456ef06625efbfd884fe3e' then raise exception 'Reviewed writer body differs: create_order_return';end if;
  source:=pg_get_functiondef('public.create_order_return(uuid,text,jsonb)'::regprocedure);
  execute replace(source,body,'
declare
  v_user_id uuid;
  v_business_id uuid;
  v_order_status text;

  v_return_id uuid;
  v_return_number text;

  v_item jsonb;
  v_order_item_id uuid;
  v_return_quantity integer;

  v_product_id uuid;
  v_product_name text;
  v_sold_quantity integer;
  v_unit_price numeric(12, 2);

  v_already_returned integer;
  v_remaining_quantity integer;

  v_stock_before integer;
  v_stock_after integer;

  v_item_subtotal numeric(12, 2);
  v_refund_total numeric(12, 2) := 0;

  v_new_subtotal numeric(12, 2) := 0;
  v_discount numeric(12, 2) := 0;
  v_delivery_fee numeric(12, 2) := 0;
  v_amount_paid numeric(12, 2) := 0;
  v_new_total numeric(12, 2) := 0;
  v_new_remaining_balance numeric(12, 2) := 0;
  v_new_change_amount numeric(12, 2) := 0;
begin
  perform public.tenh_barcode_enter_business_v3((select business_id from public.orders where id=p_order_id)); -- v3 entry precedes original locks; original permissions/revisions remain.

  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception ''You must be logged in.'';
  end if;

  if p_reason is null
    or length(trim(p_reason)) < 3
  then
    raise exception
      ''Return reason must contain at least 3 characters.'';
  end if;

  if p_items is null
    or jsonb_typeof(p_items) <> ''array''
    or jsonb_array_length(p_items) = 0
  then
    raise exception
      ''Select at least one item to return.'';
  end if;

  /*
   * Load the order and current business.
   */
  select
    o.business_id,
    o.status
  into
    v_business_id,
    v_order_status
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception ''Order not found.'';
  end if;

  /*
   * Check active business membership.
   */
  if not exists (
    select 1
    from public.business_members bm
    where bm.business_id = v_business_id
      and bm.user_id = v_user_id
      and bm.is_active = true
  ) then
    raise exception
      ''You do not have permission to return items from this order.'';
  end if;

  if v_order_status = ''cancelled'' then
    raise exception
      ''A cancelled order cannot be returned.'';
  end if;

  if v_order_status not in (
    ''new'',
    ''pending'',
    ''completed''
  ) then
    raise exception
      ''Only new, pending, or completed orders can be returned.'';
  end if;

  v_return_number :=
    ''RET-'' ||
    to_char(
      clock_timestamp(),
      ''YYYYMMDD-HH24MISS''
    ) ||
    ''-'' ||
    upper(
      substr(
        replace(
          gen_random_uuid()::text,
          ''-'',
          ''''
        ),
        1,
        4
      )
    );

  /*
   * Create return header.
   */
  insert into public.returns (
    business_id,
    owner_id,
    order_id,
    return_number,
    reason,
    refund_amount
  )
  values (
    v_business_id,
    v_user_id,
    p_order_id,
    v_return_number,
    trim(p_reason),
    0
  )
  returning id
  into v_return_id;

  /*
   * Process returned items.
   */
  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    begin
      v_order_item_id :=
        nullif(
          v_item ->> ''order_item_id'',
          ''''
        )::uuid;
    exception
      when others then
        raise exception
          ''Invalid order item ID.'';
    end;

    begin
      v_return_quantity :=
        coalesce(
          (v_item ->> ''quantity'')::integer,
          0
        );
    exception
      when others then
        raise exception
          ''Invalid return quantity.'';
    end;

    if v_order_item_id is null then
      raise exception
        ''Order item ID is required.'';
    end if;

    if v_return_quantity <= 0 then
      raise exception
        ''Return quantity must be greater than zero.'';
    end if;

    select
      oi.product_id,
      oi.product_name,
      oi.quantity,
      oi.unit_price
    into
      v_product_id,
      v_product_name,
      v_sold_quantity,
      v_unit_price
    from public.order_items oi
    where oi.id = v_order_item_id
      and oi.order_id = p_order_id;

    if not found then
      raise exception
        ''Order item was not found.'';
    end if;

    select
      coalesce(
        sum(ri.quantity),
        0
      )
    into v_already_returned
    from public.return_items ri
    inner join public.returns r
      on r.id = ri.return_id
    where ri.order_item_id = v_order_item_id
      and r.business_id = v_business_id;

    v_remaining_quantity :=
      v_sold_quantity -
      v_already_returned;

    if v_remaining_quantity <= 0 then
      raise exception
        ''Product "%" has already been fully returned.'',
        v_product_name;
    end if;

    if v_return_quantity >
      v_remaining_quantity
    then
      raise exception
        ''Cannot return product "%". Sold: %, already returned: %, maximum remaining return: %.'',
        v_product_name,
        v_sold_quantity,
        v_already_returned,
        v_remaining_quantity;
    end if;

    select p.stock_quantity
    into v_stock_before
    from public.products p
    where p.id = v_product_id
      and p.business_id = v_business_id
    for update;

    if not found then
      raise exception
        ''Product "%" no longer exists.'',
        v_product_name;
    end if;

    v_stock_after :=
      v_stock_before +
      v_return_quantity;

    v_item_subtotal :=
      v_return_quantity *
      v_unit_price;

    v_refund_total :=
      v_refund_total +
      v_item_subtotal;

    /*
     * return_items currently uses owner_id.
     * Add business_id here only if your table has it.
     */
    insert into public.return_items (
      owner_id,
      return_id,
      order_item_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      subtotal
    )
    values (
      v_user_id,
      v_return_id,
      v_order_item_id,
      v_product_id,
      v_product_name,
      v_return_quantity,
      v_unit_price,
      v_item_subtotal
    );

    update public.products
    set
      stock_quantity = v_stock_after,
      updated_at = now()
    where id = v_product_id
      and business_id = v_business_id;

    if not found then
      raise exception
        ''Unable to restore stock for "%".'',
        v_product_name;
    end if;

    insert into public.inventory_movements (
      business_id,
      owner_id,
      product_id,
      order_id,
      return_id,
      movement_type,
      quantity,
      stock_before,
      stock_after,
      note
    )
    values (
      v_business_id,
      v_user_id,
      v_product_id,
      p_order_id,
      v_return_id,
      ''return'',
      v_return_quantity,
      v_stock_before,
      v_stock_after,
      ''Returned from order. Return number: '' ||
      v_return_number ||
      ''. Reason: '' ||
      trim(p_reason)
    );
  end loop;

  update public.returns
  set
    refund_amount = v_refund_total
  where id = v_return_id
    and business_id = v_business_id;

  /*
   * Recalculate subtotal after returns.
   */
  select
    coalesce(
      sum(
        greatest(
          oi.quantity -
          coalesce(
            returned.total_returned,
            0
          ),
          0
        ) *
        oi.unit_price
      ),
      0
    )
  into v_new_subtotal
  from public.order_items oi
  left join (
    select
      ri.order_item_id,
      sum(ri.quantity)
        as total_returned
    from public.return_items ri
    inner join public.returns r
      on r.id = ri.return_id
    where r.order_id = p_order_id
      and r.business_id = v_business_id
    group by ri.order_item_id
  ) returned
    on returned.order_item_id = oi.id
  where oi.order_id = p_order_id;

  select
    coalesce(o.discount, 0),
    coalesce(o.delivery_fee, 0),
    coalesce(o.amount_paid, 0)
  into
    v_discount,
    v_delivery_fee,
    v_amount_paid
  from public.orders o
  where o.id = p_order_id
    and o.business_id = v_business_id;

  if not found then
    raise exception
      ''Order was not found while recalculating totals.'';
  end if;

  v_new_total :=
    greatest(
      0,
      v_new_subtotal -
      v_discount +
      v_delivery_fee
    );

  v_new_remaining_balance :=
    greatest(
      0,
      v_new_total -
      v_amount_paid
    );

  v_new_change_amount :=
    greatest(
      0,
      v_amount_paid -
      v_new_total
    );

  update public.orders
  set
    subtotal =
      v_new_subtotal,
    total =
      v_new_total,
    remaining_balance =
      v_new_remaining_balance,
    change_amount =
      v_new_change_amount,
    updated_at = now()
  where id = p_order_id
    and business_id = v_business_id;

  if not found then
    raise exception
      ''Unable to update the order totals.'';
  end if;

  return v_return_id;
end;
');
 end if;
end $patch$;
-- receive_purchase_order: tests/fixtures/order-safety-dependencies-live-20261008.json
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.receive_purchase_order(uuid,jsonb)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.receive_purchase_order(uuid,jsonb)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: receive_purchase_order';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.receive_purchase_order(uuid,jsonb)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'f112389bf82a9d322fb58f2baaed9c3b' then raise exception 'Reviewed writer body differs: receive_purchase_order';end if;
  source:=pg_get_functiondef('public.receive_purchase_order(uuid,jsonb)'::regprocedure);
  execute replace(source,body,'
declare
  v_user uuid := auth.uid();
  v_po public.purchase_orders%rowtype;
  v_item jsonb;
  v_po_item public.purchase_order_items%rowtype;
  v_product public.products%rowtype;
  v_qty integer;
  v_before integer; v_branch_before integer;
  v_after integer;
  v_remaining integer;
  v_total_received integer := 0;
  v_all_received boolean;
begin
  perform public.tenh_barcode_enter_business_v3((select business_id from public.purchase_orders where id=p_purchase_order_id)); -- v3 entry precedes original locks; original permissions/revisions remain.

  if v_user is null then raise exception ''Authentication required.''; end if;
  if p_receipts is null or jsonb_typeof(p_receipts) <> ''array'' or jsonb_array_length(p_receipts) = 0 then
    raise exception ''Add at least one received quantity.'';
  end if;

  select * into v_po from public.purchase_orders where id = p_purchase_order_id for update;
  if not found then raise exception ''Purchase order not found.''; end if;
  if v_po.status in (''received'',''cancelled'') then raise exception ''This purchase order cannot receive more stock.''; end if;

  perform public.tenh_assert_effective_permission(v_po.business_id,''purchases.update'');
  if v_po.location_id is distinct from public.tenh_request_branch(v_po.business_id) then raise exception ''Purchase order belongs to another branch.'';end if;

  for v_item in select value from jsonb_array_elements(p_receipts)
  loop
    begin
      v_qty := (v_item->>''quantity'')::integer;
    exception when others then
      raise exception ''Invalid received quantity.'';
    end;
    if v_qty is null or v_qty <= 0 then raise exception ''Received quantity must be greater than zero.''; end if;

    select * into v_po_item
    from public.purchase_order_items
    where id = (v_item->>''itemId'')::uuid
      and purchase_order_id = v_po.id
      and business_id = v_po.business_id
    for update;
    if not found then raise exception ''Purchase order line not found.''; end if;

    v_remaining := v_po_item.ordered_quantity - v_po_item.received_quantity;
    if v_qty > v_remaining then raise exception ''Received quantity exceeds remaining quantity for %.'', v_po_item.product_name; end if;

    select * into v_product from public.products
    where id = v_po_item.product_id and business_id = v_po.business_id for update;
    if not found then raise exception ''Product no longer exists.''; end if;

    v_before := coalesce(v_product.stock_quantity,0);
    v_after := v_before + v_qty;

    update public.products
      set stock_quantity = v_after,
          updated_at = now()
    where id = v_product.id;

    select quantity into v_branch_before from public.product_location_stock where business_id=v_po.business_id and location_id=v_po.location_id and product_id=v_product.id for update;
    if not found then raise exception ''Assign this product to the branch before receiving stock.'';end if;
    update public.product_location_stock set quantity=quantity+v_qty,updated_at=now() where business_id=v_po.business_id and location_id=v_po.location_id and product_id=v_product.id;
    update public.branch_product_details set cost_price=v_po_item.unit_cost,updated_at=now() where business_id=v_po.business_id and location_id=v_po.location_id and id=v_product.id;
    perform set_config(''tenh.adjustment_branch'',v_po.location_id::text,true);
    update public.purchase_order_items
      set received_quantity = received_quantity + v_qty, updated_at = now()
    where id = v_po_item.id;

    insert into public.stock_adjustments (
      business_id, product_id, adjustment_type, quantity_delta,
      stock_before, stock_after, reason, reference, created_by
    ) values (
      v_po.business_id, v_product.id, ''increase'', v_qty,
      v_branch_before, v_branch_before+v_qty, ''Purchase order receipt'', v_po.po_number, v_user
    );

    v_total_received := v_total_received + v_qty;
  end loop;

  select bool_and(received_quantity >= ordered_quantity)
    into v_all_received
  from public.purchase_order_items
  where purchase_order_id = v_po.id;

  update public.purchase_orders
    set status = case when coalesce(v_all_received,false) then ''received'' else ''partial'' end,
        updated_at = now()
  where id = v_po.id;

  perform set_config(''tenh.adjustment_branch'','''',true);
  return jsonb_build_object(''purchaseOrderId'', v_po.id, ''receivedQuantity'', v_total_received, ''status'', case when coalesce(v_all_received,false) then ''received'' else ''partial'' end);
end;
');
 end if;
end $patch$;
-- tenh_create_order_return_accounted: tests/fixtures/order-safety-dependencies-live-20261008.json
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.tenh_create_order_return_accounted(uuid,text,jsonb,text)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.tenh_create_order_return_accounted(uuid,text,jsonb,text)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: tenh_create_order_return_accounted';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.tenh_create_order_return_accounted(uuid,text,jsonb,text)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'f3fdfc7a2c3e044cf5d59236529a0773' then raise exception 'Reviewed writer body differs: tenh_create_order_return_accounted';end if;
  source:=pg_get_functiondef('public.tenh_create_order_return_accounted(uuid,text,jsonb,text)'::regprocedure);
  execute replace(source,body,'
declare result jsonb;
begin
  perform public.tenh_barcode_enter_business_v3((select business_id from public.orders where id=p_order_id)); -- v3 entry precedes original locks; original permissions/revisions remain.

 if p_refund_method not in (''cash'',''bank_transfer'',''other'') or p_refund_method is null then raise exception ''Choose the refund payment method.''; end if;
 perform set_config(''tenh.refund_method'',p_refund_method,true);
 select to_jsonb(create_order_return(p_order_id,p_reason,p_items)) into result;
 perform set_config(''tenh.refund_method'','''',true);
 return result;
end; ');
 end if;
end $patch$;
-- tenh_run_branch_stock: tests/fixtures/order-safety-live-20261008.json
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.tenh_run_branch_stock(uuid,text,jsonb)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.tenh_run_branch_stock(uuid,text,jsonb)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: tenh_run_branch_stock';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.tenh_run_branch_stock(uuid,text,jsonb)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'d55490fcc3e1c70165a9dae1135be217' then raise exception 'Reviewed writer body differs: tenh_run_branch_stock';end if;
  source:=pg_get_functiondef('public.tenh_run_branch_stock(uuid,text,jsonb)'::regprocedure);
  execute replace(source,body,'
declare b uuid; doc jsonb; ids uuid[]; snapshots jsonb:=''[]''; r record; result jsonb; qty integer; total_after integer; wanted integer; v_purchase_id uuid; purchase_total numeric:=0; item jsonb; cost numeric;
begin
  perform public.tenh_barcode_enter_business_v3(p_business); -- v3 entry precedes original locks; original permissions/revisions remain.

 b:=tenh_request_branch(p_business);
 if b is null then raise exception ''Choose an operating branch.''; end if;
 perform tenh_assert_plan_branch(p_business,b);
 if exists(select 1 from public.business_locations where id=b and plan_disable_pending) then raise exception ''This branch is closing after a plan change.'';end if;
 if p_operation=''create_purchase'' then perform public.tenh_assert_effective_permission(p_business,''purchases.create'');
 elsif p_operation=''cancel_purchase'' then perform public.tenh_assert_effective_permission(p_business,''purchases.cancel'');
 elsif p_operation=''receive_purchase_order'' then perform public.tenh_assert_effective_permission(p_business,''purchases.update'');
 elsif p_operation=''cancel_order'' or p_operation=''reject_online'' then perform public.tenh_assert_effective_permission(p_business,''orders.cancel'');
 elsif p_operation=''return_order'' then perform public.tenh_assert_effective_permission(p_business,''orders.return'');
 else raise exception ''Unsupported stock operation.''; end if;
 if p_operation=''create_purchase'' then
  if jsonb_typeof(p_payload->''p_items'') is distinct from ''array'' then raise exception ''Add purchased products.''; end if;
  for item in select value from jsonb_array_elements(p_payload->''p_items'') loop
   qty:=(item->>''quantity'')::integer; cost:=(item->>''unit_cost'')::numeric;
   if qty is null or qty<=0 or (item->>''quantity'')::numeric<>qty or cost is null or cost::text in (''NaN'',''Infinity'',''-Infinity'') or cost<0 or cost<>round(cost,2) then raise exception ''Enter positive whole quantities and valid unit costs.''; end if;
   purchase_total:=purchase_total+qty*cost;
  end loop;
  select array_agg(distinct (value->>''product_id'')::uuid) into ids from jsonb_array_elements(p_payload->''p_items'');
  if cardinality(ids)<>jsonb_array_length(p_payload->''p_items'') then raise exception ''Each product can appear only once.''; end if;
 elsif p_operation=''cancel_purchase'' then
  select to_jsonb(p) into doc from purchases p where id=(p_payload->>''p_purchase_id'')::uuid and business_id=p_business and location_id=b for update;
  select array_agg(distinct product_id) into ids from purchase_items where purchase_id=(doc->>''id'')::uuid;
 elsif p_operation=''receive_purchase_order'' then
  select to_jsonb(p) into doc from purchase_orders p where id=(p_payload->>''p_purchase_order_id'')::uuid and business_id=p_business and location_id=b for update;
  select array_agg(distinct product_id) into ids from purchase_order_items where purchase_order_id=(doc->>''id'')::uuid;
 else
  select to_jsonb(o) into doc from orders o where id=(p_payload->>''p_order_id'')::uuid and business_id=p_business and location_id=b for update;
  if p_operation=''reject_online'' and (doc->>''order_source'' not in (''online'',''qr'') or doc->>''online_status'' in (''completed'',''rejected'')) then raise exception ''Online order cannot be rejected.''; end if;
  select array_agg(distinct product_id) into ids from order_items where order_id=(doc->>''id'')::uuid;
 end if;
 if p_operation=''create_purchase'' then
  if exists(select 1 from unnest(ids) product_id where not exists(select 1 from public.branch_products p where p.id=product_id and p.business_id=p_business and p.is_active)) then raise exception ''Choose active products assigned to this branch.'';end if;
 end if;
 if p_operation<>''create_purchase'' and doc is null then raise exception ''Document not found in this branch.''; end if;
 if p_operation=''return_order'' then perform id from cash_register_shifts where business_id=p_business and location_id=b and status=''open'' for update; end if;
 if ids is null or cardinality(ids)=0 or cardinality(ids)>1000 then raise exception ''No valid products for this stock operation.''; end if;
 for r in select id,stock_quantity from products where business_id=p_business and id=any(ids) order by id for update loop
  select quantity into qty from product_location_stock where business_id=p_business and location_id=b and product_id=r.id for update;
  snapshots:=snapshots||jsonb_build_object(''id'',r.id,''global'',r.stock_quantity,''branch'',coalesce(qty,0));
 end loop;
 if jsonb_array_length(snapshots)<>cardinality(ids) then raise exception ''Product does not belong to this business.''; end if;
 case p_operation
 when ''create_purchase'' then
  -- The legacy purchase overloads do not persist line items. Save the complete
  -- purchase and stock ledger here, in the same locked branch transaction.
  insert into purchases(business_id,location_id,owner_id,purchase_number,supplier_id,supplier_name,reference_number,purchase_date,notes,status,subtotal,total)
   values(p_business,b,auth.uid(),''PUR-''||upper(replace(gen_random_uuid()::text,''-'','''')),(p_payload->>''p_supplier_id'')::uuid,
    (select name from suppliers where id=(p_payload->>''p_supplier_id'')::uuid and business_id=p_business and location_id=b),
    nullif(trim(p_payload->>''p_reference_number''),''''),coalesce((p_payload->>''p_purchase_date'')::date,current_date),nullif(trim(p_payload->>''p_notes''),''''),''received'',purchase_total,purchase_total)
   returning id into v_purchase_id;
  for item in select value from jsonb_array_elements(p_payload->''p_items'') loop
   qty:=(item->>''quantity'')::integer; cost:=(item->>''unit_cost'')::numeric;
   insert into purchase_items(owner_id,purchase_id,product_id,product_name,quantity,unit_cost,subtotal)
    select auth.uid(),v_purchase_id,id,name,qty,cost,qty*cost from public.branch_products where id=(item->>''product_id'')::uuid and business_id=p_business;
   update products set stock_quantity=stock_quantity+qty,updated_at=now() where id=(item->>''product_id'')::uuid and business_id=p_business returning stock_quantity into total_after;
   insert into inventory_movements(business_id,owner_id,product_id,movement_type,quantity,stock_before,stock_after,note)
    values(p_business,auth.uid(),(item->>''product_id'')::uuid,''stock_in'',qty,total_after-qty,total_after,''Purchase received: ''||v_purchase_id::text);
  end loop;
  result:=to_jsonb(v_purchase_id);
 when ''cancel_purchase'' then
  if doc->>''status'' is distinct from ''received'' then raise exception ''Only received purchases can be cancelled.''; end if;
  if nullif(trim(p_payload->>''p_reason''),'''') is null then raise exception ''Cancellation reason is required.''; end if;
  for r in select product_id,sum(quantity)::integer quantity from purchase_items where purchase_items.purchase_id=(doc->>''id'')::uuid group by product_id loop
   update products set stock_quantity=stock_quantity-r.quantity,updated_at=now() where id=r.product_id and business_id=p_business returning stock_quantity into total_after;
   insert into inventory_movements(business_id,owner_id,product_id,movement_type,quantity,stock_before,stock_after,note)
    values(p_business,auth.uid(),r.product_id,''purchase_cancelled'',r.quantity,total_after+r.quantity,total_after,''Purchase cancelled: ''||(doc->>''purchase_number'')||''. ''||(p_payload->>''p_reason''));
  end loop;
  update purchases set status=''cancelled'',cancellation_reason=trim(p_payload->>''p_reason''),cancelled_at=now(),updated_at=now() where id=(doc->>''id'')::uuid and business_id=p_business;
 when ''receive_purchase_order'' then perform public.receive_purchase_order(p_purchase_order_id=>(p_payload->>''p_purchase_order_id'')::uuid,p_receipts=>p_payload->''p_receipts'');
 when ''return_order'' then select public.tenh_create_order_return_accounted(p_order_id=>(p_payload->>''p_order_id'')::uuid,p_reason=>p_payload->>''p_reason'',p_items=>p_payload->''p_items'',p_refund_method=>p_payload->>''p_refund_method'') into result;
 else perform public.cancel_order(p_order_id=>(p_payload->>''p_order_id'')::uuid,p_reason=>p_payload->>''p_reason'');
 end case;
 for r in select value as item from jsonb_array_elements(snapshots) loop
  select stock_quantity into total_after from products where id=(r.item->>''id'')::uuid and business_id=p_business;
  wanted:=(r.item->>''branch'')::integer+total_after-(r.item->>''global'')::integer;
  if wanted<0 then raise exception ''Not enough stock in this branch. Stock in other branches cannot be used.''; end if;
  insert into product_location_stock(business_id,location_id,product_id,quantity) values(p_business,b,(r.item->>''id'')::uuid,wanted)
    on conflict(location_id,product_id) do update set quantity=excluded.quantity,updated_at=now();
  if (select coalesce(sum(quantity),0) from product_location_stock where business_id=p_business and product_id=(r.item->>''id'')::uuid)>total_after then raise exception ''Branch stock exceeds total stock. Reconcile inventory first.''; end if;
 end loop;
 return coalesce(result,''{}''::jsonb);
end ');
 end if;
end $patch$;
-- tenh_cancel_order_item: tests/fixtures/order-safety-live-20261008.json
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.tenh_cancel_order_item(uuid,uuid,uuid,timestamp with time zone,text)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.tenh_cancel_order_item(uuid,uuid,uuid,timestamp with time zone,text)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: tenh_cancel_order_item';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.tenh_cancel_order_item(uuid,uuid,uuid,timestamp with time zone,text)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'d6cb0965194041cf656e1eaad92998f2' then raise exception 'Reviewed writer body differs: tenh_cancel_order_item';end if;
  source:=pg_get_functiondef('public.tenh_cancel_order_item(uuid,uuid,uuid,timestamp with time zone,text)'::regprocedure);
  execute replace(source,body,'
declare
  sale public.orders%rowtype;
  line public.order_items%rowtype;
  product public.products%rowtype;
  before_stock integer;
  remaining integer;
  reason text := nullif(btrim(p_reason),'''');
begin
  perform public.tenh_barcode_enter_business_v3(p_business_id); -- v3 entry precedes original locks; original permissions/revisions remain.

  perform public.tenh_assert_effective_permission(p_business_id,''orders.cancel'');
  if reason is null or length(reason)>500 then raise exception ''Enter a cancellation reason (1–500 characters).''; end if;
  select location_id into sale.location_id from public.orders where id=p_order_id and business_id=p_business_id;
  if sale.location_id is null or public.tenh_request_branch(p_business_id) is distinct from sale.location_id then
    raise exception ''Switch to the order branch before cancelling an item.'' using errcode=''42501'';
  end if;
  perform public.tenh_lock_checkout_branch(p_business_id,sale.location_id);
  select * into sale from public.orders where id=p_order_id and business_id=p_business_id for update;
  if not found or sale.archived_at is not null then raise exception ''Order not found.''; end if;
  if sale.updated_at is distinct from p_expected_updated_at then
    raise exception ''This order changed. Refresh before cancelling an item.'' using errcode=''40001'';
  end if;
  if sale.order_source not in (''online'',''qr'') or sale.status not in (''new'',''pending'',''in_progress'')
    or sale.pos_checkout is not null or sale.amount_paid<>0 or sale.change_amount<>0
    or sale.payment_status in (''paid'',''refunded'',''pending_verification'')
    or nullif(sale.payment_reference,'''') is not null or sale.payment_method=''credit''
    or coalesce(sale.credit_amount,0)<>0 or coalesce(sale.loyalty_points_earned,0)<>0
    or coalesce(sale.discount,0)<>0 or coalesce(sale.coupon_discount,0)<>0
    or sale.coupon_id is not null or sale.remaining_balance is distinct from sale.total or sale.total is distinct from sale.subtotal+coalesce(sale.delivery_fee,0)
    or exists(select 1 from public.returns where order_id=sale.id and business_id=p_business_id) then
    raise exception ''This order has payment or pricing history. Use Return items / check refund, or cancel the whole unpaid order.'';
  end if;
  select * into line from public.order_items where id=p_item_id and order_id=p_order_id for update;
  if not found then raise exception ''This item was already removed. Refresh the order.''; end if;
  if line.product_id is null then raise exception ''This item needs manual review before stock can be restored.''; end if;
  select * into product from public.products where id=line.product_id and business_id=p_business_id for update;
  if not found or product.product_type=''bundle'' then
    raise exception ''Bundle or unavailable product stock needs a full order cancellation.'';
  end if;
  select count(*) into remaining from public.order_items where order_id=p_order_id;
  if remaining=1 then
    perform public.tenh_run_branch_stock(p_business_id,''cancel_order'',
      jsonb_build_object(''p_order_id'',p_order_id,''p_reason'',reason));
    update public.orders set online_status=''rejected'',updated_at=clock_timestamp() where id=p_order_id;
  else
    select quantity into before_stock from public.product_location_stock
      where business_id=p_business_id and location_id=sale.location_id and product_id=line.product_id for update;
    if not found then raise exception ''Branch stock is unavailable; nothing was cancelled.''; end if;
    update public.products set stock_quantity=stock_quantity+line.quantity,updated_at=clock_timestamp()
      where id=line.product_id and business_id=p_business_id;
    update public.product_location_stock set quantity=quantity+line.quantity,updated_at=clock_timestamp()
      where business_id=p_business_id and location_id=sale.location_id and product_id=line.product_id;
    insert into public.inventory_movements(business_id,owner_id,product_id,order_id,movement_type,quantity,stock_before,stock_after,note)
      values(p_business_id,auth.uid(),line.product_id,p_order_id,''order_cancelled'',line.quantity,before_stock,before_stock+line.quantity,
        ''Item cancelled: ''||reason);
    delete from public.order_items where id=line.id and order_id=p_order_id;
    update public.orders set subtotal=subtotal-line.subtotal,total=total-line.subtotal,
      remaining_balance=remaining_balance-line.subtotal,updated_at=clock_timestamp() where id=p_order_id;
  end if;
  insert into public.audit_logs(business_id,user_id,action,entity_type,entity_id,description,metadata)
    values(p_business_id,auth.uid(),''cancel'',''order'',p_order_id,
      ''Cancelled item ''||line.product_name||'' on order ''||sale.order_number,
      jsonb_build_object(''itemId'',line.id,''productId'',line.product_id,''quantity'',line.quantity,
        ''subtotal'',line.subtotal,''reason'',reason,''wholeOrder'',remaining=1));
  return jsonb_build_object(''orderId'',p_order_id,''itemId'',p_item_id,''wholeOrder'',remaining=1);
end ');
 end if;
end $patch$;
-- tenh_manage_order: tests/fixtures/order-safety-live-20261008.json
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.tenh_manage_order(uuid,uuid,timestamp with time zone,text,jsonb)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.tenh_manage_order(uuid,uuid,timestamp with time zone,text,jsonb)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: tenh_manage_order';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.tenh_manage_order(uuid,uuid,timestamp with time zone,text,jsonb)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'1e17e16f6406b3b18ca8801dd0d8db77' then raise exception 'Reviewed writer body differs: tenh_manage_order';end if;
  source:=pg_get_functiondef('public.tenh_manage_order(uuid,uuid,timestamp with time zone,text,jsonb)'::regprocedure);
  execute replace(source,body,'
declare
  v_user uuid := auth.uid(); v_role text; v_business jsonb;
  v_order public.orders%rowtype; v_next text; v_reason text;
  v_paid_history boolean; v_is_online boolean; v_edit_contact boolean;
  v_metadata jsonb; v_description text; v_audit_action public.audit_logs.action%type := ''update'';
begin
  perform public.tenh_barcode_enter_business_v3(p_business_id); -- v3 entry precedes original locks; original permissions/revisions remain.

  if v_user is null then raise exception ''Please sign in again.'' using errcode=''42501''; end if;
  select m.role::text into v_role from public.business_members m
    where m.business_id=p_business_id and m.user_id=v_user and m.is_active=true;
  if v_role is null or v_role not in (''owner'',''admin'',''manager'',''cashier'') then
    raise exception ''You do not have permission to manage these orders.'' using errcode=''42501'';
  end if;
  select to_jsonb(b) into v_business from public.businesses b where b.id=p_business_id;
  if v_business is null or coalesce((v_business->>''is_active'')::boolean,true)=false
    or coalesce(v_business->>''subscription_status'','''') in (''expired'',''trial_pending'',''trial_blocked'')
    or (nullif(v_business->>''subscription_expires_at'','''') is not null and (v_business->>''subscription_expires_at'')::timestamptz<=now())
    or (v_business->>''subscription_status''=''trialing'' and nullif(v_business->>''trial_expires_at'','''') is not null and (v_business->>''trial_expires_at'')::timestamptz<=now()) then
    raise exception ''The business subscription does not allow changes.'' using errcode=''42501'';
  end if;
  if p_action not in (''edit'',''status'',''delete'') then raise exception ''Invalid order action.''; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>''object'' then raise exception ''Invalid order data.''; end if;

  select * into v_order from public.orders o where o.id=p_order_id and o.business_id=p_business_id for update;
  if not found or v_order.archived_at is not null then raise exception ''Order not found. Refresh the list.''; end if;
  if v_order.updated_at is distinct from p_expected_updated_at then
    raise exception ''This order changed since you opened it. Refresh and try again.'' using errcode=''PT409'';
  end if;
  v_is_online := coalesce(v_order.order_source,''pos'') in (''online'',''qr'');
  v_paid_history := coalesce(v_order.amount_paid,0)>0
    or coalesce(v_order.payment_status::text,'''') in (''paid'',''refunded'',''pending_verification'')
    or nullif(v_order.payment_reference,'''') is not null or v_order.payment_method::text=''credit''
    or coalesce((to_jsonb(v_order)->>''credit_amount'')::numeric,0)>0
    or coalesce(v_order.loyalty_points_earned,0)>0
    or exists(select 1 from public.returns r where r.order_id=p_order_id and r.business_id=p_business_id);

  if p_action=''edit'' then
    if exists(select 1 from jsonb_object_keys(p_payload) k where k not in (''note'',''guestName'',''guestPhone'',''guestAddress'')) then
      raise exception ''Only notes and guest contact details can be edited here.'';
    end if;
    if exists(select 1 from jsonb_each(p_payload) e where jsonb_typeof(e.value) not in (''string'',''null'')) then
      raise exception ''Contact fields and notes must be text.'';
    end if;
    if length(coalesce(p_payload->>''note'',''''))>1000 or length(coalesce(p_payload->>''guestName'',''''))>120
      or length(coalesce(p_payload->>''guestPhone'',''''))>60 or length(coalesce(p_payload->>''guestAddress'',''''))>500 then
      raise exception ''One or more fields are too long.'';
    end if;
    v_edit_contact := v_order.customer_id is null and v_order.status::text in (''new'',''pending'',''in_progress'');
    if not v_edit_contact and (p_payload ? ''guestName'' or p_payload ? ''guestPhone'' or p_payload ? ''guestAddress'') then
      raise exception ''Customer details are locked on this order. Only its note can be edited.'';
    end if;
    if v_edit_contact and v_is_online and (
      (p_payload ? ''guestName'' and nullif(btrim(p_payload->>''guestName''),'''') is null) or
      (p_payload ? ''guestPhone'' and nullif(btrim(p_payload->>''guestPhone''),'''') is null) or
      (v_order.fulfillment_type=''delivery'' and p_payload ? ''guestAddress'' and nullif(btrim(p_payload->>''guestAddress''),'''') is null)
    ) then raise exception ''Name, phone, and a delivery address (for delivery) are required.''; end if;
    update public.orders set
      customer_note=case when p_payload ? ''note'' then nullif(btrim(p_payload->>''note''),'''') else customer_note end,
      guest_name=case when v_edit_contact and p_payload ? ''guestName'' then nullif(btrim(p_payload->>''guestName''),'''') else guest_name end,
      guest_phone=case when v_edit_contact and p_payload ? ''guestPhone'' then nullif(btrim(p_payload->>''guestPhone''),'''') else guest_phone end,
      guest_address=case when v_edit_contact and p_payload ? ''guestAddress'' then nullif(btrim(p_payload->>''guestAddress''),'''') else guest_address end,
      updated_at=clock_timestamp()
    where id=p_order_id and business_id=p_business_id;
    v_description := ''Edited details for order ''||v_order.order_number;
    v_metadata := jsonb_build_object(''fields'',(select jsonb_agg(k) from jsonb_object_keys(p_payload) k));

  elsif p_action=''delete'' then
    if v_role not in (''owner'',''admin'',''manager'') then raise exception ''You do not have permission to delete orders.'' using errcode=''42501''; end if;
    if v_order.status::text not in (''new'',''pending'',''in_progress'',''cancelled'') or v_paid_history then
      raise exception ''Paid, completed, refunded, credit, and return-linked orders cannot be deleted. Use the return/refund workflow.'';
    end if;
    v_reason := nullif(btrim(p_payload->>''reason''),'''');
    if v_reason is null or length(v_reason)>500 then raise exception ''Enter a deletion reason (1–500 characters).''; end if;
    if v_order.status::text<>''cancelled'' then
      -- Preserve compatibility with the existing cancel_order body if it does
      -- not pin its own search_path. No client-controlled schema is included.
      perform pg_catalog.set_config(''search_path'',''pg_catalog, public, pg_temp'',true);
      perform public.cancel_order(p_order_id, v_reason);
      perform pg_catalog.set_config(''search_path'','''',true);
      if not exists(select 1 from public.orders where id=p_order_id and business_id=p_business_id and status::text=''cancelled'') then
        raise exception ''Cancellation did not finish. The order was not deleted.'';
      end if;
    end if;
    update public.orders set archived_at=clock_timestamp(),archived_by=v_user,
      online_status=case when v_is_online then ''rejected'' else online_status end,updated_at=clock_timestamp()
      where id=p_order_id and business_id=p_business_id;
    v_audit_action := ''delete''; v_description := ''Deleted unpaid order ''||v_order.order_number||'' from the Orders list'';
    v_metadata := jsonb_build_object(''reason'',v_reason,''soft_delete'',true,''previous_status'',v_order.status,''stock_restored'',v_order.status::text<>''cancelled'');

  else
    v_next := coalesce(p_payload->>''status'','''');
    if v_order.status::text in (''completed'',''cancelled'',''refunded'') then
      raise exception ''Finalized orders cannot be reopened or relabelled. Use the return/refund workflow.'';
    end if;
    if v_next=''cancelled'' then
      if v_role not in (''owner'',''admin'',''manager'') then raise exception ''You do not have permission to cancel orders.'' using errcode=''42501''; end if;
      if v_paid_history then raise exception ''This order has financial history. Use the return/refund workflow to preserve its records.''; end if;
      v_reason := nullif(btrim(p_payload->>''reason''),'''');
      if v_reason is null or length(v_reason)>500 then raise exception ''Enter a cancellation reason (1–500 characters).''; end if;
      perform pg_catalog.set_config(''search_path'',''pg_catalog, public, pg_temp'',true);
      perform public.cancel_order(p_order_id,v_reason);
      perform pg_catalog.set_config(''search_path'','''',true);
      if not exists(select 1 from public.orders where id=p_order_id and business_id=p_business_id and status::text=''cancelled'') then
        raise exception ''Cancellation did not finish. Please refresh.'';
      end if;
      update public.orders set online_status=case when v_is_online then ''rejected'' else online_status end,updated_at=clock_timestamp()
        where id=p_order_id and business_id=p_business_id;
      v_audit_action := ''cancel'';
    elsif v_is_online then
      if not (
        (coalesce(v_order.online_status,''new'')=''new'' and v_next=''accepted'') or
        (v_order.online_status=''accepted'' and v_next=''preparing'') or
        (v_order.online_status=''preparing'' and v_next in (''ready'',''completed'')) or
        (v_order.online_status=''ready'' and v_next=''completed'')
      ) then raise exception ''Invalid online order transition. Use Accept → Preparing → Ready → Complete.''; end if;
      update public.orders set online_status=(jsonb_populate_record(null::public.orders,jsonb_build_object(''online_status'',v_next))).online_status,
        status=(jsonb_populate_record(null::public.orders,jsonb_build_object(''status'',case when v_next=''completed'' then ''completed'' else ''pending'' end))).status,updated_at=clock_timestamp()
        where id=p_order_id and business_id=p_business_id;
    else
      if not ((v_order.status::text=''new'' and v_next=''pending'') or
        (v_order.status::text=''pending'' and v_next=''in_progress'') or (v_order.status::text=''in_progress'' and v_next=''completed'')) then raise exception ''Invalid order status transition.''; end if;
      update public.orders set status=(jsonb_populate_record(null::public.orders,jsonb_build_object(''status'',v_next))).status,updated_at=clock_timestamp() where id=p_order_id and business_id=p_business_id;
    end if;
    v_description := ''Changed order ''||v_order.order_number||'' to ''||v_next;
    v_metadata := jsonb_build_object(''previous_status'',v_order.status,''previous_online_status'',v_order.online_status,''new_status'',v_next,''reason'',v_reason);
  end if;

  -- The action, stock restoration, and audit entry commit/roll back together.
  insert into public.audit_logs(business_id,user_id,action,entity_type,entity_id,description,metadata)
    values(p_business_id,v_user,v_audit_action,''order'',p_order_id,v_description,v_metadata);
  return jsonb_build_object(''id'',p_order_id,''action'',p_action);
end;
');
 end if;
end $patch$;
-- tenh_incoming_order_action: tests/fixtures/order-safety-callers-live-20261008.json
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.tenh_incoming_order_action(uuid,uuid,text,text,text)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.tenh_incoming_order_action(uuid,uuid,text,text,text)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: tenh_incoming_order_action';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.tenh_incoming_order_action(uuid,uuid,text,text,text)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'135982da7c0bd51b17084ea299fa086d' then raise exception 'Reviewed writer body differs: tenh_incoming_order_action';end if;
  source:=pg_get_functiondef('public.tenh_incoming_order_action(uuid,uuid,text,text,text)'::regprocedure);
  execute replace(source,body,'
declare b uuid; target public.orders%rowtype; result jsonb;
begin
  perform public.tenh_barcode_enter_business_v3(p_business); -- v3 entry precedes original locks; original permissions/revisions remain.

 perform public.tenh_assert_effective_permission(p_business,''orders.view'');
 perform public.tenh_assert_effective_permission(p_business,case when p_action=''status'' and p_status=''rejected'' then ''orders.cancel'' else ''orders.update'' end);
 b:=public.tenh_request_branch(p_business);
 select * into target from public.orders where id=p_order and business_id=p_business and order_source in (''online'',''qr'');
 if not found or b is null then raise exception ''Online order not found.'';end if;
 if target.location_id is distinct from b then
   if target.order_source <> ''online'' or not public.tenh_receive_all_online_orders(p_business) then raise exception ''This order belongs to another branch.'' using errcode=''42501'';end if;
   perform set_config(''tenh.online_order_scope'',p_order::text,true);
 end if;
 perform public.tenh_lock_checkout_branch(p_business,target.location_id);
 if exists(select 1 from public.business_locations where id=target.location_id and plan_disable_pending) then raise exception ''This branch is closing.'';end if;
 if p_action=''status'' then
   result:=public.tenh_update_online_order_status(p_business,p_order,p_status,p_expected);
 elsif p_action=''payment'' then
   select * into target from public.orders where id=p_order and business_id=p_business for update;
   if p_status is null or p_status not in (''pending_verification'',''paid'',''unpaid'') or target.payment_method<>''khqr'' then raise exception ''Invalid KHQR payment status.'';end if;
   if target.status in (''cancelled'',''refunded'') then raise exception ''A cancelled or returned order cannot be marked paid.'';end if;
   if target.payment_status is distinct from p_status then
     if target.payment_status is distinct from p_expected then raise exception ''Payment changed. Refresh before updating.'';end if;
     if target.payment_status=''paid'' then raise exception ''Use the refund workflow to reverse a recorded payment.'';end if;
     update public.orders set payment_status=p_status,amount_paid=case when p_status=''paid'' then total else 0 end,
       remaining_balance=case when p_status=''paid'' then 0 else total end,change_amount=0,updated_at=now()
       where id=p_order and business_id=p_business;
   end if;
   result:=jsonb_build_object(''orderId'',p_order,''paymentStatus'',p_status);
 else raise exception ''Invalid order action.'';end if;
 perform set_config(''tenh.online_order_scope'','''',true);
 return result;
end');
 end if;
end $patch$;
-- tenh_update_online_order_status: tests/fixtures/order-safety-live-20261008.json
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.tenh_update_online_order_status(uuid,uuid,text,text)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.tenh_update_online_order_status(uuid,uuid,text,text)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: tenh_update_online_order_status';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.tenh_update_online_order_status(uuid,uuid,text,text)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'72c237402afe6c18e9b8bcf87469ca51' then raise exception 'Reviewed writer body differs: tenh_update_online_order_status';end if;
  source:=pg_get_functiondef('public.tenh_update_online_order_status(uuid,uuid,text,text)'::regprocedure);
  execute replace(source,body,'
DECLARE v_order public.orders%rowtype; v_branch uuid; v_current text; v_level integer; v_next_level integer; v_next_order_status public.orders.status%type; v_next_online_status public.orders.online_status%type;
BEGIN
  perform public.tenh_barcode_enter_business_v3(p_business); -- v3 entry precedes original locks; original permissions/revisions remain.

  IF p_status=''rejected'' THEN
    PERFORM public.tenh_assert_effective_permission(p_business,''orders.cancel'');
  ELSE
    PERFORM public.tenh_assert_effective_permission(p_business,''orders.update'');
  END IF;
  IF p_status IS NULL OR p_status NOT IN (''accepted'',''preparing'',''ready'',''completed'',''rejected'') THEN RAISE EXCEPTION ''Invalid online order status.''; END IF;
  v_branch := public.tenh_request_branch(p_business);
  IF v_branch IS NULL THEN RAISE EXCEPTION ''Choose an operating branch.''; END IF;
  PERFORM public.tenh_lock_checkout_branch(p_business,v_branch);
  SELECT * INTO v_order FROM public.orders WHERE id=p_order AND business_id=p_business AND location_id=v_branch AND order_source IN (''online'',''qr'') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION ''Online order not found in this branch.''; END IF;
  v_current := coalesce(v_order.online_status,''new'');
  IF v_current=p_status AND ((p_status=''rejected'' AND v_order.status=''cancelled'') OR (p_status=''completed'' AND v_order.status=''completed'')
     OR (p_status NOT IN (''completed'',''rejected'') AND v_order.status=''pending'')) THEN
    RETURN jsonb_build_object(''orderId'',v_order.id,''orderNumber'',v_order.order_number,''onlineStatus'',p_status,''alreadyApplied'',true);
  END IF;
  IF v_order.status IN (''cancelled'',''refunded'',''completed'') OR v_current IN (''completed'',''rejected'') THEN RAISE EXCEPTION ''A finalized order cannot be changed.''; END IF;
  IF p_expected_status IS NOT NULL AND p_expected_status IS DISTINCT FROM v_current THEN
    RAISE EXCEPTION ''This order changed. Refresh before updating it again.'' USING ERRCODE=''40001'';
  END IF;
  v_level := CASE v_current WHEN ''new'' THEN 0 WHEN ''accepted'' THEN 1 WHEN ''preparing'' THEN 2 WHEN ''ready'' THEN 3 ELSE -1 END;
  v_next_level := CASE p_status WHEN ''accepted'' THEN 1 WHEN ''preparing'' THEN 2 WHEN ''ready'' THEN 3 WHEN ''completed'' THEN 4 ELSE 5 END;
  IF v_level<0 OR (p_status<>''rejected'' AND v_next_level<=v_level) THEN RAISE EXCEPTION ''Choose a forward order status.''; END IF;
  IF p_status=''rejected'' THEN
    IF greatest(0,coalesce(v_order.amount_paid,0)-coalesce(v_order.change_amount,0))>0
      OR (v_order.payment_status=''paid'' AND coalesce(v_order.total,0)>0) THEN
      RAISE EXCEPTION ''This order has a recorded payment. Use the refund workflow before cancellation; rejection does not refund money.'';
    END IF;
    PERFORM public.tenh_run_branch_stock(p_business,''reject_online'',jsonb_build_object(''p_order_id'',p_order,''p_reason'',''Online order rejected by shop''));
  END IF;
  v_next_online_status := p_status;
  IF p_status=''completed'' THEN v_next_order_status := ''completed'';
  ELSIF p_status=''rejected'' THEN v_next_order_status := ''cancelled'';
  ELSE v_next_order_status := ''pending''; END IF;
  UPDATE public.orders SET online_status=v_next_online_status,status=v_next_order_status,updated_at=clock_timestamp()
    WHERE id=p_order AND business_id=p_business AND location_id=v_branch;
  IF NOT FOUND THEN RAISE EXCEPTION ''The online order status could not be saved.''; END IF;
  RETURN jsonb_build_object(''orderId'',v_order.id,''orderNumber'',v_order.order_number,''onlineStatus'',p_status,''alreadyApplied'',false);
END;
');
 end if;
end $patch$;
-- assign_pos_order_to_location: tests/fixtures/order-safety-dependencies-live-20261008.json
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.assign_pos_order_to_location(uuid,uuid,uuid,uuid)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.assign_pos_order_to_location(uuid,uuid,uuid,uuid)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: assign_pos_order_to_location';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.assign_pos_order_to_location(uuid,uuid,uuid,uuid)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'1780d2764d9cd517053d4987cd4546ad' then raise exception 'Reviewed writer body differs: assign_pos_order_to_location';end if;
  source:=pg_get_functiondef('public.assign_pos_order_to_location(uuid,uuid,uuid,uuid)'::regprocedure);
  execute replace(source,body,'
declare v_item record; v_role text; v_shift public.cash_register_shifts%rowtype;
begin
  perform public.tenh_barcode_enter_business_v3(p_business_id); -- v3 entry precedes original locks; original permissions/revisions remain.

  if auth.uid() is null then raise exception ''Authentication required.''; end if;
  select bm.role::text into v_role from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid() and bm.is_active=true limit 1;
  if v_role is null then raise exception ''Not authorized for this business.''; end if;
  if not exists(select 1 from public.business_locations where id=p_location_id and business_id=p_business_id and is_active=true) then raise exception ''Branch not found.''; end if;
  if not exists(select 1 from public.orders where id=p_order_id and business_id=p_business_id) then raise exception ''Order not found.''; end if;
  if p_shift_id is not null then
    select * into v_shift from public.cash_register_shifts where id=p_shift_id and business_id=p_business_id and location_id=p_location_id and status=''open'';
    if not found then raise exception ''Open register shift does not match this branch.''; end if;
    if v_role=''cashier'' and v_shift.opened_by<>auth.uid() then raise exception ''Cashier shift mismatch.''; end if;
  end if;
  update public.orders set location_id=p_location_id,register_shift_id=p_shift_id where id=p_order_id and business_id=p_business_id;
  for v_item in select oi.product_id,sum(oi.quantity)::integer qty from public.order_items oi join public.products p on p.id=oi.product_id and p.business_id=p_business_id where oi.order_id=p_order_id and oi.product_id is not null group by oi.product_id loop
    insert into public.product_location_stock(business_id,location_id,product_id,quantity) values(p_business_id,p_location_id,v_item.product_id,0) on conflict(location_id,product_id) do nothing;
    update public.product_location_stock set quantity=greatest(0,quantity-v_item.qty),updated_at=now() where business_id=p_business_id and location_id=p_location_id and product_id=v_item.product_id;
  end loop;
end;
');
 end if;
end $patch$;
-- post_customer_credit: tests/fixtures/order-safety-dependencies-live-20261008.json
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.post_customer_credit(uuid,uuid,text,numeric,text,text,uuid)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.post_customer_credit(uuid,uuid,text,numeric,text,text,uuid)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: post_customer_credit';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.post_customer_credit(uuid,uuid,text,numeric,text,text,uuid)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'ed1edb67f2d64e57e1709b156d213a4a' then raise exception 'Reviewed writer body differs: post_customer_credit';end if;
  source:=pg_get_functiondef('public.post_customer_credit(uuid,uuid,text,numeric,text,text,uuid)'::regprocedure);
  execute replace(source,body,'
declare
  v_account public.customer_credit_accounts%rowtype;
  v_new numeric(14,2);
  v_limit numeric(14,2);
  v_role text;
  v_order_total numeric(14,2);
  v_order_credit numeric(14,2);
begin
  perform public.tenh_barcode_enter_business_v3(p_business_id); -- v3 entry precedes original locks; original permissions/revisions remain.

  if auth.uid() is null then raise exception ''Authentication required.''; end if;
  select bm.role::text into v_role from public.business_members bm where bm.business_id=p_business_id and bm.user_id=auth.uid() and bm.is_active=true limit 1;
  if v_role is null then raise exception ''Not authorized for this business.''; end if;
  if coalesce(p_amount,0)<=0 then raise exception ''Amount must be greater than zero.''; end if;
  if p_type not in (''charge'',''payment'',''adjustment_credit'',''adjustment_debit'') then raise exception ''Invalid credit entry type.''; end if;
  if not exists(select 1 from public.customers where id=p_customer_id and business_id=p_business_id) then raise exception ''Customer not found.''; end if;

  if v_role=''cashier'' then
    if p_type<>''charge'' or p_order_id is null then raise exception ''Cashiers can only post credit from a POS sale.''; end if;
    select total,coalesce(credit_amount,0) into v_order_total,v_order_credit from public.orders where id=p_order_id and business_id=p_business_id and customer_id=p_customer_id for update;
    if not found then raise exception ''Credit order not found.''; end if;
    if v_order_credit<>0 then raise exception ''Credit was already posted for this order.''; end if;
    if round(p_amount::numeric,2)<>round(v_order_total::numeric,2) then raise exception ''Credit amount must match the trusted order total.''; end if;
  elsif v_role not in (''owner'',''admin'',''manager'') then
    raise exception ''You do not have permission to update customer credit.'';
  end if;

  insert into public.customer_credit_accounts(business_id,customer_id) values(p_business_id,p_customer_id) on conflict(business_id,customer_id) do nothing;
  select * into v_account from public.customer_credit_accounts where business_id=p_business_id and customer_id=p_customer_id for update;
  v_limit:=coalesce(v_account.credit_limit,0);
  if p_type in (''charge'',''adjustment_debit'') then v_new:=v_account.balance+p_amount; else v_new:=greatest(0,v_account.balance-p_amount); end if;
  if p_type=''charge'' and v_limit>0 and v_new>v_limit then raise exception ''Customer credit limit exceeded.''; end if;
  update public.customer_credit_accounts set balance=round(v_new::numeric,2),updated_at=now() where business_id=p_business_id and customer_id=p_customer_id;
  insert into public.customer_credit_ledger(business_id,customer_id,order_id,entry_type,amount,balance_after,note,reference,created_by)
    values(p_business_id,p_customer_id,p_order_id,p_type,round(p_amount::numeric,2),round(v_new::numeric,2),nullif(btrim(coalesce(p_note,'''')),''''),nullif(btrim(coalesce(p_reference,'''')),''''),auth.uid());
  if p_order_id is not null and p_type=''charge'' then update public.orders set credit_amount=credit_amount+round(p_amount::numeric,2) where id=p_order_id and business_id=p_business_id and customer_id=p_customer_id; end if;
  return jsonb_build_object(''balance'',round(v_new::numeric,2),''creditLimit'',v_limit);
end;
');
 end if;
end $patch$;
-- tenh_create_packed_bundle: tests/fixtures/packed-bundle-functions.json
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.tenh_create_packed_bundle(uuid,uuid,uuid,jsonb)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.tenh_create_packed_bundle(uuid,uuid,uuid,jsonb)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: tenh_create_packed_bundle';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.tenh_create_packed_bundle(uuid,uuid,uuid,jsonb)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'d1108ce5d1d82bab81b5d4364ba597b5' then raise exception 'Reviewed writer body differs: tenh_create_packed_bundle';end if;
  source:=pg_get_functiondef('public.tenh_create_packed_bundle(uuid,uuid,uuid,jsonb)'::regprocedure);
  execute replace(source,body,'
declare r jsonb; p public.products%rowtype; g record; ids uuid[]; selected jsonb; n integer; total_cost numeric:=0;
 bundle_id uuid:=gen_random_uuid(); item_count integer; prior public.bundle_stock_requests%rowtype; digest text:=md5(p_input::text||p_branch_id::text);
begin
  perform public.tenh_barcode_enter_business_v3(p_business_id); -- v3 entry precedes original locks; original permissions/revisions remain.

 perform public.tenh_assert_effective_permission(p_business_id,''products.create'');
 if public.tenh_request_branch(p_business_id) is not null and public.tenh_request_branch(p_business_id)<>p_branch_id then raise exception ''This branch is not assigned to your account.'';end if;
 perform public.tenh_assert_plan_branch(p_business_id,p_branch_id);
 if p_request_id is null or p_input is null or octet_length(p_input::text)>100000 then raise exception ''Invalid bundle request.'';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||p_request_id::text,20260924));
 select * into prior from public.bundle_stock_requests where business_id=p_business_id and request_id=p_request_id;
 if found then
  if prior.user_id<>auth.uid() or prior.payload_hash<>digest then raise exception ''This request was already used. Reload and try again.'';end if;
  return prior.result;
 end if;
 if length(trim(coalesce(p_input->>''name'',''''))) not between 2 and 160 or length(trim(coalesce(p_input->>''sku'',''''))) not between 1 and 100 then raise exception ''Enter a bundle name and SKU.'';end if;
 if coalesce(p_input->>''sellingPrice'','''') !~ ''^\d+(\.\d{1,2})?$'' or (p_input->>''sellingPrice'')::numeric>100000000 then raise exception ''Enter a valid selling price.'';end if;
 if jsonb_typeof(p_input->''items'') is distinct from ''array'' then raise exception ''Choose at least two products.'';end if;
 item_count:=jsonb_array_length(p_input->''items'');
 if item_count not between 2 and 100 or item_count<>(select count(distinct value->>''productId'') from jsonb_array_elements(p_input->''items'')) then raise exception ''Choose 2–100 different products.'';end if;
 if nullif(p_input->>''categoryId'','''') is not null and not exists(select 1 from public.categories where id=(p_input->>''categoryId'')::uuid and business_id=p_business_id) then raise exception ''Choose a category in this business.'';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||lower(trim(p_input->>''sku'')),20260924));
 if exists(select 1 from public.products where business_id=p_business_id and lower(sku)=lower(trim(p_input->>''sku''))) then raise exception ''This SKU is already in use.'';end if;
 perform id from public.products where business_id=p_business_id and id in(select (value->>''productId'')::uuid from jsonb_array_elements(p_input->''items'')) order by id for update;
 insert into public.products(id,business_id,owner_id,name,sku,description,category_id,product_type,bundle_stock_mode,cost_price,selling_price,stock_quantity,low_stock_quantity,is_active,is_online)
 values(bundle_id,p_business_id,auth.uid(),trim(p_input->>''name''),trim(p_input->>''sku''),nullif(p_input->>''description'',''''),nullif(p_input->>''categoryId'','''')::uuid,''bundle'',''packed'',0,(p_input->>''sellingPrice'')::numeric,0,1,true,false);
 for r in select value from jsonb_array_elements(p_input->''items'') loop
  if coalesce(r->>''quantity'','''') !~ ''^\d+$'' or (r->>''quantity'')::numeric not between 1 and 999 then raise exception ''Component quantities must be whole numbers from 1 to 999.'';end if;
  select * into p from public.products where id=(r->>''productId'')::uuid and business_id=p_business_id and is_active and product_type<>''bundle'';
  if not found or not exists(select 1 from public.product_location_stock where product_id=p.id and business_id=p_business_id and location_id=p_branch_id) then raise exception ''Choose active component products assigned to this branch.'';end if;
  if jsonb_typeof(coalesce(r->''optionIds'',''[]''))<>''array'' then raise exception ''Invalid component options.'';end if;
  select coalesce(array_agg(value::uuid),''{}'') into ids from jsonb_array_elements_text(coalesce(r->''optionIds'',''[]''));
  if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception ''Duplicate component options.'';end if;
  if p.product_type<>''configurable'' and cardinality(ids)>0 then raise exception ''This product does not support options.'';end if;
  if cardinality(ids)<>(select count(*) from public.product_options where product_id=p.id and business_id=p_business_id and is_active and id=any(ids)) then raise exception ''A selected option is unavailable.'';end if;
  for g in select * from public.product_option_groups where product_id=p.id and business_id=p_business_id loop
   select count(*) into n from public.product_options where group_id=g.id and id=any(ids);
   if n<greatest(g.min_selections,case when g.is_required then 1 else 0 end) or n>(case when g.selection_type=''single'' then 1 else g.max_selections end) then raise exception ''Choose the required options for %: %.'',p.name,g.name;end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object(''id'',o.id,''name'',o.name,''groupName'',og.name,''priceAdjustment'',o.price_adjustment) order by o.id),''[]'') into selected from public.product_options o join public.product_option_groups og on og.id=o.group_id and og.product_id=p.id where o.id=any(ids);
  if jsonb_array_length(selected)<>cardinality(ids) then raise exception ''An option group is unavailable.'';end if;
  insert into public.bundle_items(business_id,bundle_product_id,component_product_id,quantity,selected_options) values(p_business_id,bundle_id,p.id,(r->>''quantity'')::integer,selected);
  total_cost:=total_cost+p.cost_price*(r->>''quantity'')::integer;
 end loop;
 update public.products set cost_price=total_cost where id=bundle_id;
 insert into public.product_location_stock(business_id,location_id,product_id,quantity,low_stock_threshold) values(p_business_id,p_branch_id,bundle_id,0,1);
 insert into public.audit_logs(business_id,user_id,action,entity_type,entity_id,description,metadata) values(p_business_id,auth.uid(),''create'',''product'',bundle_id,''Created packed bundle'',jsonb_build_object(''branchId'',p_branch_id,''items'',p_input->''items''));
 insert into public.bundle_stock_requests(business_id,request_id,user_id,payload_hash,result) values(p_business_id,p_request_id,auth.uid(),digest,bundle_id);
 return bundle_id;
end;');
 end if;
end $patch$;
-- tenh_pack_bundle: tests/fixtures/packed-bundle-functions.json
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.tenh_pack_bundle(uuid,uuid,uuid,integer,uuid)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.tenh_pack_bundle(uuid,uuid,uuid,integer,uuid)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: tenh_pack_bundle';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.tenh_pack_bundle(uuid,uuid,uuid,integer,uuid)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'53664d3c494c2a889da60f5dd8ced786' then raise exception 'Reviewed writer body differs: tenh_pack_bundle';end if;
  source:=pg_get_functiondef('public.tenh_pack_bundle(uuid,uuid,uuid,integer,uuid)'::regprocedure);
  execute replace(source,body,'
declare r record; before_qty integer; units integer; prior public.bundle_stock_requests%rowtype;
 digest text:=md5(jsonb_build_array(p_branch_id,p_bundle_id,p_quantity)::text); bundle public.products%rowtype;
begin
  perform public.tenh_barcode_enter_business_v3(p_business_id); -- v3 entry precedes original locks; original permissions/revisions remain.

 perform public.tenh_assert_effective_permission(p_business_id,''products.stock_adjust'');
 if public.tenh_request_branch(p_business_id) is not null and public.tenh_request_branch(p_business_id)<>p_branch_id then raise exception ''This branch is not assigned to your account.'';end if;
 perform public.tenh_assert_plan_branch(p_business_id,p_branch_id);
 if p_quantity is null or p_quantity=0 or abs(p_quantity::bigint)>999 or p_request_id is null then raise exception ''Choose 1–999 sets to pack or unpack.'';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||p_request_id::text,20260924));
 select * into prior from public.bundle_stock_requests where business_id=p_business_id and request_id=p_request_id;
 if found then
  if prior.user_id<>auth.uid() or prior.payload_hash<>digest then raise exception ''This request was already used. Reload and try again.'';end if;
  return prior.result;
 end if;
 -- Match POS lock ordering. Lock all products before any branch stock rows.
 perform id from public.products where business_id=p_business_id and (id=p_bundle_id or id in(select component_product_id from public.bundle_items where bundle_product_id=p_bundle_id and business_id=p_business_id)) order by id for update;
 select * into bundle from public.products where business_id=p_business_id and id=p_bundle_id and product_type=''bundle'' and bundle_stock_mode=''packed'';
 if not found or (p_quantity>0 and not bundle.is_active) then raise exception ''Choose an active packed bundle.'';end if;
 if (select count(*) from public.bundle_items where bundle_product_id=p_bundle_id and business_id=p_business_id)<2 then raise exception ''Bundle components are incomplete.'';end if;
 for r in
  select p.id,p.name,p.is_active,p.stock_quantity,-bi.quantity*p_quantity delta from public.bundle_items bi join public.products p on p.id=bi.component_product_id and p.business_id=bi.business_id where bi.bundle_product_id=p_bundle_id and bi.business_id=p_business_id
  union all select bundle.id,bundle.name,bundle.is_active,bundle.stock_quantity,p_quantity
  order by id
 loop
  if p_quantity>0 and not r.is_active then raise exception ''% is inactive.'',r.name;end if;
  select quantity into before_qty from public.product_location_stock where business_id=p_business_id and product_id=r.id and location_id=p_branch_id for update;
  if not found then
   if r.id<>p_bundle_id then raise exception ''% is not assigned to this branch.'',r.name;end if;
   insert into public.product_location_stock(business_id,location_id,product_id,quantity,low_stock_threshold) values(p_business_id,p_branch_id,r.id,0,1);
   before_qty:=0;
  end if;
  units:=before_qty+r.delta;
  if units<0 or r.stock_quantity+r.delta<0 then raise exception ''Not enough % in this branch.'',r.name;end if;
  update public.product_location_stock set quantity=units,updated_at=now() where business_id=p_business_id and product_id=r.id and location_id=p_branch_id;
  update public.products set stock_quantity=stock_quantity+r.delta,updated_at=now() where business_id=p_business_id and id=r.id;
  insert into public.stock_adjustments(business_id,location_id,product_id,adjustment_type,quantity_delta,stock_before,stock_after,reason,reference,created_by)
  values(p_business_id,p_branch_id,r.id,case when r.delta>0 then ''increase'' else ''decrease'' end,r.delta,before_qty,units,case when p_quantity>0 then ''Pack bundle: '' else ''Unpack bundle: '' end||bundle.name,p_request_id::text,auth.uid());
 end loop;
 insert into public.audit_logs(business_id,user_id,action,entity_type,entity_id,description,metadata) values(p_business_id,auth.uid(),''update'',''product'',p_bundle_id,case when p_quantity>0 then ''Packed bundle stock'' else ''Unpacked bundle stock'' end,jsonb_build_object(''branchId'',p_branch_id,''quantity'',p_quantity,''requestId'',p_request_id));
 insert into public.bundle_stock_requests(business_id,request_id,user_id,payload_hash,result) values(p_business_id,p_request_id,auth.uid(),digest,p_bundle_id);
 return p_bundle_id;
end;');
 end if;
end $patch$;
-- tenh_manage_bundle: tests/fixtures/branch-extra-functions.sql
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.tenh_manage_bundle(uuid,uuid,uuid,text,jsonb,timestamp with time zone)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.tenh_manage_bundle(uuid,uuid,uuid,text,jsonb,timestamp with time zone)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: tenh_manage_bundle';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.tenh_manage_bundle(uuid,uuid,uuid,text,jsonb,timestamp with time zone)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'f2afddc95dde3f67efbcb02f54596785' then raise exception 'Reviewed writer body differs: tenh_manage_bundle';end if;
  source:=pg_get_functiondef('public.tenh_manage_bundle(uuid,uuid,uuid,text,jsonb,timestamp with time zone)'::regprocedure);
  execute replace(source,body,'
declare p public.products%rowtype; t text; used boolean;
begin
  perform public.tenh_barcode_enter_business_v3(p_business_id); -- v3 entry precedes original locks; original permissions/revisions remain.

 if p_action is null or p_action not in (''edit'',''pos'',''online'',''delete'') then raise exception ''Choose a valid bundle action.'';end if;
 perform public.tenh_assert_effective_permission(p_business_id,case when p_action=''delete'' then ''products.disable'' else ''products.update'' end);
 if public.tenh_request_branch(p_business_id) is not null and public.tenh_request_branch(p_business_id)<>p_branch_id then raise exception ''This branch is not assigned to your account.'';end if;
 perform public.tenh_assert_plan_branch(p_business_id,p_branch_id);
 perform pg_advisory_xact_lock(hashtextextended(''bundle-recipe:''||p_business_id::text||p_bundle_id::text,20260924));

 -- Match the packer lock order, including both old and proposed component rows.
 perform id from public.products where business_id=p_business_id and (id=p_bundle_id
   or id in(select component_product_id from public.bundle_items where business_id=p_business_id and bundle_product_id=p_bundle_id)
   or id in(select (value->>''productId'')::uuid from jsonb_array_elements(case when jsonb_typeof(p_input->''items'')=''array'' then p_input->''items'' else ''[]''::jsonb end))) order by id for update;
 select * into p from public.products where id=p_bundle_id and business_id=p_business_id and product_type=''bundle'' for update;
 if not found then raise exception ''Bundle not found.'';end if;
 if p.updated_at is distinct from p_expected then raise exception ''This bundle changed. Refresh and try again.'';end if;
 if p_action=''edit'' then
  if length(trim(coalesce(p_input->>''name'',''''))) not between 2 and 160 or length(trim(coalesce(p_input->>''sku'',''''))) not between 1 and 100 then raise exception ''Enter a name and SKU.'';end if;
  if coalesce(p_input->>''price'','''') !~ ''^\d+(\.\d{1,2})?$'' or (p_input->>''price'')::numeric>99999999.99 then raise exception ''Enter a valid price.'';end if;
  if length(coalesce(p_input->>''description'',''''))>2000 then raise exception ''Description must be under 2,000 characters.'';end if;
  if nullif(p_input->>''categoryId'','''') is not null and not exists(select 1 from public.categories where business_id=p_business_id and id=(p_input->>''categoryId'')::uuid) then raise exception ''Choose a category in this business.'';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text||lower(trim(p_input->>''sku'')),20260924));
  if exists(select 1 from public.products where business_id=p_business_id and id<>p_bundle_id and lower(sku)=lower(trim(p_input->>''sku''))) then raise exception ''This SKU is already in use.'';end if;
  update public.products set name=trim(p_input->>''name''),sku=trim(p_input->>''sku''),selling_price=(p_input->>''price'')::numeric,description=nullif(p_input->>''description'',''''),category_id=nullif(p_input->>''categoryId'','''')::uuid,updated_at=clock_timestamp() where id=p.id;
  perform public.tenh_edit_bundle_contents(p_business_id,p_branch_id,p_bundle_id,p_input);
 elsif p_action in (''pos'',''online'') then
  if jsonb_typeof(p_input->''enabled'') is distinct from ''boolean'' then raise exception ''Choose a valid visibility setting.'';end if;

  if p_action=''pos'' then update public.products set is_active=((p_input->>''enabled'')::boolean or coalesce(p.is_online,false)),is_pos=(p_input->>''enabled'')::boolean,updated_at=clock_timestamp() where id=p.id;
  else update public.products set is_active=((p_input->>''enabled'')::boolean or coalesce(p.is_pos,false)),is_online=(p_input->>''enabled'')::boolean,updated_at=clock_timestamp() where id=p.id;end if;
 else
  if p.stock_quantity<>0 or exists(select 1 from public.product_location_stock where product_id=p.id and business_id=p_business_id and quantity<>0) then raise exception ''Unpack or transfer remaining stock before deleting. You can hide this bundle instead.'';end if;
  foreach t in array array[''order_items'',''return_items'',''purchase_items'',''purchase_order_items'',''stock_transfer_items'',''inventory_movements'',''stock_adjustments''] loop
   if exists(select 1 from information_schema.columns where table_schema=''public'' and table_name=t and column_name=''product_id'') then
    execute format(''select exists(select 1 from public.%I where product_id=$1)'',t) into used using p.id;
    if used then raise exception ''This bundle has transaction history. Turn off POS and Online visibility to keep the history safe.'';end if;
   end if;
  end loop;
  if exists(select 1 from public.tenh_pos_holds where business_id=p_business_id and draft::text like ''%''||p.id::text||''%'') then raise exception ''This bundle is in a held sale. Remove it from that sale before deleting.'';end if;
  delete from public.products where id=p.id;
 end if;
 insert into public.audit_logs(business_id,user_id,action,entity_type,entity_id,description,metadata)
 values(p_business_id,auth.uid(),case when p_action=''delete'' then ''delete'' else ''update'' end,''product'',p.id,''Bundle ''||p_action||'': ''||p.name,jsonb_build_object(''branchId'',p_branch_id,''changes'',p_input));
end;');
 end if;
end $patch$;
-- tenh_edit_bundle_contents: supabase/migrations/20260924006000_bundle_edit_and_pos_choices.sql
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.tenh_edit_bundle_contents(uuid,uuid,uuid,jsonb)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.tenh_edit_bundle_contents(uuid,uuid,uuid,jsonb)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: tenh_edit_bundle_contents';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.tenh_edit_bundle_contents(uuid,uuid,uuid,jsonb)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'15fa827060a05fe1ce03649f68baba12' then raise exception 'Reviewed writer body differs: tenh_edit_bundle_contents';end if;
  source:=pg_get_functiondef('public.tenh_edit_bundle_contents(uuid,uuid,uuid,jsonb)'::regprocedure);
  execute replace(source,body,'
declare
  incoming jsonb; existing jsonb; row_input jsonb; component public.products%rowtype;
  option_ids uuid[]; selected jsonb; group_row record; chosen_count integer;
  total_cost numeric := 0; v_table_name text; used boolean; image_path text; v_image_url text;
begin
  perform public.tenh_barcode_enter_business_v3(p_business_id); -- v3 entry precedes original locks; original permissions/revisions remain.

  perform public.tenh_assert_effective_permission(p_business_id, ''products.update'');
  if p_input ? ''items'' then
    if jsonb_typeof(p_input->''items'') is distinct from ''array'' or jsonb_array_length(p_input->''items'') not between 2 and 100 then
      raise exception ''Choose 2–100 different products.'';
    end if;
    select jsonb_agg(jsonb_build_object(''productId'', value->>''productId'', ''quantity'', (value->>''quantity'')::numeric,
      ''optionIds'', (select coalesce(jsonb_agg(o order by o), ''[]'') from jsonb_array_elements_text(coalesce(value->''optionIds'',''[]'')) o)) order by value->>''productId'')
      into incoming from jsonb_array_elements(p_input->''items'');
    select jsonb_agg(jsonb_build_object(''productId'', component_product_id::text, ''quantity'', quantity,
      ''optionIds'', (select coalesce(jsonb_agg(o->>''id'' order by o->>''id''), ''[]'') from jsonb_array_elements(selected_options) o)) order by component_product_id::text)
      into existing from public.bundle_items where business_id=p_business_id and bundle_product_id=p_bundle_id;
    if incoming is distinct from existing then
      if exists(select 1 from public.products where id=p_bundle_id and stock_quantity<>0)
        or exists(select 1 from public.product_location_stock where business_id=p_business_id and product_id=p_bundle_id and quantity<>0) then
        raise exception ''Unpack all sets in every branch before changing the included items.'';
      end if;
      foreach v_table_name in array array[''order_items'',''return_items'',''purchase_items'',''purchase_order_items'',''stock_transfer_items''] loop
        if exists(select 1 from information_schema.columns where table_schema=''public'' and information_schema.columns.table_name=v_table_name and column_name=''product_id'') then
          execute format(''select exists(select 1 from public.%I where product_id=$1)'',v_table_name) into used using p_bundle_id;
          if used then raise exception ''This bundle has sales or transaction history. Create a new bundle for different items; images and details can still be edited.''; end if;
        end if;
      end loop;
      if exists(select 1 from public.tenh_pos_holds where business_id=p_business_id and draft::text like ''%''||p_bundle_id::text||''%'') then
        raise exception ''Remove this bundle from held orders before changing its items.'';
      end if;
      if jsonb_array_length(p_input->''items'')<>(select count(distinct value->>''productId'') from jsonb_array_elements(p_input->''items'')) then
        raise exception ''Choose different products for each item.'';
      end if;
      insert into public.bundle_recipe_edit_sessions values(p_bundle_id,txid_current(),auth.uid());
      delete from public.bundle_items where business_id=p_business_id and bundle_product_id=p_bundle_id;
      for row_input in select value from jsonb_array_elements(p_input->''items'') loop
        if coalesce(row_input->>''quantity'','''') !~ ''^\d+$'' or (row_input->>''quantity'')::numeric not between 1 and 999 then
          raise exception ''Component quantities must be whole numbers from 1 to 999.'';
        end if;
        select * into component from public.products where business_id=p_business_id and id=(row_input->>''productId'')::uuid and is_active and product_type<>''bundle'';
        if not found or not exists(select 1 from public.product_location_stock where business_id=p_business_id and product_id=component.id and location_id=p_branch_id) then
          raise exception ''Choose active component products assigned to this branch.'';
        end if;
        select coalesce(array_agg(value::uuid),''{}'') into option_ids from jsonb_array_elements_text(coalesce(row_input->''optionIds'',''[]''));
        if cardinality(option_ids)<>(select count(distinct x) from unnest(option_ids) x) then raise exception ''Duplicate component options.''; end if;
        if component.product_type<>''configurable'' and cardinality(option_ids)>0 then raise exception ''This product does not support options.''; end if;
        if cardinality(option_ids)<>(select count(*) from public.product_options where product_id=component.id and business_id=p_business_id and is_active and id=any(option_ids)) then raise exception ''A selected option is unavailable.''; end if;
        for group_row in select * from public.product_option_groups where product_id=component.id and business_id=p_business_id loop
          select count(*) into chosen_count from public.product_options where group_id=group_row.id and id=any(option_ids);
          if chosen_count<greatest(group_row.min_selections,case when group_row.is_required then 1 else 0 end)
            or chosen_count>(case when group_row.selection_type=''single'' then 1 else group_row.max_selections end) then
            raise exception ''Choose the required options for %: %.'',component.name,group_row.name;
          end if;
        end loop;
        select coalesce(jsonb_agg(jsonb_build_object(''id'',o.id,''name'',o.name,''groupName'',g.name,''priceAdjustment'',o.price_adjustment) order by o.id),''[]'') into selected
          from public.product_options o join public.product_option_groups g on g.id=o.group_id and g.product_id=component.id where o.id=any(option_ids);
        if jsonb_array_length(selected)<>cardinality(option_ids) then raise exception ''An option group is unavailable.''; end if;
        insert into public.bundle_items(business_id,bundle_product_id,component_product_id,quantity,selected_options)
          values(p_business_id,p_bundle_id,component.id,(row_input->>''quantity'')::integer,selected);
        total_cost:=total_cost+component.cost_price*(row_input->>''quantity'')::integer;
      end loop;
      update public.products set cost_price=total_cost where id=p_bundle_id and business_id=p_business_id;
      delete from public.bundle_recipe_edit_sessions where bundle_id=p_bundle_id and transaction_id=txid_current();
    end if;
  end if;
  if p_input ? ''imagePath'' then
    image_path:=p_input->>''imagePath''; v_image_url:=p_input->>''imageUrl'';
    if image_path is null or v_image_url is null
      or image_path !~ (''^''||p_business_id::text||''/''||auth.uid()::text||''/[0-9a-f-]{36}-[0-9a-f]{64}\.(jpg|png|webp)$'')
      or v_image_url !~ ''^https://[^/]+/storage/v1/object/public/product-images/''
      or right(v_image_url,length(''/storage/v1/object/public/product-images/''||image_path))<>''/storage/v1/object/public/product-images/''||image_path
      or not exists(select 1 from storage.objects where bucket_id=''product-images'' and name=image_path) then raise exception ''Upload a valid bundle image before saving.''; end if;
    update public.products set image_url=v_image_url where id=p_bundle_id and business_id=p_business_id;
  elsif p_input->>''removeImage''=''true'' then
    update public.products set image_url=null where id=p_bundle_id and business_id=p_business_id;
  end if;
end;
');
 end if;
end $patch$;
-- import_branch_inventory_safe: tests/fixtures/branch-import-functions.sql
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.import_branch_inventory_safe(uuid,jsonb)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.import_branch_inventory_safe(uuid,jsonb)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: import_branch_inventory_safe';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.import_branch_inventory_safe(uuid,jsonb)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'bc2af5052c32770fe6700174a4117718' then raise exception 'Reviewed writer body differs: import_branch_inventory_safe';end if;
  source:=pg_get_functiondef('public.import_branch_inventory_safe(uuid,jsonb)'::regprocedure);
  execute replace(source,body,'
declare
  v_user uuid := auth.uid();
  v_item jsonb;
  v_product public.products%rowtype;
  v_location public.business_locations%rowtype;
  v_quantity integer;
  v_threshold integer;
  v_before integer;
  v_after integer;
  v_updated integer := 0;
begin
  perform public.tenh_barcode_enter_business_v3(p_business_id); -- v3 entry precedes original locks; original permissions/revisions remain.

  if v_user is null then
    raise exception ''Authentication required.'';
  end if;

  if not exists (
    select 1 from public.business_members bm
    where bm.business_id = p_business_id
      and bm.user_id = v_user
      and bm.is_active = true
      and bm.role = ''owner''
  ) then
    raise exception ''Only the business owner can import inventory.'';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> ''array'' then
    raise exception ''Inventory import must be a JSON array.'';
  end if;

  if jsonb_array_length(p_rows) = 0 then
    raise exception ''Inventory import is empty.'';
  end if;

  if jsonb_array_length(p_rows) > 1000 then
    raise exception ''Inventory import is limited to 1000 rows.'';
  end if;

  -- Exact tenant mutex is already held; no legacy hash coordinator.

  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    begin
      v_quantity := (v_item->>''quantity'')::integer;
      v_threshold := coalesce(nullif(v_item->>''low_stock_threshold'','''')::integer, 0);
    exception when others then
      raise exception ''Inventory quantity or low-stock threshold is invalid.'';
    end;

    if v_quantity < 0 or v_threshold < 0 then
      raise exception ''Inventory quantities cannot be negative.'';
    end if;

    select * into v_product
    from public.products
    where business_id = p_business_id
      and upper(sku) = upper(btrim(v_item->>''sku''))
    for update;
    if not found then
      raise exception ''Product SKU % was not found in this business.'', v_item->>''sku'';
    end if;

    select * into v_location
    from public.business_locations
    where business_id = p_business_id
      and upper(code) = upper(btrim(v_item->>''branch_code''))
      and is_active = true
    for update;
    if not found then
      raise exception ''Active branch code % was not found in this business.'', v_item->>''branch_code'';
    end if;

    v_before := coalesce(v_product.stock_quantity, 0);

    insert into public.product_location_stock (
      business_id, location_id, product_id, quantity, low_stock_threshold, updated_at
    ) values (
      p_business_id, v_location.id, v_product.id, v_quantity, v_threshold, now()
    )
    on conflict (location_id, product_id)
    do update set
      business_id = excluded.business_id,
      quantity = excluded.quantity,
      low_stock_threshold = excluded.low_stock_threshold,
      updated_at = now();

    select coalesce(sum(pls.quantity), 0)::integer
      into v_after
    from public.product_location_stock pls
    where pls.business_id = p_business_id
      and pls.product_id = v_product.id;

    update public.products
    set stock_quantity = v_after,
        updated_at = now()
    where id = v_product.id
      and business_id = p_business_id;

    if v_before <> v_after then
      insert into public.stock_adjustments (
        business_id, product_id, adjustment_type, quantity_delta,
        stock_before, stock_after, reason, reference, created_by
      ) values (
        p_business_id, v_product.id, ''set'', v_after - v_before,
        v_before, v_after, ''Branch inventory CSV import'',
        ''CSV:'' || v_location.code, v_user
      );
    end if;

    v_updated := v_updated + 1;
  end loop;

  return jsonb_build_object(''updated'', v_updated, ''skipped'', 0);
end;
');
 end if;
end $patch$;
-- tenh_create_packed_bundle_with_image: supabase/migrations/20260924004000_bundle_image.sql
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.tenh_create_packed_bundle_with_image(uuid,uuid,uuid,jsonb)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.tenh_create_packed_bundle_with_image(uuid,uuid,uuid,jsonb)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: tenh_create_packed_bundle_with_image';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.tenh_create_packed_bundle_with_image(uuid,uuid,uuid,jsonb)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'caa2c0c6cb97e3e8e6aff44aeafd3707' then raise exception 'Reviewed writer body differs: tenh_create_packed_bundle_with_image';end if;
  source:=pg_get_functiondef('public.tenh_create_packed_bundle_with_image(uuid,uuid,uuid,jsonb)'::regprocedure);
  execute replace(source,body,'
declare
  v_id uuid;
  v_replay boolean;
  v_path text := p_input->>''imagePath'';
  v_url text := p_input->>''imageUrl'';
begin
  perform public.tenh_barcode_enter_business_v3(p_business_id); -- v3 entry precedes original locks; original permissions/revisions remain.

  perform public.tenh_assert_effective_permission(p_business_id, ''products.create'');
  if v_path is null or v_url is null
    or v_path !~ (''^'' || p_business_id::text || ''/'' || auth.uid()::text || ''/'' || p_request_id::text || ''-[0-9a-f]{64}\.(jpg|png|webp)$'')
    or v_url !~ ''^https://[^/]+/storage/v1/object/public/product-images/''
    or right(v_url, length(''/storage/v1/object/public/product-images/'' || v_path)) <> ''/storage/v1/object/public/product-images/'' || v_path then
    raise exception ''Invalid bundle image.'';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = ''product-images'' and name = v_path) then
    raise exception ''Upload the bundle image before creating the bundle.'';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || p_request_id::text, 20260924));
  select exists(select 1 from public.bundle_stock_requests where business_id = p_business_id and request_id = p_request_id) into v_replay;
  v_id := public.tenh_create_packed_bundle(p_business_id, p_branch_id, p_request_id, p_input);
  if not v_replay then
    update public.products set image_url = v_url where id = v_id and business_id = p_business_id;
  end if;
  return v_id;
end;
');
 end if;
end $patch$;
-- tenh_adjust_branch_stock: supabase/migrations/20260924009000_safe_stock_adjustment.sql
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.tenh_adjust_branch_stock(uuid,uuid,uuid,text,integer,text,text,uuid,integer)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.tenh_adjust_branch_stock(uuid,uuid,uuid,text,integer,text,text,uuid,integer)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: tenh_adjust_branch_stock';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.tenh_adjust_branch_stock(uuid,uuid,uuid,text,integer,text,text,uuid,integer)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'f602c395891766a66c3126dbdfec71ff' then raise exception 'Reviewed writer body differs: tenh_adjust_branch_stock';end if;
  source:=pg_get_functiondef('public.tenh_adjust_branch_stock(uuid,uuid,uuid,text,integer,text,text,uuid,integer)'::regprocedure);
  execute replace(source,body,'
declare
  v_product public.products%rowtype;
  v_before integer;
  v_after integer;
  v_delta integer;
  v_payload jsonb;
  v_saved public.stock_adjustment_requests%rowtype;
  v_result jsonb;
begin
  perform public.tenh_barcode_enter_business_v3(p_business_id); -- v3 entry precedes original locks; original permissions/revisions remain.

  perform public.tenh_assert_effective_permission(p_business_id, ''products.stock_adjust'');
  if p_location_id is null or public.tenh_request_branch(p_business_id) is distinct from p_location_id then
    raise exception ''This stock adjustment is outside your operating branch.'' using errcode = ''42501'';
  end if;
  if p_request_id is null or p_mode is null or p_mode not in (''increase'',''decrease'',''set'')
    or p_quantity is null or p_quantity < 0 or (p_mode <> ''set'' and p_quantity = 0)
    or p_expected_quantity is null or p_expected_quantity < 0
    or p_reason is null or length(btrim(p_reason)) < 2 or length(p_reason) > 650
    or length(p_reference) > 200 then
    raise exception ''Enter a valid quantity, reason and adjustment request.'';
  end if;
  -- All branch stock operations acquire the business lock before product locks.
  perform public.tenh_assert_plan_branch(p_business_id, p_location_id);
  if exists(select 1 from public.business_locations where id = p_location_id and plan_disable_pending) then
    raise exception ''This branch is closing after a plan change.'';
  end if;
  v_payload := jsonb_build_object(''product'',p_product_id,''mode'',p_mode,''quantity'',p_quantity,
    ''reason'',p_reason,''reference'',p_reference,''expected'',p_expected_quantity);
  select * into v_saved from public.stock_adjustment_requests
    where business_id = p_business_id and request_id = p_request_id;
  if found then
    if v_saved.created_by is distinct from auth.uid() or v_saved.location_id is distinct from p_location_id
      or v_saved.payload is distinct from v_payload then
      raise exception ''This adjustment request was already used with different details.'';
    end if;
    return v_saved.result;
  end if;
  select * into v_product from public.products
    where id = p_product_id and business_id = p_business_id and is_active for update;
  if not found then raise exception ''This product is no longer available.''; end if;
  select quantity into v_before from public.product_location_stock
    where business_id = p_business_id and location_id = p_location_id and product_id = p_product_id for update;
  if not found then raise exception ''Assign this product to the branch before adjusting stock.''; end if;
  if p_mode = ''set'' and v_before <> p_expected_quantity then
    raise exception ''Stock changed from % to %. Refresh and check the count before saving again.'',p_expected_quantity,v_before;
  end if;
  v_after := case p_mode when ''increase'' then v_before + p_quantity when ''decrease'' then v_before - p_quantity else p_quantity end;
  if v_after < 0 then raise exception ''Not enough stock in this branch. Available: %.'',v_before; end if;
  v_delta := v_after - v_before;
  if coalesce(v_product.stock_quantity,0) + v_delta < 0 then raise exception ''Stock totals need reconciliation before this adjustment.''; end if;
  if v_delta <> 0 then
    update public.products set stock_quantity = stock_quantity + v_delta, updated_at = now() where id = p_product_id;
    update public.product_location_stock set quantity = v_after, updated_at = now()
      where business_id = p_business_id and location_id = p_location_id and product_id = p_product_id;
    perform set_config(''tenh.adjustment_branch'',p_location_id::text,true);
    insert into public.stock_adjustments(business_id,location_id,product_id,adjustment_type,quantity_delta,stock_before,stock_after,reason,reference,created_by)
      values(p_business_id,p_location_id,p_product_id,p_mode,v_delta,v_before,v_after,p_reason,p_reference,auth.uid());
    perform set_config(''tenh.adjustment_branch'','''',true);
  end if;
  v_result := jsonb_build_object(''productId'',p_product_id,''stockBefore'',v_before,''stockAfter'',v_after,''delta'',v_delta);
  insert into public.stock_adjustment_requests(business_id,request_id,created_by,location_id,payload,result)
    values(p_business_id,p_request_id,auth.uid(),p_location_id,v_payload,v_result);
  return v_result;
end;
');
 end if;
end $patch$;
-- tenh_adjust_branch_stock_batch: supabase/migrations/20260929001000_product_delete_and_batch_stock.sql
do $patch$ declare source text;body text;begin
 if to_regprocedure('public.tenh_adjust_branch_stock_batch(uuid,uuid,jsonb,text,text,uuid)') is not null then
  if not exists(select 1 from pg_catalog.pg_proc where oid='public.tenh_adjust_branch_stock_batch(uuid,uuid,jsonb,text,text,uuid)'::regprocedure and proowner='postgres'::regrole) then raise exception 'Unreviewed writer owner: tenh_adjust_branch_stock_batch';end if;
  select prosrc into body from pg_catalog.pg_proc where oid='public.tenh_adjust_branch_stock_batch(uuid,uuid,jsonb,text,text,uuid)'::regprocedure;
  if md5(replace(body,chr(13),''))<>'2df8f77f6021685330ba89a9716175f0' then raise exception 'Reviewed writer body differs: tenh_adjust_branch_stock_batch';end if;
  source:=pg_get_functiondef('public.tenh_adjust_branch_stock_batch(uuid,uuid,jsonb,text,text,uuid)'::regprocedure);
  execute replace(source,body,'
declare
  v_item jsonb;
  v_result jsonb;
  v_results jsonb := ''[]''::jsonb;
  v_payload jsonb;
  v_saved public.stock_adjustment_requests%rowtype;
  v_product_id uuid;
  v_quantity integer;
  v_expected integer;
  v_mode text;
begin
  perform public.tenh_barcode_enter_business_v3(p_business_id); -- v3 entry precedes original locks; original permissions/revisions remain.

  perform public.tenh_assert_effective_permission(p_business_id,''products.stock_adjust'');
  if auth.uid() is null or p_location_id is null or public.tenh_request_branch(p_business_id) is distinct from p_location_id then
    raise exception ''This stock adjustment is outside your operating branch.'' using errcode=''42501'';
  end if;
  if p_request_id is null or p_items is null or jsonb_typeof(p_items) <> ''array'' then
    raise exception ''Select valid products and an adjustment request.'';
  end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 500
    or octet_length(p_items::text)>160000 or p_reason is null or length(btrim(p_reason))<2
    or length(p_reason)>650 or length(p_reference)>200 then
    raise exception ''Select 1-500 items and enter a valid reason and reference.'';
  end if;
  -- Same business-before-product lock order as the single-item and POS paths.
  perform public.tenh_assert_plan_branch(p_business_id,p_location_id);
  if exists(select 1 from public.business_locations where id=p_location_id and plan_disable_pending) then
    raise exception ''This branch is closing after a plan change.'';
  end if;
  v_payload:=jsonb_build_object(''kind'',''batch'',''items'',p_items,''reason'',p_reason,''reference'',p_reference);
  select * into v_saved from public.stock_adjustment_requests
    where business_id=p_business_id and request_id=p_request_id;
  if found then
    if v_saved.created_by is distinct from auth.uid() or v_saved.location_id is distinct from p_location_id
      or v_saved.payload is distinct from v_payload then
      raise exception ''This adjustment request was already used with different details.'';
    end if;
    return v_saved.result;
  end if;
  if exists(select 1 from jsonb_array_elements(p_items) as i
    group by lower(i->>''productId'') having count(*)>1) then
    raise exception ''Select each product or variant only once.'';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) order by value->>''productId'' loop
    if jsonb_typeof(v_item) <> ''object'' or coalesce(v_item->>''productId'','''') !~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''
      or jsonb_typeof(v_item->''quantity'') is distinct from ''number''
      or jsonb_typeof(v_item->''expectedQuantity'') is distinct from ''number''
      or coalesce(v_item->>''quantity'','''') !~ ''^[0-9]+$''
      or coalesce(v_item->>''expectedQuantity'','''') !~ ''^[0-9]+$'' then
      raise exception ''Enter a valid product and whole-number quantities for every row.'';
    end if;
    v_product_id:=(v_item->>''productId'')::uuid;
    v_quantity:=(v_item->>''quantity'')::integer;
    v_expected:=(v_item->>''expectedQuantity'')::integer;
    v_mode:=v_item->>''mode'';
    -- The existing RPC rechecks membership, active branch catalog, live stock,
    -- stale exact counts, plan status and quantity bounds for every selected ID.
    v_result:=public.tenh_adjust_branch_stock(p_business_id,p_location_id,v_product_id,
      v_mode,v_quantity,p_reason,p_reference,gen_random_uuid(),v_expected);
    v_results:=v_results||jsonb_build_array(v_result);
  end loop;
  v_result:=jsonb_build_object(''items'',v_results,''count'',jsonb_array_length(v_results));
  insert into public.stock_adjustment_requests(business_id,request_id,created_by,location_id,payload,result)
    values(p_business_id,p_request_id,auth.uid(),p_location_id,v_payload,v_result);
  return v_result;
end;
');
 end if;
end $patch$;
do $patch$ declare source text;begin
 source:=pg_get_functiondef('public.tenh_claim_product_identifier(uuid,uuid,uuid,text,text)'::regprocedure);
 source:=replace(source,'perform public.tenh_barcode_lock_required();','perform tenh_barcode_v3_private.require_scope(p_business);');
 source:=regexp_replace(source,'  perform pg_catalog.pg_advisory_xact_lock\(pg_catalog.hashtextextended\(''tenh-(product|order)-identifiers:''\|\|[^;]+;','','g');
 execute source;
end $patch$;
do $patch$ declare source text;begin
 source:=pg_get_functiondef('public.tenh_allocate_product_identifier(uuid)'::regprocedure);
 source:=replace(source,'perform public.tenh_barcode_lock_required();','perform tenh_barcode_v3_private.require_scope(p_business);');
 source:=regexp_replace(source,'  perform pg_catalog.pg_advisory_xact_lock\(pg_catalog.hashtextextended\(''tenh-(product|order)-identifiers:''\|\|[^;]+;','','g');
 execute source;
end $patch$;
do $patch$ declare source text;begin
 source:=pg_get_functiondef('public.tenh_preserve_product_barcode()'::regprocedure);
 source:=replace(source,'perform public.tenh_barcode_lock_required();','perform tenh_barcode_v3_private.require_scope(new.business_id);');
 source:=regexp_replace(source,'  perform pg_catalog.pg_advisory_xact_lock\(pg_catalog.hashtextextended\(''tenh-(product|order)-identifiers:''\|\|[^;]+;','','g');
 execute source;
end $patch$;
do $patch$ declare source text;begin
 source:=pg_get_functiondef('public.tenh_preserve_branch_barcode()'::regprocedure);
 source:=replace(source,'perform public.tenh_barcode_lock_required();','perform tenh_barcode_v3_private.require_scope(new.business_id);');
 source:=regexp_replace(source,'  perform pg_catalog.pg_advisory_xact_lock\(pg_catalog.hashtextextended\(''tenh-(product|order)-identifiers:''\|\|[^;]+;','','g');
 execute source;
end $patch$;
do $patch$ declare source text;begin
 source:=pg_get_functiondef('public.tenh_capture_product_identifiers()'::regprocedure);
 source:=replace(source,'perform public.tenh_barcode_lock_required();','perform tenh_barcode_v3_private.require_scope(new.business_id);');
 source:=regexp_replace(source,'  perform pg_catalog.pg_advisory_xact_lock\(pg_catalog.hashtextextended\(''tenh-(product|order)-identifiers:''\|\|[^;]+;','','g');
 execute source;
end $patch$;
do $patch$ declare source text;begin
 source:=pg_get_functiondef('public.tenh_capture_order_identifiers()'::regprocedure);
 source:=replace(source,'perform public.tenh_barcode_lock_required();','perform tenh_barcode_v3_private.require_scope(new.business_id);');
 source:=regexp_replace(source,'  perform pg_catalog.pg_advisory_xact_lock\(pg_catalog.hashtextextended\(''tenh-(product|order)-identifiers:''\|\|[^;]+;','','g');
 execute source;
end $patch$;
create or replace function public.tenh_new_order_code() returns text language plpgsql volatile security definer set search_path='' as $$
declare candidate text;begin
 if not tenh_barcode_v3_private.scope_exists() then raise exception 'Order allocation requires verified tenant entry.' using errcode='42501';end if;
 loop candidate:=(100000000000+floor(random()*900000000000))::bigint::text;
  exit when not exists(select 1 from public.orders where order_code=candidate) and not exists(select 1 from public.tenh_order_identifiers where lookup_key=candidate);
 end loop;return candidate;
end $$;
revoke all on function public.tenh_new_order_code() from public,anon,authenticated,service_role;
-- True same-code races are rejected by the existing global unique index. Only
-- an unsaved idempotent request can be retried; saved identifiers never change.
do $guard$ begin
 if to_regclass('public.businesses') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.businesses'::regclass and attname='id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: businesses';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.businesses'::regclass,'id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.businesses';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.businesses';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.businesses for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.businesses for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.business_locations') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.business_locations'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: business_locations';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.business_locations'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.business_locations';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.business_locations';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.business_locations for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.business_locations for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.business_storefronts') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.business_storefronts'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: business_storefronts';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.business_storefronts'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.business_storefronts';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.business_storefronts';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.business_storefronts for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.business_storefronts for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.business_receipt_settings') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.business_receipt_settings'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: business_receipt_settings';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.business_receipt_settings'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.business_receipt_settings';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.business_receipt_settings';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.business_receipt_settings for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.business_receipt_settings for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.business_customer_settings') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.business_customer_settings'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: business_customer_settings';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.business_customer_settings'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.business_customer_settings';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.business_customer_settings';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.business_customer_settings for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.business_customer_settings for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.business_delivery_zones') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.business_delivery_zones'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: business_delivery_zones';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.business_delivery_zones'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.business_delivery_zones';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.business_delivery_zones';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.business_delivery_zones for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.business_delivery_zones for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.business_tables') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.business_tables'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: business_tables';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.business_tables'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.business_tables';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.business_tables';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.business_tables for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.business_tables for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.products') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.products'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: products';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.products'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.products';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.products';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.products for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.products for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.product_variants') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.product_variants'::regclass and attname='product_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: product_variants';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.product_variants'::regclass,null,'public.products'::regclass,'id','product_id');
  execute 'drop trigger if exists tenh_barcode_coordinator on public.product_variants';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.product_variants';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.product_variants for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.product_variants for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.categories') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.categories'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: categories';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.categories'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.categories';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.categories';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.categories for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.categories for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.product_location_stock') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.product_location_stock'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: product_location_stock';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.product_location_stock'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.product_location_stock';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.product_location_stock';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.product_location_stock for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.product_location_stock for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.product_option_groups') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.product_option_groups'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: product_option_groups';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.product_option_groups'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.product_option_groups';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.product_option_groups';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.product_option_groups for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.product_option_groups for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.product_options') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.product_options'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: product_options';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.product_options'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.product_options';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.product_options';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.product_options for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.product_options for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.bundle_items') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.bundle_items'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: bundle_items';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.bundle_items'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.bundle_items';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.bundle_items';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.bundle_items for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.bundle_items for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.inventory_movements') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.inventory_movements'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: inventory_movements';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.inventory_movements'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.inventory_movements';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.inventory_movements';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.inventory_movements for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.inventory_movements for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.stock_adjustments') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.stock_adjustments'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: stock_adjustments';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.stock_adjustments'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.stock_adjustments';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.stock_adjustments';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.stock_adjustments for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.stock_adjustments for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.stock_transfers') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.stock_transfers'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: stock_transfers';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.stock_transfers'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.stock_transfers';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.stock_transfers';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.stock_transfers for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.stock_transfers for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.stock_transfer_items') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.stock_transfer_items'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: stock_transfer_items';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.stock_transfer_items'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.stock_transfer_items';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.stock_transfer_items';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.stock_transfer_items for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.stock_transfer_items for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.orders') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.orders'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: orders';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.orders'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.orders';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.orders';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.orders for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.orders for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.order_items') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.order_items'::regclass and attname='order_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: order_items';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.order_items'::regclass,null,'public.orders'::regclass,'id','order_id');
  execute 'drop trigger if exists tenh_barcode_coordinator on public.order_items';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.order_items';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.order_items for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.order_items for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.returns') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.returns'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: returns';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.returns'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.returns';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.returns';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.returns for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.returns for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.return_items') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.return_items'::regclass and attname='return_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: return_items';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.return_items'::regclass,null,'public.returns'::regclass,'id','return_id');
  execute 'drop trigger if exists tenh_barcode_coordinator on public.return_items';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.return_items';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.return_items for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.return_items for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.tenh_pos_holds') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.tenh_pos_holds'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: tenh_pos_holds';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.tenh_pos_holds'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.tenh_pos_holds';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.tenh_pos_holds';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.tenh_pos_holds for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.tenh_pos_holds for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.tenh_pos_points_used') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.tenh_pos_points_used'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: tenh_pos_points_used';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.tenh_pos_points_used'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.tenh_pos_points_used';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.tenh_pos_points_used';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.tenh_pos_points_used for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.tenh_pos_points_used for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.customers') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.customers'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: customers';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.customers'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.customers';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.customers';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.customers for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.customers for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.customer_credit_accounts') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.customer_credit_accounts'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: customer_credit_accounts';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.customer_credit_accounts'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.customer_credit_accounts';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.customer_credit_accounts';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.customer_credit_accounts for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.customer_credit_accounts for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.customer_credit_ledger') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.customer_credit_ledger'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: customer_credit_ledger';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.customer_credit_ledger'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.customer_credit_ledger';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.customer_credit_ledger';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.customer_credit_ledger for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.customer_credit_ledger for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.customer_loyalty_transactions') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.customer_loyalty_transactions'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: customer_loyalty_transactions';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.customer_loyalty_transactions'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.customer_loyalty_transactions';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.customer_loyalty_transactions';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.customer_loyalty_transactions for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.customer_loyalty_transactions for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.business_coupons') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.business_coupons'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: business_coupons';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.business_coupons'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.business_coupons';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.business_coupons';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.business_coupons for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.business_coupons for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.coupon_redemptions') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.coupon_redemptions'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: coupon_redemptions';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.coupon_redemptions'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.coupon_redemptions';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.coupon_redemptions';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.coupon_redemptions for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.coupon_redemptions for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.suppliers') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.suppliers'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: suppliers';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.suppliers'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.suppliers';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.suppliers';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.suppliers for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.suppliers for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.purchases') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.purchases'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: purchases';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.purchases'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.purchases';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.purchases';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.purchases for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.purchases for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.purchase_items') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.purchase_items'::regclass and attname='purchase_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: purchase_items';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.purchase_items'::regclass,null,'public.purchases'::regclass,'id','purchase_id');
  execute 'drop trigger if exists tenh_barcode_coordinator on public.purchase_items';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.purchase_items';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.purchase_items for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.purchase_items for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.purchase_orders') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.purchase_orders'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: purchase_orders';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.purchase_orders'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.purchase_orders';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.purchase_orders';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.purchase_orders for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.purchase_orders for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.purchase_order_items') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.purchase_order_items'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: purchase_order_items';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.purchase_order_items'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.purchase_order_items';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.purchase_order_items';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.purchase_order_items for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.purchase_order_items for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.expenses') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.expenses'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: expenses';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.expenses'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.expenses';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.expenses';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.expenses for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.expenses for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.cash_register_shifts') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.cash_register_shifts'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: cash_register_shifts';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.cash_register_shifts'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.cash_register_shifts';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.cash_register_shifts';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.cash_register_shifts for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.cash_register_shifts for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.cash_movements') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.cash_movements'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: cash_movements';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.cash_movements'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.cash_movements';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.cash_movements';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.cash_movements for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.cash_movements for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.audit_logs') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.audit_logs'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: audit_logs';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.audit_logs'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.audit_logs';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.audit_logs';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.audit_logs for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.audit_logs for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.business_activity_history') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.business_activity_history'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: business_activity_history';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.business_activity_history'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.business_activity_history';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.business_activity_history';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.business_activity_history for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.business_activity_history for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.branch_product_details') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.branch_product_details'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: branch_product_details';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.branch_product_details'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.branch_product_details';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.branch_product_details';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.branch_product_details for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.branch_product_details for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.branch_receipt_settings') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.branch_receipt_settings'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: branch_receipt_settings';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.branch_receipt_settings'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.branch_receipt_settings';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.branch_receipt_settings';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.branch_receipt_settings for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.branch_receipt_settings for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.branch_customer_settings') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.branch_customer_settings'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: branch_customer_settings';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.branch_customer_settings'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.branch_customer_settings';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.branch_customer_settings';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.branch_customer_settings for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.branch_customer_settings for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.branch_pos_settings') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.branch_pos_settings'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: branch_pos_settings';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.branch_pos_settings'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.branch_pos_settings';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.branch_pos_settings';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.branch_pos_settings for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.branch_pos_settings for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.branch_bundle_recipes') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.branch_bundle_recipes'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: branch_bundle_recipes';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.branch_bundle_recipes'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.branch_bundle_recipes';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.branch_bundle_recipes';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.branch_bundle_recipes for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.branch_bundle_recipes for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.branch_role_permissions') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.branch_role_permissions'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: branch_role_permissions';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.branch_role_permissions'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.branch_role_permissions';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.branch_role_permissions';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.branch_role_permissions for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.branch_role_permissions for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.branch_notification_role_settings') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.branch_notification_role_settings'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: branch_notification_role_settings';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.branch_notification_role_settings'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.branch_notification_role_settings';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.branch_notification_role_settings';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.branch_notification_role_settings for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.branch_notification_role_settings for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.business_import_requests') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.business_import_requests'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: business_import_requests';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.business_import_requests'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.business_import_requests';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.business_import_requests';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.business_import_requests for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.business_import_requests for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
do $guard$ begin
 if to_regclass('public.data_transfer_jobs') is not null then
  if not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.data_transfer_jobs'::regclass and attname='business_id' and atttypid='uuid'::regtype and not attisdropped) then raise exception 'Unreviewed row ownership: data_transfer_jobs';end if;
  insert into tenh_barcode_v3_private.row_ownership values('public.data_transfer_jobs'::regclass,'business_id',null,null,null);
  execute 'drop trigger if exists tenh_barcode_coordinator on public.data_transfer_jobs';
  execute 'drop trigger if exists tenh_barcode_writer_required on public.data_transfer_jobs';
  execute 'create trigger a01_tenh_v3_statement before insert or update or delete on public.data_transfer_jobs for each statement execute function tenh_barcode_v3_private.statement_entry()';
  execute 'create trigger a01_tenh_v3_row before insert or update or delete on public.data_transfer_jobs for each row execute function tenh_barcode_v3_private.row_guard()';
 end if;
end $guard$;
drop trigger tenh_barcode_coordinator on public.branch_products;
create trigger a01_tenh_v3_statement before insert or update or delete on public.branch_products for each statement execute function tenh_barcode_v3_private.statement_entry();
drop function public.tenh_barcode_branch_lock_required();
drop function public.tenh_barcode_statement_lock();
drop function public.tenh_barcode_writer_lock(uuid);
drop function public.tenh_barcode_lock_required();
drop function public.tenh_barcode_catalog_lock();
create or replace function public.tenh_barcode_contract_v2_ready() returns boolean language sql security definer set search_path='' as $$select false$$;
create function public.tenh_barcode_contract_v3_ready() returns boolean language sql security definer set search_path='' as $$select false$$;
revoke all on function public.tenh_barcode_contract_v3_ready() from public,anon;
grant execute on function public.tenh_barcode_contract_v3_ready() to authenticated,service_role;
revoke all on all functions in schema tenh_barcode_v3_private from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
