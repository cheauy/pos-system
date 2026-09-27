const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {loadTs}=require('./helpers/load-ts.cjs');
const app=ts.createSourceFile('App.tsx',fs.readFileSync('mobile/App.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let navigate;
function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='setPage')navigate=node.getText(app);ts.forEachChild(node,visit);}visit(app);
const source=ts.transpileModule(navigate,{compilerOptions:{target:ts.ScriptTarget.ES2017}}).outputText;
const {getPayloadFromStateRoute}=loadTs('mobile/node_modules/expo-router/build/global-state/stateUtils.js',{'../matchers':{}});
const {resolveHref}=require('../mobile/node_modules/expo-router/build/link/href.js');
test('all workspace menu destinations survive the installed Expo Router payload conversion',()=>{
 const routes=[];const setPage=new Function('router','posLocked','page',`${source};return setPage;`)({replace:route=>routes.push(route)},false,'Home');
 for(const name of ['Home','Orders','Stock','Alerts','More','POS','Products','Bundles','Online Store','Online Orders','Purchase Orders','Stock Transfers','Customers','Expenses','Register','Reports','Profile','Users','Branches','Categories']){
  setPage(name);const href=routes.at(-1);
  if(name==='Home'){assert.equal(href,'/');continue;}
  assert.equal(resolveHref(href),`/${encodeURIComponent(name)}${name==='POS'?'?posFrom=Home':''}`);
  const payload=getPayloadFromStateRoute({name:href.pathname.slice(1),params:href.params});
  const param=href.pathname.slice(2,-1);
  assert.equal(payload.params[param],name,`${name} destination must not be stripped as a reserved parameter`);
  assert.ok(fs.existsSync(`mobile/src/app/${href.pathname.slice(1)}.tsx`));
 }
 assert.equal(fs.existsSync('mobile/src/app/[screen].tsx'),false);
});
test('POS lock still blocks menu changes',()=>{
 const setPage=new Function('router','posLocked',`${source};return setPage;`)({replace:()=>assert.fail('Locked POS must not navigate')},true);
 setPage('Orders');setPage('Home');
});

test('POS remembers Home and More as separate entry points',()=>{
 for(const page of ['Home','More']){const routes=[];const go=new Function('router','posLocked','page',`${source};return setPage;`)({replace:route=>routes.push(route)},false,page);go('POS');assert.equal(routes[0].params.posFrom,page);}
});
