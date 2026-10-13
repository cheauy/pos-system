/* eslint-disable @typescript-eslint/no-require-imports -- Credential-free disposable SQL fixture. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('./helpers/pglite.cjs');
const proposal=fs.readFileSync('docs/proposed/20261012_barcode_tenant_coordinator_v3.PROPOSED.sql','utf8');
const core=proposal.split('-- BEGIN TESTABLE COORDINATOR CORE')[1].split('-- END TESTABLE COORDINATOR CORE')[0];
const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002',C='10000000-0000-4000-8000-000000000003';
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create table businesses(id uuid primary key);insert into businesses values('${A}'),('${B}');create table scoped_rows(id integer primary key,business_id uuid references businesses,barcode text);`);
 await db.exec(core);
 await db.exec(`create trigger scope_statement before insert or update or delete on scoped_rows for each statement execute function tenh_barcode_v3_private.require_statement_scope();create trigger scope_row before insert or update or delete on scoped_rows for each row execute function tenh_barcode_v3_private.require_row_scope();grant all on scoped_rows to authenticated,service_role;`);
 return db;
}
test('v3 core rejects undeclared writes, scope widening, stale transactions and tenant reassignment',async()=>{
 const db=await fixture();try{
  await assert.rejects(db.exec(`insert into scoped_rows values(1,'${A}','000123')`),/no verified tenant/);
  await db.exec(`begin;select tenh_barcode_v3_private.enter_scope(array['${A}']::uuid[]);insert into scoped_rows values(1,'${A}','000123');commit;`);
  await assert.rejects(db.exec(`update scoped_rows set barcode='000124'`),/no verified tenant/);
  await db.exec(`begin;select tenh_barcode_v3_private.enter_scope(array['${A}']::uuid[]);savepoint attempt;`);
  await assert.rejects(db.exec(`select tenh_barcode_v3_private.enter_scope(array['${B}']::uuid[])`),/cannot widen/);
  await db.exec('rollback to attempt');
  await assert.rejects(db.exec(`insert into scoped_rows values(2,'${B}','000123')`),/complete verified tenant/);
  await db.exec('rollback');
  await db.exec(`begin;select tenh_barcode_v3_private.enter_scope(array['${B}','${A}','${B}']::uuid[]);`);
  const scopes=(await db.query('select businesses from tenh_barcode_v3_private.transaction_scope where transaction_id=pg_current_xact_id()')).rows;
  assert.deepEqual(scopes[0].businesses,[A,B]);
  await db.exec(`select tenh_barcode_v3_private.enter_scope(array['${A}']::uuid[]);savepoint attempt;`);
  await assert.rejects(db.exec(`update scoped_rows set business_id='${B}' where id=1`),/reassignment/);
  await db.exec('rollback to attempt');
  await db.exec(`insert into scoped_rows values(2,'${B}','000123');commit;`);
  assert.deepEqual((await db.query('select barcode from scoped_rows order by id')).rows,[{barcode:'000123'},{barcode:'000123'}]);
  assert.equal((await db.query('select tenh_barcode_contract_v3_ready() ready')).rows[0].ready,false);
 }finally{await db.close();}
});
test('v3 core cannot be spoofed with GUCs or called by API roles; missing genesis scope fails',async()=>{
 const db=await fixture();try{
  for(const role of ['authenticated','service_role']){
   await db.exec(`set role ${role};select set_config('tenh.barcode.scope','${A}',false);`);
   await assert.rejects(db.exec(`select tenh_barcode_v3_private.enter_scope(array['${A}']::uuid[])`),/permission denied/);
   await assert.rejects(db.exec(`insert into scoped_rows values(1,'${A}','000123')`),/no verified tenant/);
   await db.exec('reset role');
  }
  await assert.rejects(db.exec(`select tenh_barcode_v3_private.enter_scope(array['${C}']::uuid[])`),/genesis adapter/);
  for(const value of ['null','array[]::uuid[]','array[null]::uuid[]'])await assert.rejects(db.exec(`select tenh_barcode_v3_private.enter_scope(${value})`),/nonempty tenant/);
  // The complete proposal itself cannot be installed, even by the owner.
  await assert.rejects(db.exec(proposal),/v3 is incomplete/);await db.exec('rollback');
 }finally{await db.close();}
});
test('savepoint rollback removes scope proof along with acquired transaction locks',async()=>{
 const db=await fixture();try{
  await db.exec(`begin;savepoint before_entry;select tenh_barcode_v3_private.enter_scope(array['${A}']::uuid[]);rollback to before_entry;`);
  await assert.rejects(db.exec(`select tenh_barcode_v3_private.require_scope('${A}')`),/complete verified tenant/);
  await db.exec('rollback');
 }finally{await db.close();}
});
module.exports={core,A,B};
