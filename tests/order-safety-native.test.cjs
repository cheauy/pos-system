/* eslint-disable @typescript-eslint/no-require-imports */
// Real PostgreSQL roles, captured RLS/FKs/triggers, and two independent backend sessions.
// No production URL, credentials, rows or existing data directory are consumed.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {openNative}=require('./helpers/order-safety-native.cjs');
const {identity,id,V}=require('./helpers/order-safety-db.cjs');
const migrations=[
 '20261007174209_fix_order_conflict_nonretryable_sqlstate.sql',
 '20261007193640_whole_order_cancel_expected_version.sql',
 '20261007193643_pos_hold_nonretryable_conflict.sql',
 '20261007193646_pos_allocate_stock_nonretryable_conflict.sql',
 '20261007193651_pos_checkout_hold_nonretryable_conflict.sql',
 '20261007193654_online_order_status_nonretryable_conflict.sql',
 '20261008001000_cancel_order_item_nonretryable_conflict.sql',
 '20261008043516_online_order_opened_version.sql',
 '20261008045323_manage_order_branch_cancellation.sql',
];
const tables=['orders','order_items','products','product_location_stock','inventory_movements','audit_logs','cash_movements','cash_register_shifts','returns','return_items','customers','customer_credit_accounts','customer_credit_ledger','customer_loyalty_transactions','tenh_pos_holds','tenh_pos_points_used','business_coupons','coupon_redemptions'];
async function state(db){
 const result={};
 for(const name of tables)result[name]=(await db.query("select coalesce(jsonb_agg(j order by j::text),'[]'::jsonb) as rows from (select to_jsonb(t) as j from public."+name+" t) s")).rows[0].rows;
 return result;
}
async function financialFixture(db){
 await db.query("insert into customers(id,business_id,owner_id,location_id,name,loyalty_points) values($1,$2,$3,$4,'Existing customer',12)",[id(80),id(1),id(99),id(2)]);
 await db.query('insert into customer_credit_accounts(business_id,customer_id,credit_limit,balance) values($1,$2,100,50)',[id(1),id(80)]);
 await db.query("insert into customer_credit_ledger(business_id,customer_id,entry_type,amount,balance_after,created_by) values($1,$2,'charge',50,50,$3)",[id(1),id(80),id(99)]);
 await db.query('insert into cash_register_shifts(id,business_id,location_id,opened_by,opening_cash) values($1,$2,$3,$4,100)',[id(60),id(1),id(2),id(99)]);
 await db.query("insert into cash_movements(business_id,shift_id,location_id,created_by,movement_type,amount,reason) values($1,$2,$3,$4,'cash_in',10,'Existing cash')",[id(1),id(60),id(2),id(99)]);
}
const whole=(db,version=V)=>db.query("select public.tenh_run_branch_stock($1,'cancel_order',$2)",[id(1),{p_order_id:id(10),p_reason:'Unavailable',p_expected_updated_at:version}]);
const item=(db,version=V,line=id(20))=>db.query('select public.tenh_cancel_order_item($1,$2,$3,$4,$5)',[id(1),id(10),line,version,'Unavailable']);
const online=(db,version=V)=>db.query("select public.tenh_incoming_order_action($1,$2,'status','rejected','new',$3)",[id(1),id(10),version]);
const manageStatus=(db,version=V)=>db.query("select public.tenh_manage_order($1,$2,$3,'status',$4)",[id(1),id(10),version,{status:'cancelled',reason:'Unavailable'}]);
const manageDelete=(db,version=V)=>db.query("select public.tenh_manage_order($1,$2,$3,'delete',$4)",[id(1),id(10),version,{reason:'Unavailable'}]);
const cancellationPaths=[['whole',whole],['item',item],['online',online],['manage-status',manageStatus],['manage-delete',manageDelete]];
async function actor(db,user=id(99),branch=id(2)){
 await identity(db,user,branch);await db.query('set role authenticated');
}
async function refused(db,call,codes){
 await assert.rejects(call(),e=>codes.includes(e.code),'expected rollback SQLSTATE '+codes.join('/'));
}
async function waitForBlock(db,waiting,blocking){
 const deadline=Date.now()+5000;
 while(Date.now()<deadline){
  const r=await db.query('select $2::int=any(pg_blocking_pids($1::int)) as blocked',[waiting,blocking]);
  if(r.rows[0].blocked)return;
  await new Promise(ok=>setTimeout(ok,10));
 }
 throw new Error('Second backend never demonstrated blocking on the first');
}
test('isolated PostgreSQL order safety',async t=>{
 const h=await openNative(),{db}=h;
 try{
  for(const name of migrations)await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
  const manage=(await db.query("select pg_get_functiondef('public.tenh_manage_order(uuid,uuid,timestamptz,text,jsonb)'::regprocedure) as body")).rows[0].body;
  assert.match(manage,/errcode='PT409'/,'deployed manage-order PT409 preserved');
  const body=(await db.query("select pg_get_functiondef('public.tenh_incoming_order_action(uuid,uuid,text,text,text,timestamptz)'::regprocedure) as body")).rows[0].body;
  await db.exec(fs.readFileSync('supabase/migrations/'+migrations.at(-1),'utf8'));
  assert.equal((await db.query("select pg_get_functiondef('public.tenh_incoming_order_action(uuid,uuid,text,text,text,timestamptz)'::regprocedure) as body")).rows[0].body,body,'new migration idempotent');
  await t.test('captured RLS, foreign keys, branch triggers and RPC ACLs are enforced',async()=>{
   await h.reseed();await actor(db,id(77));
   assert.equal((await db.query('select count(*)::int n from orders')).rows[0].n,0,'outsider sees no orders');
   assert.equal((await db.query('update orders set amount_paid=999 returning id')).rowCount,0,'RLS denies outsider writes');
   await refused(db,()=>whole(db),['42501']);
   await refused(db,()=>db.query("select public.tenh_incoming_order_action($1,$2,'status','rejected','new')",[id(1),id(10)]),['42501']);
   await db.query('reset role');await identity(db,id(99),id(2));
   await refused(db,()=>db.query("insert into order_items(order_id,owner_id,product_id,product_name,quantity,unit_price,subtotal) values($1,$2,$3,'Missing product',1,10,10)",[id(10),id(99),id(999)]),['23503']);
   await refused(db,()=>db.query('update order_items set order_id=$1 where id=$2',[id(999),id(20)]),['P0001']);
   await actor(db,id(99),id(3));
   assert.equal((await db.query('select count(*)::int n from orders')).rows[0].n,0,'branch RLS');
   await refused(db,()=>item(db),['42501']);
   await db.query('reset role');
  });
  await t.test('stale, missing, unauthorized, paid and refunded requests preserve all stock and financial rows',async()=>{
   for(const [name,call] of cancellationPaths){
    for(const [scenario,setup,codes] of [
     ['stale',async()=>{},['PT409']],
     ['missing',async()=>{},['22023','PT409']],
     ['unauthorized',async()=>{},['42501']],
     ['paid',async()=>db.exec("update orders set amount_paid=30,payment_status='paid'"),['P0001']],
     ['refunded',async()=>db.exec("update orders set payment_status='refunded'"),['P0001']],
     ['refund-record',async()=>db.query("insert into returns(id,business_id,owner_id,order_id,location_id,return_number,reason,refund_amount) values($1,$2,$3,$4,$5,'RET-SAFETY','Refund fixture',10)",[id(70),id(1),id(99),id(10),id(2)]),['P0001']],
    ]){
     await h.reseed();await financialFixture(db);await setup();const before=await state(db);
     await actor(db,scenario==='unauthorized'?id(77):id(99));
     await refused(db,()=>call(db,scenario==='stale'?'2026-09-01T00:00:00Z':scenario==='missing'?null:V),codes);
     await db.query('reset role');assert.deepEqual(await state(db),before,name+' '+scenario);
    }
   }
  });
  await t.test('POS held-version and stock-allocation conflicts leave holds, stock and finance unchanged',async()=>{
   await h.reseed();await financialFixture(db);
   await db.query("insert into tenh_pos_holds(id,business_id,created_by,location_id,label,draft,version) values($1,$2,$3,$4,'hold',$5,2)",[id(40),id(1),id(99),id(2),{branchId:id(2),lines:[{productId:id(30),quantity:1}]}]);
   const input={requestId:id(50),branchId:id(2),holdId:id(40),holdVersion:1,paymentMethod:'cod',items:[{productId:id(30),quantity:1}]};
   const before=await state(db);await actor(db);
   for(const call of [
    ()=>db.query("select public.tenh_pos_hold($1,'save',$2,1,'changed',$3)",[id(1),id(40),{branchId:id(2),lines:[{productId:id(30),quantity:2}]}]),
    ()=>db.query('select public.tenh_pos_allocate_stock($1,$2,$3)',[id(1),id(2),JSON.stringify([{productId:id(30),quantity:1}])]),
    ()=>db.query('select public.tenh_pos_checkout_registered($1,$2)',[id(1),input]),
   ]){
    await refused(db,call,['PT409']);await db.query('reset role');assert.deepEqual(await state(db),before);await actor(db);
   }
   await db.query('reset role');
  });
  await t.test('unpaid whole-order, online rejection, item and last-item restore each affected product once',async()=>{
   for(const [name,call] of cancellationPaths){
    await h.reseed();await actor(db);await call(db);
    await db.query('reset role');
    const first=await state(db);
    assert.equal(first.products.find(x=>x.id===id(30)).stock_quantity,11,name+' global stock');
    assert.equal(first.product_location_stock.find(x=>x.product_id===id(30)).quantity,11,name+' branch stock');
    assert.equal(first.inventory_movements.filter(x=>x.product_id===id(30)).length,1,name+' movement');
    await actor(db);await refused(db,()=>call(db),['PT409','P0001']);
    await db.query('reset role');assert.deepEqual(await state(db),first,name+' replay');
    if(name==='item'){
     const version=(await db.query('select updated_at::text from orders')).rows[0].updated_at;
     await actor(db);await item(db,version,id(21));await db.query('reset role');
     const last=await state(db);assert.equal(last.orders[0].status,'cancelled');
     assert.deepEqual(last.products.map(x=>x.stock_quantity).sort((a,b)=>a-b),[11,21]);
     assert.equal(last.inventory_movements.length,2,'last-item calls guarded whole-order wrapper with locked timestamp');
     await actor(db);await refused(db,()=>item(db,version,id(21)),['PT409','P0001']);await db.query('reset role');
     assert.deepEqual(await state(db),last,'last-item replay unchanged');
    }
   }
  });
  await t.test('a failing ledger trigger rolls back preceding stock work and online status',async()=>{
   await db.query('reset role');
   await db.exec("create function public.safety_fail_ledger() returns trigger language plpgsql as $$ begin raise exception 'fixture ledger failure'; end $$;create trigger safety_fail_ledger before insert on inventory_movements for each row execute function public.safety_fail_ledger()");
   try{
    for(const [,call] of cancellationPaths){
     await h.reseed();const before=await state(db);await actor(db);
     await refused(db,()=>call(db),['P0001']);await db.query('reset role');assert.deepEqual(await state(db),before);
    }
   }finally{await db.exec('drop trigger safety_fail_ledger on inventory_movements;drop function public.safety_fail_ledger()');}
  });
  await t.test('two independent sessions: whole-order, last-item and online races restore exactly once',async()=>{
   const a=await h.connect(),b=await h.connect();
   const pidA=(await a.query('select pg_backend_pid() pid')).rows[0].pid,pidB=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
   assert.notEqual(pidA,pidB);
   for(const [name,call] of [['whole',whole],['online',online],['last-item',item],['manage-status',manageStatus],['manage-delete',manageDelete]]){
    await h.reseed();
    if(name==='last-item'){await db.exec('delete from order_items where id=\''+id(21)+'\';update orders set subtotal=10,total=10,remaining_balance=10');}
    await a.query('begin');await actor(a);await b.query('begin');await actor(b);
    try{
     await call(a);
     const second=call(b).then(()=>({ok:true}),e=>({code:e.code}));
     await waitForBlock(db,pidB,pidA);await a.query('commit');const winner=await state(db);
     assert.equal((await second).code,name==='manage-delete'?'P0001':'PT409',name+' loser sees committed version/archive');
     await b.query('rollback');const s=await state(db);
     assert.deepEqual(s,winner,name+' losing transaction has no additional effects');
     assert.equal(s.products.find(x=>x.id===id(30)).stock_quantity,11,name);
     assert.equal(s.product_location_stock.find(x=>x.product_id===id(30)).quantity,11,name);
     assert.equal(s.inventory_movements.filter(x=>x.product_id===id(30)).length,1,name);
     assert.equal(s.cash_movements.length,0);assert.equal(s.customer_credit_ledger.length,0);
     assert.equal(s.orders[0].status,'cancelled');
    }finally{await a.query('rollback');await b.query('rollback');await a.query('reset role');await b.query('reset role');}
   }
  });
  await t.test('concurrent payment/refund wins: cancellation observes locked financial state without effects',async()=>{
   const a=await h.connect(),b=await h.connect();
   const pidA=(await a.query('select pg_backend_pid() pid')).rows[0].pid,pidB=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
   for(const [,call] of cancellationPaths)for(const status of ['paid','refunded']){
    await h.reseed();await financialFixture(db);await a.query('begin');await actor(a);await actor(b);
    try{
     await a.query('update orders set payment_status=$1,amount_paid=30 where id=$2',[status,id(10)]);
     const cancellation=call(b).then(()=>({ok:true}),e=>({code:e.code}));
     await waitForBlock(db,pidB,pidA);await a.query('commit');const paid=await state(db);
     assert.equal((await cancellation).code,'P0001');assert.deepEqual(await state(db),paid);
     assert.equal(paid.products.find(x=>x.id===id(30)).stock_quantity,10);
     assert.equal(paid.inventory_movements.length,0);
    }finally{await a.query('rollback');await a.query('reset role');await b.query('reset role');}
   }
  });
  console.log('Coverage: captured function bodies; 43 RLS policies; captured FK/NOT NULL constraints; 17 representative triggers; 30 refusal cases with populated finance; atomic rollback; 15 two-session lock races. Pass/fail is the TAP result. No production mutations.');
 }finally{await h.close();}
});
