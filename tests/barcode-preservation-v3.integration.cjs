/* eslint-disable @typescript-eslint/no-require-imports -- Credential-free SQL/source-body regression tests. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture,B,OTHER,L,P,O,UID}=require('./helpers/barcode-v3-fixture.cjs');
const {sql,evidence}=require('../scripts/build-barcode-tenant-proposal.cjs');
const installed=fs.readFileSync('docs/proposed/20261012_barcode_preservation_v3.PROPOSED.sql','utf8');
test('v3 successor is reproducible, covers recorded writers, removes global/table locks and preserves exact aliases',async()=>{
 assert.equal(installed,sql);assert.equal(evidence.adapters.length,31);assert.deepEqual(evidence.unsupported,[]);
 const db=await fixture();try{
  await db.exec(sql);
  assert.equal((await db.query('select tenh_barcode_contract_v2_ready() v2,tenh_barcode_contract_v3_ready() v3')).rows[0].v2,false);
  assert.equal((await db.query("select to_regprocedure('public.tenh_barcode_catalog_lock()') gone")).rows[0].gone,null);
  const writers=(await db.query("select proname,prosrc from pg_proc where oid=any($1::regprocedure[])",[evidence.adapters.map(x=>x.signature)])).rows;
  for(const row of writers){assert.match(row.prosrc,/tenh_barcode_enter_business_v3/);assert.doesNotMatch(row.prosrc,/tenh_barcode_writer_lock|lock table|9616/);}
  const identifiers=(await db.query("select prosrc from pg_proc where proname in('tenh_claim_product_identifier','tenh_allocate_product_identifier','tenh_preserve_product_barcode','tenh_capture_order_identifiers','tenh_new_order_code')")).rows;
  for(const row of identifiers)assert.doesNotMatch(row.prosrc,/pg_advisory|catalog_lock|lock_required/);
  await db.exec(`begin;select public.tenh_barcode_enter_business_v3('${B}');update products set barcode='000007' where id='${P}';commit;`);
  assert.deepEqual((await db.query(`select * from tenh_scan_product_ids('${B}','000abc_1')`)).rows,[{product_id:P}]);
  assert.equal((await db.query(`select * from tenh_scan_product_ids('${B}','7')`)).rows.length,0);
  assert.equal((await db.query('select count(*) n from pg_temp.tenh_barcode_transaction_scope')).rows[0].n,0); // ON COMMIT cleanup.
  await assert.rejects(db.exec(`update products set barcode='000008' where id='${P}'`),/Unsupported writer/);
  await db.exec(`begin;select * from products where id='${P}' for update;`);
  await assert.rejects(db.exec(`select public.tenh_barcode_enter_business_v3('${B}')`),/Late tenant entry/);await db.exec('rollback');
 }finally{await db.close();}
});
test('actual import and batch bodies run under tenant scope with legacy preservation and atomic collisions',async()=>{
 const db=await fixture();try{
  await db.exec(sql);
  const row=(await db.query(`select * from branch_products where id='${P}'`)).rows[0];
  const payload=[{id:P,expectedUpdatedAt:row.updated_at,values:{name:'Source body edit',sku:row.sku,category_id:null,description:null,size:null,color:null,cost_price:0,selling_price:1,low_stock_quantity:0,is_active:true,is_online:false}}];
  assert.equal((await db.query('select tenh_edit_product_rows($1,$2,$3,$4) result',[B,L,P,JSON.stringify(payload)])).rows[0].result.success,true);
  assert.equal((await db.query(`select barcode from branch_products where id='${P}'`)).rows[0].barcode,'000abc_1');
  const preview=(await db.query('select tenh_import_business_safe($1,$2,$3,$4,$5) result',[B,'products','update',JSON.stringify([{id:P,name:'Imported source body',barcode:'000abc_1'}]),L])).rows[0].result;
  assert.ok(preview); // Preview's real constraints run in a rolled-back subtransaction.
  assert.equal((await db.query(`select name from branch_products where id='${P}'`)).rows[0].name,'Source body edit');
  await db.exec(`begin;select public.tenh_barcode_enter_business_v3('${B}');savepoint collision;`);
  await assert.rejects(db.exec(`insert into products(business_id,sku,barcode) values('${B}','COLLISION','SECOND')`),/reserved/);await db.exec('rollback');
  assert.equal((await db.query("select count(*) n from products where sku='COLLISION'")).rows[0].n,0);
 }finally{await db.close();}
});
test('actual POS idempotent replay and online guard bodies retain saved-order and authorization behavior',async()=>{
 const db=await fixture();try{
  const request='50000000-0000-4000-8000-000000000001',input=JSON.stringify({requestId:request});
  await db.query(`update orders set pos_request_id=$1,pos_request_hash=md5($2),pos_checkout=jsonb_build_object('createdBy',$3::text,'receipt',jsonb_build_object('orderId',id,'orderCode',order_code)) where id=$4`,[request,input,UID,O]);
  // PostgreSQL jsonb canonicalizes text before the real body hashes it.
  await db.query('update orders set pos_request_hash=md5($1::jsonb::text) where id=$2',[input,O]);
  await db.exec(sql);
  const receipt=(await db.query('select tenh_pos_checkout($1,$2) receipt',[B,input])).rows[0].receipt;
  assert.equal(receipt.orderId,O);assert.equal(receipt.orderCode,'123456789012');
  assert.equal((await db.query('select count(*) n from orders')).rows[0].n,1);
  await assert.rejects(db.query('select tenh_pos_checkout($1,$2)',[B,JSON.stringify({requestId:request,changed:true})]),/already used/);
  await assert.rejects(db.query('select place_branch_online_order($1,$2)',['fixture-a','{}']),/service entry/);
  await db.exec("select set_config('test.uid','',false),set_config('test.role','service_role',false);");
  await assert.rejects(db.query('select place_branch_online_order($1,$2)',['fixture-a','{}']),/not accepting|not published|Store is|store/i);
  await assert.rejects(db.query('select place_online_order($1,$2,$3,$4,$5)',['fixture-a','[]','pickup','Synthetic','000000']),/not published|store|accepting|items/i);
 }finally{await db.close();}
});
test('privileged REST/bulk adapters, genesis and child ownership reject implicit or cross-tenant writes',async()=>{
 const db=await fixture();try{
  await db.exec(sql);
  await db.exec(`select set_config('test.uid','',false),set_config('test.role','service_role',false),set_config('request.path','/products',false),set_config('request.method','POST',false),set_config('request.headers','{"x-tenh-business-id":"${B}"}',false);`);
  await db.exec(`insert into products(business_id,sku,barcode)values('${B}','REST','000123');`);
  await assert.rejects(db.exec(`insert into products(business_id,sku,barcode)values('${OTHER}','CROSS','000123');`),/outside/);
  await db.exec(`select set_config('request.path','',false),set_config('request.headers','{}',false);begin;select tenh_barcode_v3_private.enter_scope(array['${OTHER}','${B}']::uuid[]);insert into products(business_id,sku,barcode)values('${OTHER}','OTHER','000123');commit;`);
  assert.equal((await db.query("select count(*) n from products where barcode='000123'")).rows[0].n,2);
  const fresh='10000000-0000-4000-8000-000000000003';
  await db.exec(`begin;insert into businesses(id,owner_id,slug,is_active)values('${fresh}','${UID}','fixture-c',true);insert into products(business_id,sku,barcode)values('${fresh}','GENESIS','000123');commit;`);
  assert.equal((await db.query('select count(*) n from pg_temp.tenh_barcode_transaction_scope')).rows[0].n,0);
  await db.exec(`begin;select tenh_barcode_v3_private.enter_scope(array['${OTHER}']::uuid[]);`);
  await assert.rejects(db.exec(`insert into order_items(order_id,product_id)values('${O}','${P}');`),/outside/);await db.exec('rollback');
  await db.exec(`select set_config('test.uid','${UID}',false),set_config('test.role','authenticated',false),set_config('request.path','/products',false),set_config('request.method','POST',false),set_config('request.headers','{"x-tenh-business-id":"${OTHER}","x-tenh-branch-id":"${L}"}',false);`);
  await assert.rejects(db.exec(`insert into products(business_id,sku,barcode)values('${OTHER}','DENIED','000456');`),/Business access|Invalid/);
 }finally{await db.close();}
});
