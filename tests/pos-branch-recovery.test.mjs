import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs, queryDouble} from './helpers/load-ts.cjs';

const B = '10000000-0000-4000-8000-000000000001';
const A = '20000000-0000-4000-8000-000000000001';
const C = '20000000-0000-4000-8000-000000000002';
const CUSTOMER = '30000000-0000-4000-8000-000000000001';
const REQUEST = '40000000-0000-4000-8000-000000000001';
const outcome = loadTs('lib/operations/rpc-outcome.ts');
const helpers = loadTs('app/(dashboard)/dashboard/pos/pos-customer-helpers.ts');
const input = {branchId:A, id:CUSTOMER, name:'New Buyer', phone:'012345678', address:'Main street', email:'buyer@example.com', birthday:'2000-02-29'};

for (const code of ['22003','22P02','23502','23505','40001','40P01','P0001','P0002','P0003']) {
  test(`confirmed rollback classification: ${code}`, () => assert.equal(outcome.isConfirmedRollback({code}), true));
}
for (const code of ['08006','08007','42501','42883','42703','42P01','PGRST202','PGRST301','XX000',undefined,null,123]) {
  test(`uncertain/auth/schema response retains request: ${String(code)}`, () => assert.equal(outcome.isConfirmedRollback({code}), false));
}

function workspace(overrides = {}) {
  const tables = [], rpcCalls = [];
  const catalog = {
    businessId:B, inventoryVersion:2, checkoutVersion:3, defaultBranchId:C,
    shift:{id:'wrong-cashier-shift',location_id:C},
    products:[{id:'shirt',category_id:'shared'},{id:'hidden-category',category_id:'other'},{id:'unassigned',category_id:null}],
    stock:[{product_id:'shirt',location_id:A},{product_id:'hidden-category',location_id:A}],
    holds:[{id:'here',draft:{branchId:A}},{id:'elsewhere',draft:{branchId:C}}],
  };
  const business = {id:B,role:'owner',name:'Test business'};
  let dbCreated = 0;
  const db = {
    from(table) {
      const results = {
        customers:{data:[],error:null},
        categories:{data:[{id:'shared',branch_ids:null},{id:'other',branch_ids:[C]}],error:null},
        cash_register_shifts:{data:overrides.shifts ?? [{id:'main-drawer',location_id:A}],error:overrides.shiftError ?? null},
      };
      assert.ok(table in results, `Unexpected table: ${table}`);
      return queryDouble(table,results[table],tables);
    },
    async rpc(name,args) {
      rpcCalls.push({name,args});
      if (name==='tenh_pos_catalog') return {data:structuredClone(catalog),error:null};
      if (name==='tenh_pos_receipt_update_ready') return {data:true,error:null};
      if (name==='tenh_pos_checkout_registered') {
        if (overrides.transport) throw new Error('connection lost');
        return overrides.checkoutResult ?? {data:{orderId:'saved',remaining:0},error:null};
      }
      if (name==='tenh_pos_allocate_stock') return {data:null,error:null};
      throw new Error(name);
    },
  };
  const api = loadTs('app/(dashboard)/dashboard/pos/pos-workspace-actions.ts', {
    '@/lib/branches/context':{
      getBranchContext:async()=>({business,branchId:A}),
      assertOperatingBranch:async id=>{if(id!==A)throw new Error('Branch changed');},
    },
    '@/lib/subscriptions/branch-limits':{assertBranchOperation:async()=>{}},
    '@/lib/operations/rpc-outcome':outcome,
    '@/lib/auth/require-permission':{requirePermission:async()=>business},
    '@/lib/supabase/branch-server':{createClient:async()=>{dbCreated++;return db;}},
    '@/lib/receipts/load-receipt-context':{loadReceiptContext:async()=>({source:'unchanged'})},
    'next/cache':{revalidatePath(){if(overrides.cacheError)throw Error('cache offline');}},
    './pos-workspace-helpers':{
      uuid:v=>typeof v==='string' && /^[0-9a-f-]{36}$/i.test(v),
      // Cart arithmetic itself is not under test in these orchestration cases.
      validateCheckout:()=>null,
    },
  });
  return {api,tables,rpcCalls,dbCreated:()=>dbCreated};
}

