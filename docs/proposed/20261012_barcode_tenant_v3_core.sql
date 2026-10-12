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
