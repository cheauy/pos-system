import test from 'node:test';
import assert from 'node:assert/strict';
import * as jsx from 'react/jsx-runtime';
import {loadTs,queryDouble} from './helpers/load-ts.cjs';

test('supplier name, contact, phone and address are required; email and notes remain optional',async()=>{
  const inserts=[];
  const api=loadTs('app/(dashboard)/dashboard/suppliers/actions.ts',{
    'next/cache':{revalidatePath(){}},'next/navigation':{redirect(){throw Error('redirect');}},
    '@/lib/auth/require-permission':{requirePermission:async()=>({id:'business'})},
    '@/lib/supabase/branch-server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'user'}}})},from:()=>({insert:async row=>{inserts.push(row);return {error:null};}})})},
  });
  const valid={name:'Supplier',contactPerson:'Dara',phone:'012345678',address:'Phnom Penh'};
  for(const key of Object.keys(valid)){
    const form=new FormData();for(const [k,v] of Object.entries(valid))form.set(k,k===key?' ':v);
    await assert.rejects(api.createSupplier(form),/required/);
  }
  assert.equal(inserts.length,0);
  const form=new FormData();for(const [k,v] of Object.entries(valid))form.set(k,v);
  await api.createSupplier(form);assert.equal(inserts.length,1);assert.equal(inserts[0].email,null);assert.equal(inserts[0].notes,null);
});

test('payment success waits five seconds and cancels timers when leaving the page',()=>{
  const timers=[],cleared=[],navigations=[];let cleanup;
  const original=globalThis.window;
  globalThis.window={setTimeout:(fn,ms)=>{timers.push({fn,ms});return 1;},setInterval:()=>2,clearTimeout:id=>cleared.push(id),clearInterval:id=>cleared.push(id)};
  try{
    const Component=loadTs('components/payment-success-redirect.tsx',{'react/jsx-runtime':jsx,react:{useState:()=>[5,()=>{}],useEffect:fn=>{cleanup=fn();}},'next/navigation':{useRouter:()=>({replace:url=>navigations.push(url)})}}).default;
    Component({href:'/dashboard/settings/subscription',label:'Subscription Overview'});
    assert.equal(timers[0].ms,5000);assert.deepEqual(navigations,[]);timers[0].fn();assert.deepEqual(navigations,['/dashboard/settings/subscription']);cleanup();assert.deepEqual(cleared,[2,1]);
  }finally{globalThis.window=original;}
});

test('unfinished checkout hides at expiry but submitted payments keep their review notice',()=>{
  const original=globalThis.window;let timer,expired=false;
  globalThis.window={setTimeout:(fn,ms)=>{timer={fn,ms};return 1;},clearTimeout(){}};
  try{
    const Component=loadTs('app/(dashboard)/dashboard/settings/business/pending-checkout-notice.tsx',{'react/jsx-runtime':jsx,'next/link':()=>null,react:{useState:()=>[expired,v=>{expired=v;}],useEffect:fn=>fn()}}).default;
    const order={id:'order',status:'pending_payment',payment_expires_at:new Date(Date.now()+1000).toISOString(),created_at:new Date().toISOString()};
    assert.ok(Component({order}));assert.ok(timer.ms>0&&timer.ms<=1000);timer.fn();assert.equal(Component({order}),null);
    assert.ok(Component({order:{...order,status:'payment_submitted'}}));
  }finally{globalThis.window=original;}
});

test('register queries exclude other branches before returning browser data',async()=>{
  for(const role of ['staff','owner']){
    const queries=[];
    const db={from:table=>queryDouble(table,{error:null,data:table==='business_locations'?[{id:'own',is_active:true},{id:'other',is_active:true},{id:'closing',is_active:true,plan_disable_pending:true}]:[]},queries)};
    const Page=loadTs('app/(dashboard)/dashboard/register/page.tsx',{'react/jsx-runtime':jsx,'@/lib/branches/context':{getBranchContext:async()=>({branchId:'own'})},'@/lib/auth/require-permission':{requirePermission:async()=>({id:'business',role})},'@/lib/supabase/admin':{supabaseAdmin:db},'./register-client':()=>null}).default;
    const page=await Page();
    for(const query of queries.filter(q=>q.table==='cash_register_shifts'))assert.deepEqual(query.steps.find(s=>s[0]==='in'),['in','location_id',role==='owner'?['own','closing']:['own']]);
    assert.deepEqual(page.props.branches.map(b=>b.id),['own']);
  }
});

test('low stock includes branch bundle stock and scopes paginated supplier history',async()=>{
  const queries=[];const products=[{id:'bundle',name:'Branch set',sku:'SET',low_stock_quantity:5,cost_price:4},{id:'stocked',name:'Stocked',low_stock_quantity:2,cost_price:1}];
  const rows={branch_products:products,business_locations:[{id:'branch',name:'Main'},{id:'other',name:'Other'}],product_location_stock:[{product_id:'bundle',location_id:'branch',quantity:0,low_stock_threshold:5},{product_id:'stocked',location_id:'branch',quantity:10,low_stock_threshold:2},{product_id:'bundle',location_id:'other',quantity:0,low_stock_threshold:5}],suppliers:[],purchase_order_items:[],stock_adjustments:[]};
  const db={from:table=>queryDouble(table,{data:rows[table],error:null},queries)};
  const Page=loadTs('app/(dashboard)/dashboard/low-stock/page.tsx',{'react/jsx-runtime':jsx,'@/lib/supabase/read-all-rows':{readAllRows:fn=>fn(0,999)},'@/lib/branches/context':{getBranchContext:async()=>({branchId:'branch'})},'@/lib/auth/require-permission':{requirePermission:async()=>({id:'business'})},'@/lib/supabase/branch-server':{createClient:async()=>db},'./low-stock-client':()=>null}).default;
  const page=await Page();assert.equal(page.props.rows.length,1);assert.equal(page.props.rows[0].productId,'bundle');assert.equal(page.props.rows[0].status,'out_of_stock');assert.equal(page.props.rows[0].branchId,'branch');
  const history=queries.find(q=>q.table==='purchase_order_items');assert.ok(history.steps.some(s=>s[0]==='eq'&&s[1]==='purchase_orders.location_id'&&s[2]==='branch'));assert.ok(history.steps.some(s=>s[0]==='range'));
});