test('catalog uses operating-branch drawer, even when the catalog returns another cashier branch', async()=>{
  const {api,tables}=workspace();const result=await api.loadPosWorkspace(B,A);
  assert.equal(result.success,true);assert.equal(result.data.shift.id,'main-drawer');
  assert.equal(result.data.shift.location_id,A);assert.equal(result.data.defaultBranchId,A);
  assert.deepEqual(result.data.holds.map(h=>h.id),['here']);assert.deepEqual(result.data.products.map(p=>p.id),['shirt']);
  const query=tables.find(t=>t.table==='cash_register_shifts');
  for(const filter of [['eq','business_id',B],['eq','location_id',A],['eq','status','open'],['limit',2]]) assert.ok(query.steps.some(s=>JSON.stringify(s)===JSON.stringify(filter)));
});
test('closed/missing operating drawer overrides stale catalog drawer with null', async()=>{
  const {api}=workspace({shifts:[]});const r=await api.loadPosWorkspace(B,A);assert.equal(r.success,true);assert.equal(r.data.shift,null);
});
test('multiple open drawers produce explicit failure, not an arbitrary first match', async()=>{
  const {api}=workspace({shifts:[{id:'one',location_id:A},{id:'two',location_id:A}]});
  const r=await api.loadPosWorkspace(B,A);assert.equal(r.success,false);assert.match(r.message,/multiple open registers/i);
});
test('failed register query does not pretend the drawer is closed or ready', async()=>{
  const {api}=workspace({shiftError:{message:'unavailable'}});const r=await api.loadPosWorkspace(B,A);assert.equal(r.success,false);
});
test('stale/invalid expected branch is rejected before any database load', async()=>{
  for(const branch of [C,'not-a-branch']){const h=workspace();const r=await h.api.loadPosWorkspace(B,branch);assert.equal(r.success,false);assert.equal(h.dbCreated(),0);assert.equal(h.rpcCalls.length,0);}
});
test('stale business does not query a replacement business', async()=>{
  const h=workspace();const r=await h.api.loadPosWorkspace('another',A);assert.equal(r.success,false);assert.equal(h.dbCreated(),0);
});
test('checkout preflight branch switch keeps pending request and sends no new sale', async()=>{
  const h=workspace();const sale={requestId:REQUEST,branchId:C};const r=await h.api.completePosSale(B,sale);
  assert.equal(r.success,false);assert.equal(r.uncertain,true);assert.equal(h.rpcCalls.length,0);assert.equal(sale.requestId,REQUEST);
});
for(const code of ['08006','PGRST202','42501','23514']) test(`checkout ${code} recovery semantics`,async()=>{
  const h=workspace({checkoutResult:{data:null,error:{code,message:'Database response'}}});
  const sale={requestId:REQUEST,branchId:A};const r=await h.api.completePosSale(B,sale);
  assert.equal(r.success,false);assert.equal(r.uncertain,code!=='23514');assert.equal(h.rpcCalls[0].args.p_input,sale);
});
test('transport failure leaves outcome for the existing client recovery handler',async()=>{
  const h=workspace({transport:true});await assert.rejects(h.api.completePosSale(B,{requestId:REQUEST,branchId:A}),/connection lost/);
});
test('postcommit checkout cache failure still returns the saved order',async()=>{
  const h=workspace({cacheError:true});const r=await h.api.completePosSale(B,{requestId:REQUEST,branchId:A});assert.equal(r.success,true);assert.equal(r.data.orderId,'saved');
});
test('allocation cannot run against another operating branch',async()=>{
  const h=workspace();const r=await h.api.allocatePosStock(B,C,[{productId:CUSTOMER,quantity:1}]);assert.equal(r.success,false);assert.equal(h.rpcCalls.length,0);
});

