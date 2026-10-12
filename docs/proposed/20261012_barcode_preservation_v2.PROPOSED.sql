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
notify pgrst,'reload schema';
commit;

-- Rollback requires alias-aware readers after any replacement. Keep guards and
-- manifests; never restore rewriting triggers or drop alias history automatically.
