/* eslint-disable @typescript-eslint/no-require-imports -- Disposable source-body SQL fixture only. */
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const {adapters}=require('../../scripts/build-barcode-tenant-proposal.cjs');
const B='10000000-0000-4000-8000-000000000001',OTHER='10000000-0000-4000-8000-000000000002',L='20000000-0000-4000-8000-000000000001',P='30000000-0000-4000-8000-000000000001',O='40000000-0000-4000-8000-000000000001',UID='90000000-0000-4000-8000-000000000001';
// Reuse the credential-free v2 prerequisites without registering its test cases.
// This evaluates only the trusted fixture preamble, not arbitrary user input.
const filename=path.resolve('tests/barcode-preservation-v2.integration.cjs');
const preamble=fs.readFileSync(filename,'utf8').split('\ntest(')[0];
const base=new Function('require',preamble+'\nreturn fixture;')(createRequire(filename));
const ident=x=>'"'+x.replaceAll('"','""')+'"';
async function fixture(){
 const db=await base();
 try{
  const schema=JSON.parse(fs.readFileSync('tests/fixtures/order-safety-schema-live-20261008.json','utf8'));
  for(const row of schema.enums.filter(x=>x.schema==='public'))await db.exec(`do $$begin if to_regtype('public.${row.name}') is null then execute 'create type public.${row.name} as enum (${row.labels.map(x=>"''"+x.replaceAll("'","''")+"''").join(',')})';end if;end$$;`);
  for(const relation of schema.relations.filter(x=>x.schema==='public'&&x.kind==='r')){
   await db.exec(`create table if not exists public.${ident(relation.name)} (${relation.columns.map(x=>ident(x.name)+' '+x.type).join(',')});`);
   for(const column of relation.columns)await db.exec(`alter table public.${ident(relation.name)} add column if not exists ${ident(column.name)} ${column.type};`);
  }
  for(const relation of JSON.parse(fs.readFileSync('tests/fixtures/branch-catalog-tables.json','utf8')))await db.exec(`create table if not exists public.${ident(relation.name)} (${relation.columns});`);
  await db.exec(`alter table businesses add column if not exists slug text,add column if not exists owner_id uuid,add column if not exists is_active boolean default true;update businesses set slug=case when id='${B}' then 'fixture-a' else 'fixture-b' end,owner_id='${UID}',is_active=true;
   create table mobile_management_requests(business_id uuid,request_id uuid,user_id uuid,branch_id uuid,operation text,input jsonb,result jsonb,created_at timestamptz default now(),primary key(business_id,request_id));
   create table stock_adjustment_requests(business_id uuid,request_id uuid,created_by uuid,location_id uuid,payload jsonb,result jsonb,created_at timestamptz default now(),primary key(business_id,request_id));
   alter table orders add column if not exists pos_request_id uuid,add column if not exists pos_request_hash text,add column if not exists pos_checkout jsonb;
   create or replace function auth.role() returns text language sql as $$select coalesce(nullif(current_setting('test.role',true),''),'authenticated')$$;
   create function tenh_pos_guard(uuid) returns text language plpgsql as $$begin perform public.tenh_assert_effective_permission($1,'pos.access');return 'owner';end$$;
   create function tenh_choose_online_branch(uuid,jsonb) returns uuid language sql as $$select '${L}'::uuid$$;`);
  // Install the recorded branch resolver, whose membership/header checks are
  // real. Permission/plan/quote/accounting dependencies remain fixture doubles.
  const branch=JSON.parse(fs.readFileSync('tests/fixtures/branch-visibility-functions.json','utf8')).find(x=>x.proname==='tenh_request_branch');
  await db.exec(branch.definition+';');
  for(const fn of adapters)if(!['tenh_edit_product_rows','tenh_import_business_safe'].includes(fn.name))await db.exec(fn.definition+';');
  return db;
 }catch(error){await db.close();throw error;}
}
module.exports={fixture,B,OTHER,L,P,O,UID};
