/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('./helpers/load-ts.cjs');

// A fake request: a cookie store object whose serialized value can change mid-request.
function request(cookie){return {cookie,toString(){return this.cookie;}};}

function load(current){
  return loadTs('lib/request-scoped.ts',{
    'server-only':{},
    'next/headers':{cookies:async()=>{if(!current.store)throw new Error('outside request');return current.store;}},
    '@/lib/mobile/request-context':{mobileRequest:{getStore:()=>current.mobile}},
  });
}

test('one lookup per request and arguments; never shared across requests',async()=>{
  const current={store:request('session=a')};
  let calls=0;const lookup=load(current).requestScoped(async id=>({id,call:++calls}));
  const first=await lookup('x');assert.equal(await lookup('x'),first);assert.equal(calls,1);
  assert.notEqual(await lookup('y'),first);assert.equal(calls,2);
  current.store=request('session=a');assert.notEqual(await lookup('x'),first,'a new request never reuses another request');
});

test('a cookie written mid-request (branch switch, session refresh) is read again',async()=>{
  const current={store:request('branch=A')};
  let calls=0;const lookup=load(current).requestScoped(async()=>++calls);
  assert.equal(await lookup(),1);current.store.cookie='branch=B';assert.equal(await lookup(),2);
});

test('mobile scope is part of the key, and calls outside a request pass through',async()=>{
  const current={store:request('s'),mobile:{businessId:'b1'}};
  let calls=0;const lookup=load(current).requestScoped(async()=>++calls);
  await lookup();current.mobile={businessId:'b2'};await lookup();assert.equal(calls,2);
  current.store=null;await lookup();await lookup();assert.equal(calls,4);
});
