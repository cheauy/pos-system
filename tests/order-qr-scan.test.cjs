const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {loadTs}=require('./helpers/load-ts.cjs');
const file=ts.createSourceFile('screens.tsx',fs.readFileSync('mobile/src/screens.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let scanner;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='OrderQrScanner')scanner=node;ts.forEachChild(node,visit);}visit(file);
const fn=scanner.body.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='resolve');
const source=ts.transpileModule(fn.getText(file),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
test('mobile keeps scanner open until full details load; failures leave it open for retry',async()=>{
  for(const fail of [false,true]){
    const events=[],cache=new Map(),scope={userId:'u',businessId:'b',branchId:'l'};
    let finish;const pending=new Promise(resolve=>finish=resolve);
    const context={scope,cache,active:{current:true},setBusy:value=>events.push(['busy',value]),setScanning:value=>events.push(['scanner',value]),setOrder:value=>events.push(['order',value]),
      api:async path=>{if(path.startsWith('order-qr?'))return{id:'order-id',incoming:true,currency:'USD'};assert.equal(path,'incoming-detail?id=order-id');await pending;if(fail)throw Error('Not available in this branch');return{id:'order-id',items:[]};}};
    const run=new Function(...Object.keys(context),source+';return resolve;')(...Object.values(context));
    const result=run('TENH:ORDER:1:test');await Promise.resolve();await Promise.resolve();
    assert.deepEqual(events,[['busy',true]]);assert.equal(cache.size,0);
    finish();
    if(fail){await assert.rejects(result,/Not available/);assert.deepEqual(events,[['busy',true],['busy',false]]);assert.equal(cache.size,0);}
    else{await result;assert.deepEqual(events.map(e=>e[0]),['busy','scanner','order','busy']);assert.equal(events[1][1],false);assert.ok(cache.get('u:b:l:incoming-detail?id=order-id').data);}
  }
});
test('website scanner validates QR and returns only an authorized order',async()=>{
  let reads=0,allowed=true;
  const {resolveOrderQr}=loadTs('lib/orders/resolve-order-qr.ts',{
    '@/lib/auth/require-permission':{requirePermission:async permission=>{assert.equal(permission,'orders.view');return{id:'business'};}},
    './order-qr':{parseOrderQr:value=>value==='valid'?'order-id':null},
    '@/app/(dashboard)/dashboard/orders/[id]/order-detail-data':{loadDetailedOrder:async(b,id)=>{reads++;assert.equal(b,'business');assert.equal(id,'order-id');return allowed?{id}:null;}},
  });
  assert.ok((await resolveOrderQr('external-url')).error);assert.equal(reads,0);
  assert.deepEqual(await resolveOrderQr('valid'),{id:'order-id'});
  allowed=false;assert.ok((await resolveOrderQr('valid')).error);
});
