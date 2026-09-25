const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require('./helpers/pglite.cjs');
const B='10000000-0000-4000-8000-000000000001',A='20000000-0000-4000-8000-000000000001',C='20000000-0000-4000-8000-000000000002',U='30000000-0000-4000-8000-000000000001',OTHER='30000000-0000-4000-8000-000000000002';
(async()=>{const db=new PGlite();try{
 await db.exec(`create schema auth;create role authenticated;create role anon;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;
 create table memberships(business_id uuid,user_id uuid,can_update boolean);
 insert into memberships values('${B}','${U}',true),('${B}','${OTHER}',false);
 create function public.tenh_user_permission_allowed(b uuid,u uuid,p text) returns boolean language sql stable security definer set search_path='' as $$select coalesce((select can_update from public.memberships where business_id=b and user_id=u),false) and p='business.update'$$;
 revoke all on function public.tenh_user_permission_allowed(uuid,uuid,text) from public,authenticated,anon;
 create function public.tenh_branch_setting_visible(b uuid,l uuid) returns boolean language sql stable security definer set search_path='' as $$select b='${B}'::uuid and l='${A}'::uuid and auth.uid() is not null$$;`);
 for(const table of ['branch_receipt_settings','branch_customer_settings','branch_pos_settings']){
  await db.exec(`create table ${table}(business_id uuid,location_id uuid,value text,primary key(business_id,location_id));
   insert into ${table} values('${B}','${A}','original'),('${B}','${C}','other branch');
   alter table ${table} enable row level security;
   grant select,insert,update on ${table} to authenticated;
   create policy branch_read on ${table} for select to authenticated using(public.tenh_branch_setting_visible(business_id,location_id));
   create policy branch_write on ${table} for all to authenticated using(public.tenh_branch_setting_visible(business_id,location_id) and public.tenh_user_permission_allowed(business_id,auth.uid(),'business.update')) with check(public.tenh_branch_setting_visible(business_id,location_id) and public.tenh_user_permission_allowed(business_id,auth.uid(),'business.update'));`);
 }
 await db.exec(`set test.uid='${U}';set role authenticated;`);
 await assert.rejects(db.exec("update branch_receipt_settings set value='saved'"),/permission denied for function tenh_user_permission_allowed/);
 await db.exec('reset role');
 const migration=fs.readFileSync('supabase/migrations/20260925006000_branch_settings_permission_policy.sql','utf8');await db.exec(migration);await db.exec(migration);
 await db.exec('set role authenticated');
 for(const table of ['branch_receipt_settings','branch_customer_settings','branch_pos_settings']){
  await db.query(`insert into ${table} values($1,$2,'saved') on conflict(business_id,location_id) do update set value=excluded.value`,[B,A]);
  assert.equal((await db.query(`select value from ${table}`)).rows[0].value,'saved');
  await assert.rejects(db.query(`insert into ${table} values($1,$2,'intrusion') on conflict(business_id,location_id) do update set value=excluded.value`,[B,C]),/row-level security/);
 }
 await assert.rejects(db.query('select public.tenh_user_permission_allowed($1,$2,$3)',[B,U,'business.update']),/permission denied/);
 await db.exec(`set test.uid='${OTHER}'`);
 assert.equal((await db.query('select public.tenh_current_user_permission_allowed($1,$2) allowed',[B,'business.update'])).rows[0].allowed,false);
 await assert.rejects(db.query("insert into branch_receipt_settings values($1,$2,'denied') on conflict(business_id,location_id) do update set value=excluded.value",[B,A]),/row-level security/);
 await db.exec('reset role');
 assert.equal((await db.query('select value from branch_receipt_settings where location_id=$1',[C])).rows[0].value,'other branch');
 assert.equal((await db.query("select has_function_privilege('anon','public.tenh_current_user_permission_allowed(uuid,text)','execute') allowed")).rows[0].allowed,false);
 console.log('PASS reproduced original denial; save and reload work for all three settings tables; wrong branch, denied member, anonymous and arbitrary-user calls remain blocked; migration is repeatable.');
}finally{await db.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
