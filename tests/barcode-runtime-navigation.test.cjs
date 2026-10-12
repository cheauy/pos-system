/* eslint-disable @typescript-eslint/no-require-imports -- Real component with explicit offline hook/action doubles. */
const test=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('./helpers/load-ts.cjs');
const ORDER='11111111-1111-4111-8111-111111111111';
function harness(){
 const cells=[],effects=[],layouts=[],queries=[],navigations=[],timers=new Map();let cursor=0,timerId=0;
 const context={branchId:'branch-a',changing:false};
 function hook(initial){const i=cursor++;if(!(i in cells))cells[i]={value:typeof initial==='function'?initial():initial};return cells[i];}
 const changed=(a,b)=>!a||!b||a.length!==b.length||a.some((x,i)=>!Object.is(x,b[i]));
 const effect=(queue,fn,deps)=>{const cell=hook(null);if(changed(cell.deps,deps)){cell.deps=deps;queue.push(fn);}};
 const react={useState(initial){const cell=hook(initial);return[cell.value,next=>{cell.value=typeof next==='function'?next(cell.value):next;}];},useRef(initial){return hook({current:initial}).value;},useMemo(fn){hook(null);return fn();},useEffect:(fn,deps)=>effect(effects,fn,deps),useLayoutEffect:(fn,deps)=>effect(layouts,fn,deps),useTransition:()=>{hook(null);return[false,fn=>{void fn();}];}};
 const oldWindow=global.window,oldDocument=global.document;
 global.window={history:{replaceState(){}},addEventListener(){},removeEventListener(){},setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,delay});return id;},clearTimeout(id){timers.delete(id);},matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})};
 global.document={};const Scanner=()=>null;
 const Page=loadTs('app/(dashboard)/dashboard/search/global-search-client.tsx',{
  'react/jsx-runtime':require('react/jsx-runtime'),react,'lucide-react':require('lucide-react'),'next/link':{default:'a'},'next/navigation':{useRouter:()=>({push:url=>navigations.push(url)})},
  '@/components/date-range-filter':{default:()=>null,dateFilterStyles:{legacy:''}},'@/components/order-qr-scanner':{default:Scanner},'../workspace-branch-provider':{useWorkspaceBranch:()=>context},
  './search-actions':{runGlobalSearch:args=>new Promise((resolve,reject)=>queries.push({args,resolve,reject}))},'@/lib/date-range':{dateRangeError:()=>''},
 }).default;
 function nodes(node){if(!node||typeof node!=='object')return[];if(Array.isArray(node))return node.flatMap(nodes);return[node,...nodes(node.props?.children)];}
 function render(){cursor=0;const tree=Page({});for(const fn of layouts.splice(0))fn();return nodes(tree).find(x=>x.type===Scanner).props;}
 function flushEffects(){for(const fn of effects.splice(0))fn();}
 function flushZero(){for(const [id,timer]of [...timers])if(timer.delay===0){timers.delete(id);timer.fn();}}
 const response=results=>({query:'123456789012',results,branches:[],warnings:[],scanResolution:results.length===1?'unique-order':'ambiguous'});
 return{context,queries,navigations,render,flushEffects,flushZero,response,close(){global.window=oldWindow;global.document=oldDocument;}};
}
const tick=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
test('a unique linear order scan navigates once with exact payload and expected branch',async()=>{
 const h=harness();try{h.render().onScan({kind:'linear',value:'123456789012'});assert.equal(h.queries.length,1);assert.equal(h.queries[0].args.linearBarcode,'123456789012');assert.equal(h.queries[0].args.expectedBranchId,'branch-a');h.queries[0].resolve(h.response([{id:ORDER,kind:'order'}]));await tick();assert.deepEqual(h.navigations,[`/dashboard/orders/${ORDER}?scanned=1`]);}finally{h.close();}
});
test('ambiguous scan results never select an order automatically',async()=>{
 const h=harness();try{h.render().onScan({kind:'linear',value:'000123'});assert.equal(h.queries[0].args.linearBarcode,'000123');h.queries[0].resolve(h.response([{id:ORDER,kind:'order'},{id:'product',kind:'product'}]));await tick();assert.deepEqual(h.navigations,[]);}finally{h.close();}
});
test('a branch change before effects flush rejects stale navigation and does not replay scan intent',async()=>{
 const h=harness();try{h.render().onScan({kind:'linear',value:'123456789012'});h.context.branchId='branch-b';h.render();h.queries[0].resolve(h.response([{id:ORDER,kind:'order'}]));await tick();assert.deepEqual(h.navigations,[]);h.flushEffects();h.flushZero();for(const q of h.queries.slice(1))assert.equal(q.args.linearBarcode,undefined);}finally{h.close();}
});
test('a superseded scan cannot navigate after a newer scan is unresolved',async()=>{
 const h=harness();try{let props=h.render();props.onScan({kind:'linear',value:'123456789012'});props=h.render();props.onScan({kind:'linear',value:'123456789013'});h.queries[0].resolve(h.response([{id:ORDER,kind:'order'}]));await tick();assert.deepEqual(h.navigations,[]);h.queries[1].resolve(h.response([{id:ORDER,kind:'order'}]));await tick();assert.deepEqual(h.navigations,[`/dashboard/orders/${ORDER}?scanned=1`]);}finally{h.close();}
});
