/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require('./helpers/pglite.cjs');
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
(async()=>{const db=new PGlite();try{
 await db.exec(`create schema auth;create function auth.uid() returns uuid language sql as $$select '${id(99)}'::uuid$$;`);
 for(const table of JSON.parse(fs.readFileSync('tests/fixtures/shared-storefront-columns.json','utf8'))) await db.exec('create table '+table.name+'('+table.columns+');');
 const definitions={...JSON.parse(fs.readFileSync('tests/fixtures/branch-schema.json','utf8')).definitions,...JSON.parse(fs.readFileSync('tests/fixtures/operating-branch-schema.json','utf8')).definitions};
 for(const name of ['returns','return_items','business_members']){
  const columns=Object.entries(definitions[name].properties).map(([key,p])=>'"'+key+'" '+(p.format||'text'));
  await db.exec('create table '+name+'('+columns.join(',')+');');
 }
 await db.exec(fs.readFileSync('tests/fixtures/order-list-before-return-status.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20260924008000_order_list_return_status.sql','utf8'));
 await db.exec(`
 insert into business_members(business_id,user_id,is_active,role)values('${id(1)}','${id(99)}',true,'owner');
 insert into business_locations(id,business_id,is_default,timezone,name)values('${id(2)}','${id(1)}',true,'UTC','Main'),('${id(3)}','${id(1)}',false,'UTC','Second');
 insert into business_storefronts(business_id,currency)values('${id(1)}','USD');
 insert into orders(id,business_id,order_number,status,payment_status,total,amount_paid,change_amount,location_id,created_at)values
 ('${id(10)}','${id(1)}','FULL','completed','paid',0,15,15,'${id(2)}',now()),
 ('${id(11)}','${id(1)}','PARTIAL','completed','paid',15,30,15,'${id(3)}',now()),
 ('${id(12)}','${id(1)}','FREE','completed','paid',0,0,0,'${id(2)}',now()),
 ('${id(13)}','${id(1)}','PENDING-RETURN','completed','paid',0,15,15,'${id(2)}',now()),
 ('${id(14)}','${id(5)}','FOREIGN','completed','paid',0,15,15,'${id(6)}',now());
 insert into order_items(id,order_id,quantity)values('${id(20)}','${id(10)}',2),('${id(21)}','${id(11)}',2),('${id(22)}','${id(12)}',1),('${id(23)}','${id(13)}',1),('${id(24)}','${id(14)}',1);
 insert into returns(id,business_id,order_id,status,refund_amount)values('${id(30)}','${id(1)}','${id(10)}','refunded',7.5),('${id(31)}','${id(1)}','${id(10)}','refunded',7.5),('${id(32)}','${id(1)}','${id(11)}','refunded',15),('${id(33)}','${id(1)}','${id(13)}','pending',15);
 insert into return_items(return_id,order_item_id,quantity)values('${id(30)}','${id(20)}',1),('${id(31)}','${id(20)}',1),('${id(32)}','${id(21)}',1),('${id(33)}','${id(23)}',1);
 `);
 const list=async(filters={})=>(await db.query('select tenh_orders_workspace($1,$2) result',[id(1),filters])).rows[0].result;
 let result=await list();assert.equal(result.total,4);
 const full=result.rows.find(r=>r.orderNumber==='FULL');assert.equal(full.status,'refunded');assert.equal(full.paymentState,'refunded');
 for(const name of ['PARTIAL','FREE','PENDING-RETURN']){const row=result.rows.find(r=>r.orderNumber===name);assert.equal(row.status,'completed');assert.equal(row.paymentState,'paid');}
 assert.equal(result.counts.refunded,1);assert.equal(result.counts.completed,3);
 assert.deepEqual((await list({status:'refunded'})).rows.map(r=>r.orderNumber),['FULL']);
 assert.deepEqual((await list({payment:'refunded'})).rows.map(r=>r.orderNumber),['FULL']);
 assert.equal((await list({branch:id(3),status:'refunded'})).total,0);
 assert.equal((await db.query('select status from orders where id=$1',[id(10)])).rows[0].status,'completed','display fix must not rewrite accounting history');
 console.log('PASS: historical full returns, split returns, partial/pending returns, zero-price sales, business/branch filters and tab counts.');
}finally{await db.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
