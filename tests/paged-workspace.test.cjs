const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
test('management pages debounce searches, retain rows and ignore obsolete responses',async()=>{
 let slots=[],cursor=0,effects=[],timers=new Set(),requests=[],result;
 const initial={rows:['saved']};let filters={page:1,query:''};
 const react={useState(v){const i=cursor++;if(!(i in slots))slots[i]=v;return[slots[i],v=>slots[i]=v];},useRef(v){const i=cursor++;return slots[i]??(slots[i]={current:v});},useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((x,n)=>!Object.is(old.deps[n],x))){slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=fn();});}}};
 const m={exports:{}};const js=ts.transpileModule(fs.readFileSync('lib/use-paged-workspace.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports','setTimeout','clearTimeout',js)(()=>react,m,m.exports,fn=>{timers.add(fn);return fn;},fn=>timers.delete(fn));
 const load=f=>new Promise((resolve,reject)=>requests.push({filters:f,resolve,reject}));
 function render(f=filters,seed=initial){filters=f;cursor=0;effects=[];result=m.exports.usePagedWorkspace(seed,filters,load);effects.forEach(fn=>fn());return result;}
 function tick(){for(const fn of timers){timers.delete(fn);fn();}}
 async function settle(){await new Promise(setImmediate);return render();}
 render();tick();assert.equal(requests.length,0);
 render({page:1,query:'s'});render({page:1,query:'shirt'});tick();assert.equal(requests.length,1);assert.equal(requests[0].filters.query,'shirt');assert.deepEqual(render().data,initial);
 render({page:2,query:'shirt'});tick();assert.equal(requests.length,2);
 requests[1].resolve({rows:['page-two']});assert.deepEqual((await settle()).data.rows,['page-two']);
 requests[0].resolve({rows:['obsolete']});assert.deepEqual((await settle()).data.rows,['page-two']);
 render({page:3,query:'shirt'});tick();requests[2].reject(Error('Network unavailable'));const failed=await settle();assert.equal(failed.error,'Network unavailable');assert.deepEqual(failed.data.rows,['page-two']);assert.equal(failed.busy,false);
});
