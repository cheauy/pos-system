const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const file=ts.createSourceFile('data.ts',fs.readFileSync('mobile/src/data.ts','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const node=file.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='useInfiniteData');
const js=ts.transpileModule(node.getText(file).replace('export ',''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function harness(){
 let slots=[],cursor=0,effects=[],dirty=false,source={loading:true},path='orders?status=all',scope={userId:'u',businessId:'b',branchId:'one'},requested;
 const deps={useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],value=>{const next=typeof value==='function'?value(slots[i]):value;if(next!==slots[i]){slots[i]=next;dirty=true;}}];},useRef:initial=>{const i=cursor++;return slots[i]??(slots[i]={current:initial});},useEffect:(fn,values)=>{const i=cursor++,old=slots[i];if(!old||values.some((v,n)=>v!==old[n])){slots[i]=values;effects.push(fn);}},useData:url=>{requested=url;return {...source,refresh:()=>{source={loading:true};dirty=true;}};},onInvalidated:()=>()=>{}};
 const hook=new Function(...Object.keys(deps),js+';return useInfiniteData;')(...Object.values(deps));
 let value;function render(){for(let i=0;i<15;i++){dirty=false;cursor=0;effects=[];value=hook(path,scope,true);effects.forEach(fn=>fn());if(!dirty)return value;}throw Error('render loop');}
 return {render,get url(){return requested;},respond:next=>{source=next;return render();},filter:next=>{path=next;source={loading:true};return render();},branch:()=>{scope={...scope,branchId:'two'};source={loading:true};return render();}};
}
test('infinite lists load fifteen at a time, deduplicate IDs, and guard repeated end events',()=>{
 const h=harness();h.render();assert.match(h.url,/limit=15&page=1$/);
 const first=Array.from({length:15},(_,i)=>({id:String(i)}));
 let state=h.respond({loading:false,data:{rows:first,total:31}});
 state.more();state.more();h.render();assert.match(h.url,/page=2$/);
 state=h.respond({loading:false,data:{rows:[first[14],...Array.from({length:14},(_,i)=>({id:String(i+15)}))],total:31}});
 assert.equal(state.data.rows.length,29);assert.equal(new Set(state.data.rows.map(row=>row.id)).size,29);
 state.more();h.render();assert.match(h.url,/page=3$/);
 state=h.respond({loading:false,data:{rows:[{id:'last'}],total:31}});assert.equal(state.hasMore,false);
});
test('errors do not advance pages; filters, branches and denied access clear old rows',()=>{
 const h=harness();h.render();let state=h.respond({loading:false,data:{rows:[{id:'one'}],total:30}});
 state.more();h.render();state=h.respond({loading:false,error:'Disconnected'});state.more();h.render();assert.match(h.url,/page=2$/);assert.equal(state.data.rows.length,1);
 state=h.filter('orders?status=pending');assert.equal(state.data,undefined);assert.match(h.url,/page=1$/);
 h.respond({loading:false,data:{rows:[{id:'pending'}],total:1}});state=h.branch();assert.equal(state.data,undefined);
 h.respond({loading:false,data:{rows:[{id:'private'}],total:1}});state=h.respond({loading:false,denied:true,error:'Forbidden'});assert.equal(state.data,undefined);
});
test('Categories request ten records while other lists request fifteen',()=>{
 const h=harness();h.render();assert.match(h.url,/limit=15&page=1$/);
 h.filter('account-categories?search=');assert.match(h.url,/limit=10&page=1$/);
});

test('cached rows stay visible during background refresh and manual refresh replaces pages',()=>{
 const h=harness();h.render();
 let state=h.respond({loading:true,data:{rows:[{id:'cached'}],total:20}});
 assert.equal(state.data.rows[0].id,'cached');assert.equal(state.loading,false);
 state=h.respond({loading:false,data:{rows:[{id:'first'}],total:20}});
 state.more();h.render();state=h.respond({loading:false,data:{rows:[{id:'second'}],total:20}});
 state.refresh();state=h.render();assert.deepEqual(state.data.rows.map(r=>r.id),['first','second']);
 assert.equal(state.refreshing,true);assert.match(h.url,/page=1$/);
 state=h.respond({loading:false,data:{rows:[{id:'replacement'}],total:1}});
 assert.deepEqual(state.data.rows.map(r=>r.id),['replacement']);assert.equal(state.hasMore,false);
});
