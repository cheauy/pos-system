import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './helpers/load-ts.cjs';
const {payments,totals}=loadTs('app/(dashboard)/dashboard/register/register-model.ts');
const order={id:'o',register_shift_id:'drawer',status:'pending',total:15,amount_paid:20,change_amount:5,payment_method:'cod',pos_checkout:null};

test('register prefers original payment and change over later mutable order amounts',()=>{
  assert.deepEqual(payments({...order,amount_paid:999,change_amount:0,pos_checkout:{cashReceived:15,receipt:{amountPaid:20,change:5}}}),{cash:1500,noncash:0});
});
test('tender fallback also uses original receipt change, not current change',()=>{
  assert.deepEqual(payments({...order,change_amount:0,pos_checkout:{receipt:{amountPaid:20,change:5},tenders:[{method:'cash',amount:10},{method:'bank_transfer',amount:10}]}}),{cash:500,noncash:1000});
});
test('explicit zero drawer cash remains zero for a fully noncash payment',()=>{
  assert.deepEqual(payments({...order,pos_checkout:{cashReceived:0,receipt:{amountPaid:15,change:0}}}),{cash:0,noncash:1500});
});
test('empty metadata falls back to legacy COD net cash instead of silently counting zero',()=>{
  assert.deepEqual(payments({...order,pos_checkout:{}}),{cash:1500,noncash:0});
});
test('an empty tender list preserves the legacy payment fallback',()=>{
  assert.deepEqual(payments({...order,pos_checkout:{tenders:[]}}),{cash:1500,noncash:0});
});
test('tender sums or change contradictions fail instead of generating a false drawer total',()=>{
  assert.throws(()=>payments({...order,pos_checkout:{tenders:[{method:'cash',amount:30}]}}),/do not match/);
  assert.throws(()=>payments({...order,pos_checkout:{tenders:[{method:'cash',amount:1},{method:'bank_transfer',amount:19}]}}),/change exceeds/);
});
for(const v of [NaN,Infinity,-Infinity,-1]) test(`invalid recorded cash ${String(v)} is rejected`,()=>{
  assert.throws(()=>payments({...order,pos_checkout:{cashReceived:v}}),/Invalid recorded/);
});
test('overstated drawer allocation is not silently clamped',()=>{
  assert.throws(()=>payments({...order,pos_checkout:{cashReceived:100}}),/exceeds the payment/);
});
test('closed summary remains unchanged after current order data becomes invalid',()=>{
  const snapshot={cash:15,noncash:0,incoming:0,outgoing:0,refunds:0,expected:115};
  assert.equal(totals({id:'drawer',status:'closed',register_summary:snapshot,opening_cash:100},[],[{...order,amount_paid:NaN}]),snapshot);
});
test('integer-cents cash/noncash split agrees over 1,000 valid tender allocations',()=>{
  for(let n=1;n<=1000;n++){
    const cash=n,bank=1000-n,change=n%11;
    const o={...order,amount_paid:10,change_amount:change/100,pos_checkout:{tenders:[{method:'cash',amount:cash/100+change/100},{method:'bank_transfer',amount:bank/100}],receipt:{amountPaid:(1000+change)/100,change:change/100}}};
    assert.deepEqual(payments(o),{cash,noncash:bank});
  }
});
