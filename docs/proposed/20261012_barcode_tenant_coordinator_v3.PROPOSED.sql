-- REVIEW PROTOTYPE ONLY. Not a deployable preservation migration.
-- Candidate successor to the v2 GLOBAL coordinator. Existing v2 SQL is intact.
-- It does NOT install writer adapters, remove import table locks, or replace the
-- global order allocator. Read the accompanying writer inventory before use.
-- No runtime flag/gate points at this prototype. Never apply it to production.
begin;
do $$ begin
  raise exception 'v3 is incomplete: writer adapters and real concurrent evidence are required.';
end $$;

-- BEGIN TESTABLE COORDINATOR CORE
-- Test harnesses extract ONLY this section into disposable synthetic databases.
-- Private schema prevents API access and hostile search_path substitution.
create schema tenh_barcode_v3_private;
revoke all on schema tenh_barcode_v3_private from public,anon,authenticated,service_role;

-- Exact UUID rows avoid advisory-hash collisions between different businesses.
-- Preseed in the final installation transaction. No lazy insert/FK acquisition
-- for an existing business at writer entry. New-business creation needs its own
-- reviewed genesis adapter; absence of a row must fail, not fall back globally.
create table tenh_barcode_v3_private.tenant_mutex (
  business_id uuid primary key references public.businesses(id) on delete cascade
);
insert into tenh_barcode_v3_private.tenant_mutex select id from public.businesses order by id;

-- A caller-controlled GUC/header is NEVER proof that a lock is held. Only a
-- trusted definer inserts this record AFTER every requested lock is acquired.
-- xid8 makes committed records unusable by subsequent pooled transactions.
-- Prior records for the same backend are deleted at its next entry. A final
-- design also needs bounded maintenance for disconnected-backend residue.
create table tenh_barcode_v3_private.transaction_scope (
  transaction_id xid8 primary key,
  backend_pid integer not null,
  businesses uuid[] not null check(cardinality(businesses)>0)
);
create index transaction_scope_backend on tenh_barcode_v3_private.transaction_scope(backend_pid);
alter table tenh_barcode_v3_private.tenant_mutex enable row level security;
alter table tenh_barcode_v3_private.transaction_scope enable row level security;
revoke all on all tables in schema tenh_barcode_v3_private from public,anon,authenticated,service_role;

create function tenh_barcode_v3_private.require_scope(p_business uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_business is null or not exists (
    select 1 from tenh_barcode_v3_private.transaction_scope s
    where s.transaction_id=pg_catalog.pg_current_xact_id()
      and s.backend_pid=pg_catalog.pg_backend_pid() and p_business=any(s.businesses)
  ) then
    raise exception 'Unsupported writer: declare the complete verified tenant scope before row locks.' using errcode='42501';
  end if;
end $$;

-- PRIVATE ONLY. Reviewed entry adapters must authorize every business FIRST,
-- then call once before request/group/table/row/FK locks. This function is not
-- an authorization substitute, and is deliberately not an exposed RPC.
create function tenh_barcode_v3_private.enter_scope(p_businesses uuid[])
returns void language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare wanted uuid[]; previous uuid[]; tenant uuid;
begin
  if p_businesses is null or cardinality(p_businesses)=0 or array_position(p_businesses,null) is not null then
    raise exception 'An explicit nonempty tenant scope is required.' using errcode='42501';
  end if;
  select array_agg(id order by id) into wanted from (select distinct unnest(p_businesses) id) q;
  select businesses into previous from tenh_barcode_v3_private.transaction_scope
    where transaction_id=pg_catalog.pg_current_xact_id() and backend_pid=pg_catalog.pg_backend_pid();
  if found then
    if not wanted <@ previous then
      raise exception 'Tenant scope cannot widen after entry; predeclare sorted bulk scopes.' using errcode='42501';
    end if;
    return; -- Nested writers may only inherit a subset of the complete scope.
  end if;
  foreach tenant in array wanted loop
    perform 1 from tenh_barcode_v3_private.tenant_mutex where business_id=tenant for no key update;
    if not found then raise exception 'Tenant coordinator missing; use the reviewed genesis adapter.' using errcode='42501'; end if;
  end loop;
  delete from tenh_barcode_v3_private.transaction_scope where backend_pid=pg_catalog.pg_backend_pid();
  insert into tenh_barcode_v3_private.transaction_scope values(pg_catalog.pg_current_xact_id(),pg_catalog.pg_backend_pid(),wanted);
end $$;

-- Before-statement guard never acquires a tenant lock late. A direct REST
-- adapter must establish authorized scope before this guard, otherwise reject.
create function tenh_barcode_v3_private.require_statement_scope()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from tenh_barcode_v3_private.transaction_scope
    where transaction_id=pg_catalog.pg_current_xact_id() and backend_pid=pg_catalog.pg_backend_pid()) then
    raise exception 'Unsupported writer: no verified tenant entry.' using errcode='42501';
  end if;
  return null;
end $$;

-- For tenant-owned tables only. Child/view adapters must derive ownership from
-- verified parents and require the same scope; never infer from request filters.
create function tenh_barcode_v3_private.require_row_scope()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op<>'INSERT' then perform tenh_barcode_v3_private.require_scope(old.business_id); end if;
  if tg_op<>'DELETE' then perform tenh_barcode_v3_private.require_scope(new.business_id); end if;
  if tg_op='UPDATE' and new.business_id is distinct from old.business_id then
    raise exception 'Cross-business reassignment is unsupported.' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on all functions in schema tenh_barcode_v3_private from public,anon,authenticated,service_role;

-- Intentionally false even after the core compiles: no automatic activation.
create function public.tenh_barcode_contract_v3_ready()
returns boolean language sql security definer set search_path='' as $$select false$$;
revoke all on function public.tenh_barcode_contract_v3_ready() from public,anon;
grant execute on function public.tenh_barcode_contract_v3_ready() to authenticated,service_role;
-- END TESTABLE COORDINATOR CORE
rollback;
