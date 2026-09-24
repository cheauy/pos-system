import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs, queryDouble} from './helpers/load-ts.cjs';

function statusHarness(options={}) {
  const queries=[],calls=[],audits=[],paths=[];
  const order={id:'order',order_number:'ONLINE-1',status:'pending',online_status:'new',order_source:'online'};
  const db={
    from:table=>queryDouble(table,{data:options.missing?null:order,error:null},queries),
    rpc:async(name,args)=>{calls.push({name,args});return options.result ?? {data:{orderId:'order',onlineStatus:options.target || 'accepted',alreadyApplied:options.alreadyApplied || false},error:null};},
  };
  const api=loadTs('app/(dashboard)/dashboard/online-orders/actions.ts',{
    'next/cache':{revalidatePath(p){paths.push(p);if(options.cacheError)throw Error('cache');}},
    '@/lib/audit/create-audit-log':{createAuditLog:async a=>{audits.push(a);if(options.auditError)throw Error('audit');}},
    '@/lib/auth/require-permission':{requirePermission:async p=>{assert.equal(p,options.target==='rejected'?'orders.cancel':'orders.update');return{id:'business'};}},
    '@/lib/supabase/branch-server':{createClient:async()=>db},
  });return{api,queries,calls,audits,paths};
}
for(const next of ['accepted','preparing','ready','completed','rejected']) test(`online ${next}: one transactional RPC, no separate status update`,async()=>{
  const h=statusHarness({target:next});const r=await h.api.updateOnlineOrderStatus('order',next);assert.equal(r.success,true);
  assert.deepEqual(h.calls,[{name:'tenh_update_online_order_status',args:{p_business:'business',p_order:'order',p_status:next,p_expected_status:'new'}}]);
  assert.ok(!h.queries.flatMap(q=>q.steps).some(s=>s[0]==='update'));assert.equal(h.audits.length,1);
});
test('same applied status does not duplicate application audit',async()=>{
  const h=statusHarness({alreadyApplied:true});const r=await h.api.updateOnlineOrderStatus('order','accepted');assert.equal(r.success,true);assert.equal(h.audits.length,0);
});
test('postcommit audit failure does not encourage repeat cancellation or stock return',async()=>{
  const h=statusHarness({auditError:true,target:'rejected'});assert.equal((await h.api.updateOnlineOrderStatus('order','rejected')).success,true);assert.equal(h.calls.length,1);
});
test('postcommit cache failure does not mark saved status failed',async()=>{
  const h=statusHarness({cacheError:true});assert.equal((await h.api.updateOnlineOrderStatus('order','accepted')).success,true);
});
test('missing new RPC reports its migration and does not fall back to two writes',async()=>{
  const h=statusHarness({result:{data:null,error:{code:'PGRST202',message:'missing'}}});
  const r=await h.api.updateOnlineOrderStatus('order','accepted');assert.equal(r.success,false);assert.match(r.message,/20260921110000_operating_branch_completion.sql/);assert.equal(h.calls.length,1);assert.equal(h.audits.length,0);
});
test('invalid or inaccessible online order sends no mutation',async()=>{
  let h=statusHarness();assert.equal((await h.api.updateOnlineOrderStatus('order','backwards')).success,false);assert.equal(h.calls.length,0);
  h=statusHarness({missing:true});assert.equal((await h.api.updateOnlineOrderStatus('order','accepted')).success,false);assert.equal(h.calls.length,0);
});
test('stale status SQL conflict does not emit a success audit',async()=>{
  const h=statusHarness({result:{data:null,error:{code:'40001',message:'Order changed; refresh'}}});const r=await h.api.updateOnlineOrderStatus('order','accepted');assert.equal(r.success,false);assert.match(r.message,/Order changed/);assert.equal(h.audits.length,0);
});
test('unconfirmed RPC response prompts refresh, never an additional cancellation call',async()=>{
  const h=statusHarness({result:{data:{orderId:'other',onlineStatus:'accepted'},error:null}});const r=await h.api.updateOnlineOrderStatus('order','accepted');assert.equal(r.success,false);assert.equal(h.calls.length,1);assert.equal(h.audits.length,0);
});

test('successful refund remains successful when audit and cache are unavailable',async()=>{
  const calls=[],queries=[];
  const api=loadTs('app/(dashboard)/dashboard/orders/[id]/return-actions.ts',{
    'next/cache':{revalidatePath(){throw Error('cache');}},
    '@/lib/audit/create-audit-log':{createAuditLog:async()=>{throw Error('audit');}},
    '@/lib/auth/require-permission':{requirePermission:async p=>{assert.equal(p,'orders.return');return{id:'business'};}},
    '@/lib/supabase/branch-server':{createClient:async()=>({
      from:table=>queryDouble(table,{data:{id:'order',order_number:'POS-1'},error:null},queries),
      rpc:async(name,args)=>{calls.push({name,args});return{data:{return_id:'return-id'},error:null};},
    })},
  });
  const form=new FormData();for(const [k,v] of Object.entries({orderId:'order',reason:'Wrong size',refundMethod:'cash',items:JSON.stringify([{order_item_id:'item',quantity:1}])}))form.set(k,v);
  const r=await api.createOrderReturn({success:false,message:''},form);assert.equal(r.success,true);assert.equal(r.returnId,'return-id');assert.equal(calls.length,1);assert.equal(calls[0].name,'tenh_run_branch_stock');
});