function customers(options={}) {
  const queries=[],calls=[];let dbCount=0;
  const business={id:options.businessId || B,role:'owner'};
  const row={id:CUSTOMER,name:'New Buyer',phone:input.phone,address:input.address,created_at:'2026-09-20T00:00:00Z'};
  const db={from(table){
    if(table==='business_customer_settings') return queryDouble(table,{data:options.flags ?? {email_enabled:true,birthday_enabled:true},error:null},queries);
    assert.equal(table,'customers');return queryDouble(table,call=>call.steps.some(s=>s[0]==='single')?(options.savedResult ?? {data:{id:CUSTOMER},error:null}):{data:[row],error:null},queries);
  },async rpc(name,args){calls.push({name,args});return options.rpcResult ?? {data:row,error:null};}};
  const api=loadTs('app/(dashboard)/dashboard/pos/pos-customer-actions.ts',{
    '@/lib/branches/context':{getBranchContext:async()=>({business,branchId:A}),assertOperatingBranch:async id=>{if(id!==A)throw Error('branch');}},
    '@/lib/operations/rpc-outcome':outcome,
    '@/lib/auth/require-permission':{requirePermission:async()=>business},
    '@/lib/auth/permissions':{hasPermission:()=>options.permission!==false},
    '@/lib/supabase/branch-server':{createClient:async()=>{dbCount++;return db;}},
    'next/cache':{revalidatePath(){}},
    './pos-customer-helpers':helpers,
  });return{api,queries,calls,dbCount:()=>dbCount};
}

test('customer list rechecks expected branch and applies tenant + branch filters',async()=>{
  const h=customers();const r=await h.api.fetchPosCustomers(B,'buyer',0,A);assert.equal(r.success,true);
  const q=h.queries.find(q=>q.table==='customers');assert.ok(q.steps.some(s=>s[0]==='eq'&&s[1]==='business_id'&&s[2]===B));assert.ok(q.steps.some(s=>s[0]==='eq'&&s[1]==='location_id'&&s[2]===A));
  assert.ok(q.steps.some(s=>s[0]==='order'&&s[1]==='created_at'&&s[2].ascending===false&&s[2].nullsFirst===false));
});
test('customer list rejects stale branch before touching customer data',async()=>{
  const h=customers();const r=await h.api.fetchPosCustomers(B,'',0,C);assert.equal(r.success,false);assert.equal(h.dbCount(),0);
});
test('new customer request binds its UUID to its original branch',async()=>{
  const h=customers();const r=await h.api.createPosCustomer(B,{...input,branchId:C});assert.equal(r.success,false);assert.equal(r.uncertain,true);assert.equal(h.calls.length,0);
});
test('legacy unresolved customer request is not silently replayed into another branch',async()=>{
  const h=customers();const old={...input};delete old.branchId;const r=await h.api.createPosCustomer(B,old);assert.equal(r.success,false);assert.equal(r.uncertain,true);assert.equal(h.calls.length,0);
});
test('customer field toggles are rechecked on save and hidden fields are stripped',async()=>{
  const h=customers({flags:{email_enabled:false,birthday_enabled:false}});
  const r=await h.api.createPosCustomer(B,{...input,email:'not-valid',birthday:'not-a-date'});assert.equal(r.success,true);
  assert.equal(h.calls[0].args.p_input.email,'');assert.equal(h.calls[0].args.p_input.birthday,'');assert.equal(h.calls[0].args.p_id,input.id);
});
test('enabled optional fields are saved and invalid enabled email is rejected',async()=>{
  const h=customers();const r=await h.api.createPosCustomer(B,input);assert.equal(r.success,true);assert.equal(h.calls[0].args.p_input.email,input.email);assert.equal(h.calls[0].args.p_input.birthday,input.birthday);
  const bad=customers();assert.equal((await bad.api.createPosCustomer(B,{...input,email:'bad'})).success,false);assert.equal(bad.calls.length,0);
});
test('postcommit customer visibility failure retains UUID, rather than enabling a duplicate',async()=>{
  for(const savedResult of [{data:null,error:null},{data:null,error:{message:'network'}}]){
    const h=customers({savedResult});const r=await h.api.createPosCustomer(B,input);assert.equal(r.success,false);assert.equal(r.uncertain,true);assert.equal(h.calls[0].args.p_id,input.id);
  }
});
test('customer schema/auth errors retain pending UUID, unique violation is definite',async()=>{
  for(const code of ['PGRST202','42501','23505']) {const h=customers({rpcResult:{data:null,error:{code,message:'problem'}}});const r=await h.api.createPosCustomer(B,input);assert.equal(r.uncertain,code!=='23505');}
});
test('customer permission revoked while a pending request exists does not discard it',async()=>{
  const h=customers({permission:false});const r=await h.api.createPosCustomer(B,input);assert.equal(r.uncertain,true);assert.equal(h.calls.length,0);
});
