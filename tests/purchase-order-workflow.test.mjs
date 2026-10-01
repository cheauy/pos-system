import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './helpers/load-ts.cjs';

test('purchase orders save in-place with the selected status and reject stale status changes',async()=>{
  const writes=[],redirects=[],permissions=[];
  let stale=false;
  const db={auth:{getUser:async()=>({data:{user:{id:'user'}}})},from(table){
    const steps=[];let operation='read';
    const query={};
    for(const method of ['select','eq','in','maybeSingle','single','insert','update','delete'])query[method]=(...args)=>{steps.push([method,...args]);if(['insert','update','delete'].includes(method)){operation=method;writes.push({table,method,value:args[0],steps});}return query;};
    query.then=(resolve,reject)=>Promise.resolve({error:null,data:table==='branch_products'?[{id:'product',name:'Shirt',sku:'S'}]:table==='suppliers'?{id:'supplier',name:'Supplier',is_active:true}:operation==='update'&&stale?null:{id:'new-order'}}).then(resolve,reject);
    return query;
  }};
  const api=loadTs('app/(dashboard)/dashboard/purchase-orders/actions.ts',{
    'next/cache':{revalidatePath(){}},'next/navigation':{redirect:path=>{redirects.push(path);throw Error('REDIRECT');}},
    '@/lib/auth/require-permission':{requirePermission:async permission=>{permissions.push(permission);return{id:'business'};}},
    '@/lib/supabase/branch-server':{createClient:async()=>db},'@/lib/supabase/read-all-rows':{readAllRows(){}},
  });
  const form=new FormData();form.set('supplierId','supplier');form.set('items',JSON.stringify([{productId:'product',quantity:2,unitCost:3}]));form.set('submissionStatus','draft');
  assert.equal(await api.createPurchaseOrder(form,false),'new-order');
  assert.equal(writes.find(write=>write.table==='purchase_orders').value.status,'draft');assert.deepEqual(redirects,[]);
  form.set('submissionStatus','sent');await assert.rejects(api.createPurchaseOrder(form),/REDIRECT/);
  assert.deepEqual(redirects,['/dashboard/purchase-orders']);
  assert.equal(writes.filter(write=>write.table==='purchase_orders').at(-1).value.status,'sent');
  const change=new FormData();change.set('id','new-order');change.set('status','sent');await api.setPurchaseOrderStatus(change);
  assert.deepEqual(writes.at(-1).steps.find(step=>step[0]==='in'),['in','status',['draft']]);
  stale=true;await assert.rejects(api.setPurchaseOrderStatus(change),/changed/);
  change.set('status','received');await assert.rejects(api.setPurchaseOrderStatus(change),/Invalid status/);
  assert.ok(permissions.includes('purchases.create'));assert.ok(permissions.includes('purchases.update'));
});
