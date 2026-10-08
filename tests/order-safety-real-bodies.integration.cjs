/* eslint-disable @typescript-eslint/no-require-imports */
// Local PGlite only. All application/auth bodies are captured production definitions.
// See helper for omitted FK/RLS/triggers; there are no stub permission/branch/stock functions.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {open,seed,identity,id,V,functions}=require('./helpers/order-safety-db.cjs');
const names=fs.readdirSync('supabase/migrations');
const migration=suffix=>fs.readFileSync('supabase/migrations/'+names.find(n=>n.endsWith(suffix+'.sql')),'utf8');
const meta=async(db,signature)=>(await db.query('select pg_get_functiondef(oid) definition,prosecdef,proconfig,proowner,proacl::text acl from pg_proc where oid=$1::regprocedure',[signature])).rows[0];
const result=promise=>promise.then(r=>r.rows[0],e=>({code:e.code,message:e.message}));
const item=(db,version=V)=>result(db.query('select public.tenh_cancel_order_item($1,$2,$3,$4,$5) value',[id(1),id(10),id(20),version,'Unavailable']));
const whole=(db,version=V)=>result(db.query("select public.tenh_run_branch_stock($1,'cancel_order',$2) value",[id(1),JSON.stringify({p_order_id:id(10),p_reason:'Unavailable',...(version===undefined?{}:{p_expected_updated_at:version})})]));
async function state(db){return (await db.query(`select jsonb_build_object(
 'orders',(select jsonb_agg(to_jsonb(t) order by id) from orders t),
 'items',(select jsonb_agg(to_jsonb(t) order by id) from order_items t),
 'products',(select jsonb_agg(to_jsonb(t) order by id) from products t),
 'stock',(select jsonb_agg(to_jsonb(t) order by product_id) from product_location_stock t),
 'movements',(select jsonb_agg(to_jsonb(t)) from inventory_movements t),
 'audit',(select jsonb_agg(to_jsonb(t)) from audit_logs t),
 'cash',(select jsonb_agg(to_jsonb(t)) from cash_movements t),
 'returns',(select jsonb_agg(to_jsonb(t)) from returns t),
 'holds',(select jsonb_agg(to_jsonb(t)) from tenh_pos_holds t),
 'members',(select jsonb_agg(to_jsonb(t)) from business_members t),
 'permissions',(select jsonb_agg(to_jsonb(t)) from business_member_permissions t),
 'credit',(select jsonb_agg(to_jsonb(t)) from customer_credit_ledger t),
 'loyalty',(select jsonb_agg(to_jsonb(t)) from customer_loyalty_transactions t),
 'points',(select jsonb_agg(to_jsonb(t)) from tenh_pos_points_used t)) value`)).rows[0].value;}
