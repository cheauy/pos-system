const test=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('./helpers/load-ts.cjs');

function client(){
 const names=['EXPO_PUBLIC_API_URL','EXPO_PUBLIC_SUPABASE_URL','EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
 const previous=names.map(name=>process.env[name]);
 for(const name of names)process.env[name]='https://example.invalid';
 try{return loadTs('mobile/src/client.ts',{
  'react-native-url-polyfill/auto':{},'expo-secure-store':{},
  'react-native':{AppState:{addEventListener:()=>({remove(){}})}},
  './secure-storage':{secureStorage:()=>({})},
  '@supabase/supabase-js':{createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'test-token'}},error:null})}})},
 });}finally{names.forEach((name,index)=>{if(previous[index]===undefined)delete process.env[name];else process.env[name]=previous[index];});}
}
const json=()=>new Response('{"ok":true}',{headers:{'content-type':'application/json'}});
test('iOS native cancellation retries a read once and retains its branch headers',async t=>{
 const {api}=client();let calls=0;
 t.mock.method(global,'fetch',async(_url,options)=>{calls++;assert.equal(options.headers['X-Branch-Id'],'branch');if(calls===1)throw new Error('fetch failed: FetchRequestCanceledException: Fetch request has been canceled (at Expo/NativeResponse.swift:63)');return json();});
 assert.deepEqual(await api('session',{branchId:'branch'}),{ok:true});assert.equal(calls,2);
});
test('persistent transport errors stop after two reads with a usable message',async t=>{
 const {api}=client();let calls=0;
 t.mock.method(global,'fetch',async()=>{calls++;throw new TypeError('Network request failed');});
 await assert.rejects(api('session'),error=>error.code==='connection_interrupted'&&!error.uncertain&&/Check your internet/.test(error.message));assert.equal(calls,2);
});
test('uncertain saves are never replayed',async t=>{
 const {api}=client();let calls=0;
 t.mock.method(global,'fetch',async()=>{calls++;throw new Error('fetch failed: FetchRequestCanceledException');});
 await assert.rejects(api('sale',{}, {items:[]}),error=>error.uncertain===true&&/whether the change was saved/.test(error.message));assert.equal(calls,1);
});
test('caller cancellation does not retry and keeps AbortError semantics',async t=>{
 const {api}=client();const controller=new AbortController();let calls=0;
 t.mock.method(global,'fetch',async()=>{calls++;controller.abort();throw new Error('fetch failed: FetchRequestCanceledException');});
 await assert.rejects(api('session',{},undefined,controller.signal),{name:'AbortError'});assert.equal(calls,1);
});
test('timeouts recognize native iOS cancellation and retry reads only once',async t=>{
 const {api}=client();let calls=0;
 t.mock.method(global,'fetch',async(_url,options)=>{calls++;if(calls===2)return json();return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('fetch failed: FetchRequestCanceledException'))));});
 t.mock.timers.enable({apis:['setTimeout']});
 const result=api('session');await Promise.resolve();t.mock.timers.tick(25000);
 assert.deepEqual(await result,{ok:true});assert.equal(calls,2);
});
test('authorization failures are not retried or hidden',async t=>{
 const {api}=client();let calls=0;
 t.mock.method(global,'fetch',async()=>{calls++;return new Response('{"error":"Access denied"}',{status:403,headers:{'content-type':'application/json'}});});
 await assert.rejects(api('session'),error=>error.status===403&&error.message==='Access denied');assert.equal(calls,1);
});
