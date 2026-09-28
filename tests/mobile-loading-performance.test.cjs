const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const {loadTs}=require('./helpers/load-ts.cjs');

function harness(){
 let slots=[],cursor=0,dirty=false,effects=[],listeners=new Set(),timers=new Set(),requests=[];
 let path='catalog-options',scope={userId:'u',businessId:'b',branchId:'one'},value;
 const changed=(a,b)=>!a||b.some((v,i)=>!Object.is(v,a[i]));
 const react={
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;dirty=true;}];},
  useRef(initial){const i=cursor++;return slots[i]??(slots[i]={current:initial});},
  useCallback(fn,deps){const i=cursor++;if(changed(slots[i]?.deps,deps))slots[i]={fn,deps};return slots[i].fn;},
  useEffect(fn,deps){const i=cursor++;if(changed(slots[i]?.deps,deps)){const old=slots[i];slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}},
 };
 class ApiError extends Error{constructor(status){super('Denied');this.status=status;}}
 const deps={react,'react-native':{AppState:{currentState:'active',addEventListener:(_,fn)=>{listeners.add(fn);return {remove:()=>listeners.delete(fn)};}}},
  './client':{ApiError,api:(path,scope,body,signal)=>new Promise((resolve,reject)=>requests.push({path,scope,signal,resolve,reject}))},
  './offline':{offline:{clear:async()=>{},read:async()=>undefined,save:async()=>{}}},'./offline-snapshots':{canSaveOffline:()=>false}};
 const module={exports:{}};
 const js=ts.transpileModule(fs.readFileSync('mobile/src/data.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports','setInterval','clearInterval',js)(id=>{assert.ok(id in deps,id);return deps[id];},module,module.exports,fn=>{timers.add(fn);return fn;},fn=>timers.delete(fn));
 const api=module.exports;
 function render(nextPath=path,nextScope=scope){path=nextPath;scope=nextScope;for(let i=0;i<20;i++){cursor=0;dirty=false;effects=[];value=api.useData(path,scope,true);effects.forEach(fn=>fn());if(!dirty)return value;}throw Error('Render loop');}
 return {...api,render,requests,timers,scope,ApiError,resume:()=>{listeners.forEach(fn=>fn('active'));return render();},settle:async()=>{await new Promise(setImmediate);return render();}};
}

test('fresh menus reuse cache, settings do not poll, and manual refresh still requests data',async()=>{
 const h=harness();h.cache.set('u:b:one:catalog-options',{data:{categories:['saved']},at:Date.now()-10000});
 let state=h.render();assert.deepEqual(state.data.categories,['saved']);assert.equal(h.requests.length,0);assert.equal(h.timers.size,0);
 h.resume();assert.equal(h.requests.length,0);
 state.refresh();h.render();assert.equal(h.requests.length,1);
 h.requests[0].resolve({categories:['new']});state=await h.settle();assert.deepEqual(state.data.categories,['new']);
 h.render('orders?search=');assert.equal(h.timers.size,1);
 h.render('account-profile');assert.equal(h.timers.size,0);
});

test('scope changes and denied responses cannot expose the previous branch snapshot',async()=>{
 const h=harness();h.cache.set('u:b:one:catalog-options',{data:{private:'one'},at:Date.now()});h.render();
 let state=h.render('catalog-options',{...h.scope,branchId:'two'});assert.equal(state.data,undefined);
 h.requests[0].resolve({private:'two'});state=await h.settle();assert.equal(state.data.private,'two');
 state.refresh();h.render();h.requests[1].reject(new h.ApiError(403));state=await h.settle();assert.equal(state.data,undefined);assert.equal(state.denied,true);
 assert.equal(h.cache.has('u:b:two:catalog-options'),false);
});

test('cache capacity evicts one snapshot instead of clearing every menu',async()=>{
 const h=harness();for(let i=0;i<50;i++)h.cache.set('old'+i,{data:i,at:0});
 h.render();h.requests[0].resolve({categories:[]});await h.settle();assert.equal(h.cache.size,50);assert.equal(h.cache.has('old0'),false);assert.equal(h.cache.has('old49'),true);
});

test('automatic refresh never cancels a slow request that is already in flight',()=>{
 const h=harness();h.render('orders?search=');assert.equal(h.requests.length,1);
 h.timers.forEach(fn=>fn());h.resume();assert.equal(h.requests.length,1);assert.equal(h.requests[0].signal.aborted,false);
});

test('unchanged offline snapshots avoid rewriting the keychain',async()=>{
 const {offlineSnapshots}=loadTs('mobile/src/offline-snapshots.ts');
 const values=new Map();let writes=0;
 const snapshots=offlineSnapshots({getItem:async key=>values.get(key),setItem:async(key,value)=>{writes++;values.set(key,value);},removeItem:async key=>values.delete(key)});
 await snapshots.save('u','stock',{rows:[{id:'one'}]});await snapshots.save('u','stock',{rows:[{id:'one'}]});assert.equal(writes,1);
 await snapshots.save('u','stock',{rows:[{id:'two'}]});assert.equal(writes,2);assert.equal((await snapshots.read('u','stock')).data.rows[0].id,'two');
});