async function isolated(fn){const db=await open();try{await seed(db);await fn(db);}finally{await db.close();}}
(async()=>{
 // Captured real manage-order body, not the old synthetic replacement test.
 await isolated(async db=>{
  const before=await state(db),sig='public.tenh_manage_order(uuid,uuid,timestamptz,text,jsonb)',m=await meta(db,sig);
  const call=(version,action,payload)=>result(db.query('select public.tenh_manage_order($1,$2,$3,$4,$5) value',[id(1),id(10),version,action,JSON.stringify(payload)]));
  assert.equal((await call('2026-09-01','edit',{note:'changed'})).code,'PT409');assert.deepEqual(await state(db),before);
  await db.exec(migration('fix_order_conflict_nonretryable_sqlstate'));assert.deepEqual(await meta(db,sig),m,'already deployed migration is a no-op');
  assert.ok((await call(V,'edit',{note:'safe'})).value);assert.equal((await db.query('select customer_note from orders')).rows[0].customer_note,'safe');
  const now=(await db.query('select updated_at from orders')).rows[0].updated_at;
  await db.exec("update orders set amount_paid=1,payment_status='paid'");
  const paid=await state(db);assert.equal((await call(now,'delete',{reason:'r'})).code,'P0001');assert.deepEqual(await state(db),paid,'payment guard rejects without effects');
  await identity(db,id(77),id(2));assert.equal((await call(now,'edit',{note:'x'})).code,'42501');
 });
 await isolated(async db=>{
  const sig='public.tenh_cancel_order_item(uuid,uuid,uuid,timestamptz,text)',before=await meta(db,sig),s=await state(db);
  assert.equal((await item(db,'2026-09-01')).code,'40001');assert.deepEqual(await state(db),s);
  await db.exec(migration('cancel_order_item_nonretryable_conflict'));const after=await meta(db,sig);
  assert.equal(after.definition,before.definition.replace("errcode='40001'","errcode='PT409'"));
  for(const k of ['prosecdef','proconfig','proowner','acl'])assert.deepEqual(after[k],before[k],k);
  assert.equal((await item(db,'2026-09-01')).code,'PT409');assert.deepEqual(await state(db),s);
  await db.exec(migration('cancel_order_item_nonretryable_conflict'));assert.deepEqual(await meta(db,sig),after);
  await identity(db,id(77),id(2));assert.equal((await item(db)).code,'42501');
  await identity(db,id(99),id(3));assert.equal((await item(db)).code,'42501');
  await identity(db,id(99),id(2));await db.exec("update orders set amount_paid=1,payment_status='paid'");const paid=await state(db);
  assert.equal((await item(db)).code,'P0001');assert.deepEqual(await state(db),paid);
 });
 for(const order of [['whole_order_cancel_expected_version','cancel_order_item_nonretryable_conflict'],['cancel_order_item_nonretryable_conflict','whole_order_cancel_expected_version']]){
  await isolated(async db=>{
   const sig='public.tenh_run_branch_stock(uuid,text,jsonb)',before=await meta(db,sig);
   for(const n of order)await db.exec(migration(n));const after=await meta(db,sig);
   for(const k of ['prosecdef','proconfig','proowner','acl'])assert.deepEqual(after[k],before[k],k);
   await db.exec(migration('whole_order_cancel_expected_version'));assert.deepEqual(await meta(db,sig),after);
   const s=await state(db);assert.equal((await whole(db,'2026-09-01')).code,'PT409');assert.deepEqual(await state(db),s);
   assert.equal((await whole(db,null)).code,'22023');assert.deepEqual(await state(db),s);
   const missing=await result(db.query("select public.tenh_run_branch_stock($1,'cancel_order',$2)",[id(1),JSON.stringify({p_order_id:id(10),p_reason:'r'})]));assert.equal(missing.code,'22023');
   assert.equal((await whole(db,'invalid')).code,'22007');assert.deepEqual(await state(db),s);
   await identity(db,id(77),id(2));assert.equal((await whole(db)).code,'42501');
   await identity(db,id(99),id(3));assert.equal((await whole(db)).code,'P0001');
   await identity(db,id(99),id(2));
   const r=await item(db);assert.equal(r.value.wholeOrder,false);assert.equal((await db.query('select count(*)::int n from order_items')).rows[0].n,1);
   assert.deepEqual((await db.query('select subtotal,total,remaining_balance from orders')).rows[0],{subtotal:'20.00',total:'20.00',remaining_balance:'20.00'});
   assert.equal((await db.query('select stock_quantity from products where id=$1',[id(30)])).rows[0].stock_quantity,11);
   assert.equal((await db.query('select quantity from product_location_stock where product_id=$1',[id(30)])).rows[0].quantity,11);
   const next=(await db.query('select updated_at from orders')).rows[0].updated_at;
   const last=await result(db.query('select public.tenh_cancel_order_item($1,$2,$3,$4,$5) value',[id(1),id(10),id(21),next,'Unavailable']));
   assert.equal(last.value.wholeOrder,true,'last-item nested caller supplies its locked version');
   assert.equal((await db.query('select status from orders')).rows[0].status,'cancelled');
   assert.equal((await db.query('select quantity from product_location_stock where product_id=$1',[id(31)])).rows[0].quantity,21);
   const done=await state(db);assert.equal((await whole(db,V)).code,'PT409');assert.deepEqual(await state(db),done,'no double restoration on stale replay');
  });
 }
 // Whole-order success and rejection paths use the real stock wrapper + legacy body.
 await isolated(async db=>{
  await db.exec(migration('whole_order_cancel_expected_version'));
  for(const change of ["amount_paid=1","payment_status='pending_verification'","payment_reference='proof'","credit_amount=1","loyalty_points_earned=1","pos_checkout='{}'::jsonb","coupon_discount=1"]){
   await db.exec('begin');await db.exec('update orders set '+change);const before=await state(db);await db.exec('savepoint guard_check');assert.equal((await whole(db)).code,'P0001',change);await db.exec('rollback to guard_check');assert.deepEqual(await state(db),before);await db.exec('rollback');
  }
  await db.exec('begin');await db.query('insert into returns(id,business_id,order_id) values($1,$2,$3)',[id(70),id(1),id(10)]);const returned=await state(db);await db.exec('savepoint guard_check');assert.equal((await whole(db)).code,'P0001');await db.exec('rollback to guard_check');assert.deepEqual(await state(db),returned);await db.exec('rollback');
  assert.ok((await whole(db)).value);assert.equal((await db.query('select status from orders')).rows[0].status,'cancelled');
  assert.deepEqual((await db.query('select stock_quantity from products order by id')).rows.map(x=>x.stock_quantity),[11,21]);
  assert.deepEqual((await db.query('select quantity from product_location_stock order by product_id')).rows.map(x=>x.quantity),[11,21]);
  assert.equal((await db.query('select count(*)::int n from cash_movements')).rows[0].n,0);
 });
 await isolated(async db=>{
  const sig='public.tenh_run_branch_stock(uuid,text,jsonb)',before=await meta(db,sig);
  const itemBody=functions.find(f=>f.proname==='tenh_cancel_order_item').definition;
  await db.exec(itemBody.replace("jsonb_build_object('p_order_id',p_order_id,'p_reason',reason)","jsonb_build_object('p_order_id',p_order_id,'p_reason',reason || ' drift')"));
  await assert.rejects(db.exec(migration('whole_order_cancel_expected_version')),/Last-item cancellation caller changed/);await db.exec('rollback');
  assert.deepEqual(await meta(db,sig),before,'both changes roll back when the nested caller has drifted');
  await db.exec('set role authenticated');
  assert.equal((await result(db.query('select public.cancel_order($1,$2)',[id(10),'bypass']))).code,'42501','private legacy RPC cannot bypass wrapper version guard');
  await db.exec('reset role');
 });
 // Seven custom guards: real body before/after, no effects on stale requests, exact source/ACL preservation.
 await isolated(async db=>{
  await db.query("insert into tenh_pos_holds(id,business_id,created_by,location_id,label,draft,version) values($1,$2,$3,$4,'hold','{}',2)",[id(40),id(1),id(99),id(2)]);
  const input={requestId:id(50),branchId:id(2),holdId:id(40),holdVersion:1,paymentMethod:'cod',items:[{productId:id(30),quantity:1}]};
  const cases=[
   ['tenh_pos_hold','pos_hold_nonretryable_conflict',()=>db.query("select public.tenh_pos_hold($1,'save',$2,1,'changed','{}')",[id(1),id(40)])],
   ['tenh_pos_allocate_stock','pos_allocate_stock_nonretryable_conflict',()=>db.query('select public.tenh_pos_allocate_stock($1,$2,$3)',[id(1),id(2),JSON.stringify([{productId:id(30),quantity:1}])])],
   ['tenh_pos_checkout_before_currency','pos_checkout_hold_nonretryable_conflict',()=>db.query('select public.tenh_pos_checkout_before_currency($1,$2)',[id(1),JSON.stringify(input)])],
   ['tenh_update_online_order_status','online_order_status_nonretryable_conflict',()=>db.query("select public.tenh_update_online_order_status($1,$2,'accepted','ready')",[id(1),id(10)])],
   ['tenh_save_member_permissions','member_permissions_nonretryable_conflict',()=>db.query('select public.tenh_save_member_permissions($1,$2,$3,0,$4)',[id(1),id(99),id(98),['orders.view']])],
   ['tenh_users_edit','users_edit_nonretryable_conflict',()=>db.query("select public.tenh_users_edit($1,$2,$3,0,'edit','{}')",[id(1),id(99),id(98)])],
   ['tenh_users_delete_account','users_delete_account_nonretryable_conflict',()=>db.query("select public.tenh_users_delete_account($1,$2,$3,0,'DELETE')",[id(1),id(99),id(98)])],
  ];
  for(const [name,patch,call] of cases){
   const f=functions.find(x=>x.proname===name),sig='public.'+f.signature,before=await meta(db,sig),s=await state(db);
   const legacy=await result(call());assert.equal(legacy.code,'40001',name+' legacy guard '+JSON.stringify(legacy));assert.deepEqual(await state(db),s);
   await db.exec(migration(patch));const after=await meta(db,sig);
   assert.equal(after.definition,before.definition.replace("'40001'","'PT409'"),name+' changes one guard');
   // users_edit uses uppercase ERRCODE, but the literal code replacement remains exact.
   for(const k of ['prosecdef','proconfig','proowner','acl'])assert.deepEqual(after[k],before[k],name+' '+k);
   assert.equal((await result(call())).code,'PT409',name+' forward guard');assert.deepEqual(await state(db),s);
   await db.exec(migration(patch));assert.deepEqual(await meta(db,sig),after);
   // Deliberately drift the known guard in this local clone; never patch an unknown body.
   await db.exec(after.definition.replace("'PT409'","'P0001'"));
   await assert.rejects(db.exec(migration(patch)),/review this migration/);await db.exec('rollback');
   assert.equal((await result(call())).code,'P0001',name+' drift is untouched');await db.exec(after.definition);
  }
  assert.equal((await result(db.query('select public.tenh_incoming_order_action($1,$2,$3,$4,$5)',[id(1),id(10),'status','accepted','ready']))).code,'PT409','real online caller propagates');
  assert.equal((await result(db.query('select public.tenh_pos_checkout_registered($1,$2)',[id(1),JSON.stringify(input)]))).code,'P0001','real register caller preserves open-register safeguard');
  await db.query('insert into cash_register_shifts(id,business_id,location_id,opened_by,status) values($1,$2,$3,$4,$5)',[id(60),id(1),id(2),id(99),'open']);
  assert.equal((await result(db.query('select public.tenh_pos_checkout_registered($1,$2)',[id(1),JSON.stringify(input)]))).code,'PT409','real checkout chain propagates the hold guard');
 });
 console.log('real-body safety checks: manage/item/whole-order + seven stale guards + real POS/online callers passed');
 console.log('LIMITS: no HTTP/Supabase, concurrent sessions, foreign keys, RLS or triggers; no successful checkout/account deletion proof.');
})().catch(e=>{console.error(e);process.exitCode=1;});
