// Real controls and client filtering, isolated services, loopback-only network evidence.
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone fixture harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const ts = require('typescript');
const { webpack } = require('next/dist/compiled/webpack/webpack');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const { chromium } = require(require.resolve('playwright', { paths:[process.env.TENH_BROWSER_MODULES || path.join(__dirname,'../node_modules')] }));
const root = path.resolve(__dirname,'..');
const output = path.join(root,'docs/evidence/date-filter-apply-20261011');
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'tenh-date-apply-'));
const fixture = path.join(__dirname,'fixtures/date-filter-apply.tsx');
const checks = [], requests = [], errors = [], blockedRequests = [];
fs.mkdirSync(output,{recursive:true});

// Server-page data loading stays out of this browser fixture. Extract the original
// JSX filter controls; no production exports, permissions or database code change.
function controls(source,file) {
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const imports='import React from "react";import {useSearchParams} from "next/navigation";import NavigationForm from "@/components/navigation-form";import {NavigationDateRange,dateFilterStyles} from "@/components/date-range-filter";import {SlidersHorizontal,X} from "lucide-react";const branches=[{id:"00000000-0000-4000-8000-000000000001",name:"Fixture Branch",is_active:true}];';
  if(file.endsWith('/reports/page.tsx')) {
    const names=new Set(['MobileReportFilters','ReportFilters']);
    const kept=ast.statements.filter(node=>(ts.isFunctionDeclaration(node)&&names.has(node.name?.text))||(ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>d.name.getText(ast)==='REPORT_RANGES'))).map(node=>node.getText(ast));
    assert.equal(kept.length,3,'report controls must come from the actual page');
    return imports+'const getDateRange=()=>({startDate:"2026-10-11"});'+kept.join('\n')+'export default function ReportControls(){const params=Object.fromEntries(useSearchParams());const props={branches,branchId:"00000000-0000-4000-8000-000000000001",selectedRange:params.range||"custom",from:params.from||"2026-10-01",to:params.to||"2026-10-11"};return <><ReportFilters {...props}/><MobileReportFilters {...props}/></>;}';
  }
  const pieces=[];
  function visit(node) {
    if(ts.isJsxElement(node)) {
      const tag=node.openingElement.tagName.getText(ast),attrs=node.openingElement.attributes.getText(ast);
      if((tag==='div'&&(attrs.includes('id="staff-filters"')||attrs.includes('dateFilterStyles.desktop')))||(tag==='a'&&attrs.includes('href="#staff-filters"'))) {pieces.push(node.getText(ast));return;}
    }
    if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(ast)==='NavigationDateRange'){pieces.push(node.getText(ast));return;}
    ts.forEachChild(node,visit);
  }
  visit(ast);assert.equal(pieces.length,4,'staff controls must come from the actual page');
  return imports+'const staffReportDates=()=>({to:"2026-10-11"});export default function StaffControls(){const business={role:"owner"};const params=Object.fromEntries(useSearchParams());const branchId="00000000-0000-4000-8000-000000000001",dates={from:params.from||"2026-10-01",to:params.to||"2026-10-11"};return <>'+pieces.join('\n')+'</>;}';
}
const controlsPath=path.join(temp,'controls.cjs');
fs.writeFileSync(controlsPath,'const ts=require('+JSON.stringify(require.resolve('typescript'))+');const assert=require("node:assert/strict");module.exports='+controls.toString());
const loader=path.join(temp,'loader.cjs');
fs.writeFileSync(loader,[
  'const ts=require('+JSON.stringify(require.resolve('typescript'))+');',
  'const controls=require('+JSON.stringify(controlsPath)+');',
  'module.exports=function(source){const file=this.resourcePath.replaceAll("\\\\","/");',
  'if(file.endsWith("/reports/page.tsx")||file.endsWith("/staff-report/page.tsx"))source=controls(source,file);',
  'if(file.endsWith(".css")){const names=[...source.matchAll(/\\.([a-zA-Z][\\w-]*)/g)].map(m=>m[1]);return "module.exports="+JSON.stringify(Object.fromEntries(names.map(n=>[n,require("node:path").basename(file,".module.css")+"-"+n])));}',
  'return ts.transpileModule(source,{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;};'
].join('\n'));
const empty=path.join(temp,'empty.js');
fs.writeFileSync(empty,'export default function Empty(){return null;}export const OrderPrintMenu=Empty;');
function css(source,name) {
  const globals=[];
  source=source.replace(/:global\(([^)]+)\)/g,(_all,value)=>'GLOBAL'+(globals.push(value)-1)+'TOKEN');
  source=source.replace(/\.([a-zA-Z][\w-]*)/g,'.'+name+'-$1');
  return source.replace(/GLOBAL(\d+)TOKEN/g,(_all,index)=>globals[Number(index)]);
}
async function build() {
  await new Promise((resolve,reject)=>{
    const aliases={'@':root,'next/navigation$':fixture,'next/link$':fixture,'next/image$':empty,'@/lib/supabase/client$':fixture,'@/components/online-order-listener$':fixture};
    for(const file of ['components/order-qr-scanner','components/order-print-menu','components/order-print-preview','components/cancel-order-form','components/super-admin/business-change-payment-review','app/(dashboard)/dashboard/purchase-orders/new-order-dialog','app/(dashboard)/dashboard/purchase-orders/order-workflow','app/(dashboard)/dashboard/orders/[id]/return-items-form','app/(dashboard)/dashboard/orders/[id]/order-detail-controls']) aliases[path.join(root,file)]=empty;
    aliases[path.join(root,'app/(dashboard)/dashboard/workspace-branch-provider.tsx')]=fixture;
    const compiler=webpack({mode:'development',devtool:false,context:root,entry:fixture,output:{path:temp,filename:'fixture.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:aliases},module:{rules:[{test:/\.(tsx?|css)$/,use:loader}]},plugins:[
      new webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})}),
      new webpack.NormalModuleReplacementPlugin(/(?:^\.\/actions$|\/actions$|list-actions$|search-actions$|order-workspace-actions$)/,resource=>{resource.request=fixture;}),
      new webpack.NormalModuleReplacementPlugin(/(?:supabase\/client|online-order-listener|workspace-branch-provider)(?:\.tsx?)?$/,resource=>{resource.request=fixture;}),
      new webpack.NormalModuleReplacementPlugin(/(?:order-qr-scanner|order-print-preview|order-print-menu|business-change-payment-review|new-order-dialog|order-workflow|return-items-form|order-detail-controls)$/,resource=>{resource.request=empty;})
    ],performance:{hints:false}});
    compiler.run((error,stats)=>{compiler.close(()=>{});if(error||stats.hasErrors())reject(error||Error(stats.toString({all:false,errors:true})));else resolve();});
  });
  const global=await postcss([tailwind()]).process(fs.readFileSync(path.join(root,'app/globals.css'),'utf8'),{from:path.join(root,'app/globals.css')});
  const modules=[];
  function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(file.endsWith('.module.css'))modules.push(css(fs.readFileSync(file,'utf8'),path.basename(file,'.module.css')));}}
  walk(path.join(root,'app'));walk(path.join(root,'components'));
  fs.writeFileSync(path.join(temp,'style.css'),global.css+'\n'+modules.join('\n'));
}
const views=[{name:'phone',width:390,height:844},{name:'tablet',width:820,height:1180},{name:'desktop',width:1440,height:1000},{name:'phone-landscape',width:844,height:390},{name:'tablet-landscape',width:1180,height:820}];
const pages=['dashboard','reports','staff','orders','purchases','returns','expenses','audit','stock','search','payments'];
async function count(page){return page.evaluate(()=>window.dateFixture.requests.length);}
async function signature(page){return page.evaluate(()=>JSON.stringify({data:(document.body.textContent.match(/DATE-(?:ORDER|PO|RETURN|EXPENSE|AUDIT|STOCK|PAYMENT|SEARCH)-\d+/g)||[]).sort(),applied:window.dateFixture.applied}));}
async function open(page,name,view){
  if(view.name==='desktop')return page.locator('[class*="date-range-filter-desktop"]').filter({visible:true}).first();
  if(name==='dashboard'){const trigger=page.getByRole('link',{name:'Filter',exact:true});if(await trigger.isVisible())await trigger.click();await page.getByRole('button',{name:'Select date range',exact:true}).click();return page.locator('.dashboard-date-popover');}
  if(name==='reports'||name==='staff'){const link=page.getByRole('link',{name:'Filter',exact:true});const sheet=await link.isVisible();if(sheet)await link.click();return page.locator(name==='reports'?(sheet?'#report-filters form':'section form'):'#staff-filters form').filter({visible:true}).first();}
  if(name==='orders'){await page.getByRole('button',{name:/^Filter/}).first().click();return page.locator('form[aria-label="Filter orders"]');}
  if(name==='purchases'){await page.getByRole('button',{name:/^Filter/}).filter({visible:true}).first().click();return page.locator('dialog[open]');}
  if(name==='returns'){const trigger=page.getByRole('button',{name:'Select date range',exact:true});if(await trigger.isVisible())await trigger.click();return page.locator('[aria-label="Return filters"]').filter({visible:true});}
  if(name==='expenses'){await page.getByRole('button',{name:/^Filter/}).filter({visible:true}).first().click();return page.locator('[aria-labelledby="expense-filter-title"]');}
  if(name==='audit'){const trigger=page.getByRole('button',{name:'Filter',exact:true});if(await trigger.isVisible())await trigger.click();return page.getByLabel('Date Range',{exact:true}).locator('..');}
  if(name==='stock'){const trigger=page.getByRole('button',{name:'Recent Adjustments',exact:true});if(await trigger.isVisible()&&!await page.locator('[role="dialog"][aria-label="Recent adjustments"]').isVisible())await trigger.click();return page.getByLabel('Date Range',{exact:true}).locator('..');}
  if(name==='payments')return page.getByLabel('Date Range',{exact:true}).locator('..');
  if(name==='search'){const trigger=page.getByRole('button',{name:'Filter results',exact:true});if(await trigger.isVisible())await trigger.click();return page.locator('aside[aria-label="Filter results"]');}
  throw Error('Unmapped page '+name);
}
async function applyButton(panel){return panel.getByRole('button',{name:/^Apply(?: dates| date range| filters)?$/}).filter({visible:true}).last();}
async function custom(panel,name,view){if(view.name!=='desktop'&&['audit','stock','payments'].includes(name))await panel.locator('select').selectOption('custom');}
async function cancel(page,panel,name,view){
  const button=panel.getByRole('button',{name:'Cancel',exact:true}).filter({visible:true});
  if(await button.count())await button.last().click();
  else {const close=panel.getByRole('button',{name:/^Close/}).filter({visible:true});if(!await close.count()){await page.screenshot({path:path.join(output,'browser-failure.png'),fullPage:true});throw Error(name+' has no visible Cancel/Close: '+await page.locator('main').first().innerHTML());}await close.last().click();}
  await page.waitForTimeout(50);
  const next=await open(page,name,view);await custom(next,name,view);return next;
}
async function matrix(page,base) {
  for(const view of views)for(const name of pages){
    console.log('CHECK '+view.name+' '+name);
    await page.setViewportSize(view);
    await page.goto(base+'/?fixture='+name);
    await page.waitForTimeout(100);assert.deepEqual(errors,[],name+' renders without exceptions');await page.locator('#fixture-header').waitFor();await page.waitForTimeout(name==='search'?650:100);
    const before=await count(page),data=await signature(page);
    let panel=await open(page,name,view);
    assert.equal(await count(page),before,name+' opening must not request');
    await custom(panel,name,view);
    let inputs=panel.locator('input[type=date]').filter({visible:true});
    const original=await inputs.evaluateAll(nodes=>nodes.map(node=>node.value));
    if(await inputs.count()>=2){
      await inputs.nth(0).fill('2026-10-12');await inputs.nth(1).fill('2026-10-10');
      const button=await applyButton(panel);
      if(await button.count()&&await button.isEnabled())await button.click();
      assert.equal(await count(page),before,name+' invalid range must not request');
      assert.equal(await signature(page),data,name+' invalid/draft dates must not change displayed data');
      await inputs.nth(0).fill('2026-10-10');await inputs.nth(1).fill('2026-10-10');
    }else {await page.screenshot({path:path.join(output,'browser-failure.png'),fullPage:true});throw Error(view.name+' '+name+' must expose its date fields: '+await panel.innerHTML());}
    assert.equal(await count(page),before,name+' draft edits must not request');
    assert.equal(await signature(page),data,name+' draft edits must not change results');
    if(view.name==='desktop')await panel.getByRole('button',{name:'Yesterday',exact:true}).click();
    else if(name==='dashboard')await page.getByRole('button',{name:'Yesterday',exact:true}).filter({visible:true}).click();
    else if(name==='reports')await panel.locator('input[name=range][value=today]').locator('..').click();
    else if(name==='staff')await panel.locator('select[name=range]').selectOption('today');
    else if(['audit','stock','payments'].includes(name))await panel.locator('select').selectOption('all');
    assert.equal(await count(page),before,name+' presets remain drafts');
    assert.equal(await signature(page),data,name+' preset selection leaves results unchanged');
    panel=await cancel(page,panel,name,view);
    assert.equal(await count(page),before,name+' Cancel/reopen must not request');
    inputs=panel.locator('input[type=date]').filter({visible:true});
    assert.deepEqual(await inputs.evaluateAll(nodes=>nodes.map(node=>node.value)),original,name+' Cancel restores applied dates');
    if(view.name==='desktop'){
      await inputs.nth(0).fill('2026-10-09');await page.locator('#fixture-header').click();
      assert.deepEqual(await inputs.evaluateAll(nodes=>nodes.map(node=>node.value)),original,name+' outside click discards date drafts');
      await inputs.nth(0).fill('2026-10-09');await page.keyboard.press('Escape');
      assert.deepEqual(await inputs.evaluateAll(nodes=>nodes.map(node=>node.value)),original,name+' Escape discards date drafts');
    }
    if(view.name!=='desktop'){
      await inputs.nth(0).fill('2026-09-01');await page.keyboard.press('Escape');
      panel=await open(page,name,view);await custom(panel,name,view);inputs=panel.locator('input[type=date]').filter({visible:true});
      assert.deepEqual(await inputs.evaluateAll(nodes=>nodes.map(node=>node.value)),original,name+' Escape/reopen restores applied dates');
      assert.equal(await count(page),before,name+' Escape does not request');
    }
    await inputs.nth(0).focus();await inputs.nth(0).press('ArrowUp');await inputs.nth(0).press('ArrowRight');await inputs.nth(0).press('ArrowUp');
    assert.equal(await count(page),before,name+' native date keyboard edits must not request');
    assert.equal(await signature(page),data,name+' date keyboard edits leave results unchanged');
    await inputs.nth(0).fill('2026-10-10');await inputs.nth(1).fill('2026-10-10');
    if(view.name!=='desktop'){
      const reducedHeight=view.name==='tablet'?900:view.name==='phone'?500:360;
      await page.setViewportSize({width:view.width,height:reducedHeight});await (await applyButton(panel)).scrollIntoViewIfNeeded();
      const bounds=await (await applyButton(panel)).boundingBox();assert.ok(bounds&&bounds.x>=-1&&bounds.x+bounds.width<=view.width+1&&bounds.y>=-1&&bounds.y+bounds.height<=reducedHeight+1,name+' reduced-height Apply remains reachable');
      await page.setViewportSize(view);
    }
    await page.screenshot({path:path.join(output,view.name+'-'+name+'-draft.png'),fullPage:false});
    const button=await applyButton(panel);assert.equal(await button.count(),1,name+' must have accessible Apply');
    await button.click();await page.waitForTimeout(160);
    const after=await count(page);
    const server=['dashboard','reports','staff','orders','purchases'].includes(name);
    assert.equal(after-before,server?1:0,name+' actual Apply request count');
    assert.notEqual(await signature(page),data,name+' Apply changes the dataset or applied server range');
    panel=await open(page,name,view);
    await custom(panel,name,view);
    const appliedInputs=panel.locator('input[type=date]').filter({visible:true});
    if(await appliedInputs.count()>=2){assert.equal(await appliedInputs.nth(0).inputValue(),'2026-10-10',name+' reopen start');assert.equal(await appliedInputs.nth(1).inputValue(),'2026-10-10',name+' reopen end');await appliedInputs.nth(0).fill('2026-10-09');await appliedInputs.nth(0).fill('2026-10-10');}
    else throw Error(name+' applied custom range must expose dates on reopen');
    await (await applyButton(panel)).click();await page.waitForTimeout(80);
    assert.equal(await count(page),after,name+' unchanged Apply must not request');
    panel=await open(page,name,view);await custom(panel,name,view);await panel.locator('input[type=date]').filter({visible:true}).nth(0).fill('2026-09-01');
    await page.evaluate(()=>window.dateFixture.language('km'));await page.waitForTimeout(200);
    const clipped=await panel.locator('input[type=date],select,button').filter({visible:true}).evaluateAll(nodes=>nodes.filter(node=>{const box=node.getBoundingClientRect();return box.width>0&&(box.x < -1||box.right>innerWidth+1);}).map(node=>node.textContent||node.getAttribute('aria-label')));
    assert.deepEqual(clipped,[],name+' Khmer date controls fit the '+view.name+' viewport');
    await page.screenshot({path:path.join(output,view.name+'-'+name+'-khmer.png'),fullPage:false});
    assert.equal(await count(page),after,name+' Khmer draft does not fetch');
    checks.push({page:name,view:view.name,draftRequests:0,presetRequests:0,cancelRequests:0,invalidRequests:0,keyboardEditRequests:0,reducedHeight:view.name==='desktop'?null:view.name==='tablet'?900:view.name==='phone'?500:360,applyRequests:after-before,unchangedRequests:0});
    console.log('PASS '+view.name+' '+name);
  }
}
async function advanced(page,base) {
  const desktop=views[2];
  for(const name of ['dashboard','reports','staff','orders','purchases']){
    const view=views[0];await page.setViewportSize(view);await page.goto(base+'/?fixture='+name);await page.locator('#fixture-header').waitFor();await page.waitForTimeout(100);
    const panel=await open(page,name,view),inputs=panel.locator('input[type=date]');await inputs.nth(0).fill('2026-10-10');await inputs.nth(1).fill('2026-10-10');await page.evaluate(()=>window.dateFixture.delay=500);await (await applyButton(panel)).click();
    const popup=name==='dashboard'?page.locator('#dashboard-filters'):name==='orders'?page.locator('#order-filter-panel'):panel;
    assert.equal(await popup.isVisible(),false,name+' valid Apply closes its outer sheet before the request finishes');assert.equal(await page.locator('#fixture-header').isVisible(),true,name+' header remains usable');await page.waitForTimeout(650);
    if(name==='orders')assert.equal(new URLSearchParams(await page.locator('#applied-query').innerText()).get('page'),null,'Orders date Apply resets page two');
    checks.push({page:name,check:'valid Apply closes the outer sheet promptly during a delayed fixture request'});
  }
  for(const name of ['orders','purchases','returns','expenses','audit','search']){
    const view=views[0];await page.setViewportSize(view);await page.goto(base+'/?fixture='+name);await page.locator('#fixture-header').waitFor();await page.waitForTimeout(name==='search'?650:100);
    let panel=await open(page,name,view);await custom(panel,name,view);
    let inputs=panel.locator('input[type=date]').filter({visible:true});await inputs.nth(0).fill('2026-10-10');await inputs.nth(1).fill('2026-10-10');await (await applyButton(panel)).click();await page.waitForTimeout(160);
    panel=await open(page,name,view);const before=await count(page),data=await signature(page);
    const reset=name==='audit'?page.getByRole('button',{name:'Reset filters',exact:true}):panel.getByRole('button',{name:name==='search'?'Clear all':name==='returns'?'Clear dates':'Reset',exact:true});
    await reset.click();assert.equal(await count(page),before,name+' Reset remains draft');assert.equal(await signature(page),data,name+' Reset leaves the applied date dataset unchanged');
    if(name==='audit')panel=page.getByLabel('Date Range',{exact:true}).locator('..');
    panel=await cancel(page,panel,name,view);inputs=panel.locator('input[type=date]').filter({visible:true});assert.equal(await inputs.nth(0).inputValue(),'2026-10-10',name+' Reset/Cancel restores applied dates');
    checks.push({page:name,check:'Reset/Clear remains draft and Cancel restores the applied range'});
  }
  for(const name of ['audit','payments']){
    await page.setViewportSize(desktop);await page.goto(base+'/?fixture='+name);await page.locator('#fixture-header').waitFor();await page.waitForTimeout(100);
    await page.evaluate(()=>{window.dateFixture.exports=[];const original=URL.createObjectURL;URL.createObjectURL=blob=>{window.dateFixture.exports.push(blob);return original(blob);};});
    const panel=await open(page,name,desktop),inputs=panel.locator('input[type=date]');await inputs.nth(0).fill('2026-10-10');await inputs.nth(1).fill('2026-10-10');await (await applyButton(panel)).click();await page.waitForTimeout(100);
    await inputs.nth(0).fill('2026-09-01');const before=await count(page);
    if(name==='audit'){await page.getByRole('button',{name:'Export logs',exact:true}).evaluate(button=>button.click());await page.getByRole('button',{name:'Export JSON',exact:true}).evaluate(button=>button.click());}
    else await page.getByRole('button',{name:'Export',exact:true}).evaluate(button=>button.click());
    const exported=await page.evaluate(()=>Promise.all(window.dateFixture.exports.map(blob=>blob.text())));assert.equal(exported.length,1,name+' produces one local export');assert.ok(exported[0].includes(name==='audit'?'DATE-AUDIT-2':'DATE-PAYMENT-2'),name+' export includes applied day');assert.ok(!exported[0].includes(name==='audit'?'DATE-AUDIT-0':'DATE-PAYMENT-0'),name+' draft dates do not leak into exports');assert.equal(await count(page),before,name+' local export does not fetch');
    checks.push({page:name,check:'download content uses applied dates while another date selection is still a draft'});
  }
  for(const name of ['dashboard','reports','staff','orders']){
    await page.setViewportSize(desktop);await page.goto(base+'/?fixture='+name);await page.locator('#fixture-header').waitFor();await page.waitForTimeout(100);
    const panel=await open(page,name,desktop),inputs=panel.locator('input[type=date]'),before=await count(page),initialStart=await inputs.nth(0).inputValue();
    await page.evaluate(()=>window.dateFixture.delay=1000);
    await inputs.nth(0).fill('2026-10-10');await inputs.nth(1).fill('2026-10-10');await (await applyButton(panel)).click();
    await page.waitForTimeout(30);assert.equal(await count(page),before+1,name+' first Apply issues one navigation');
    assert.ok(await page.locator('#fixture-header').isVisible(),name+' header remains visible while data loads');
    assert.ok(await page.locator('[aria-busy=true]').count(),name+' affected content is busy while navigation loads');
    await page.evaluate(()=>window.dateFixture.delay=30);
    await inputs.nth(0).fill('2026-10-11');await inputs.nth(1).fill('2026-10-11');await (await applyButton(panel)).click();
    await page.waitForTimeout(1100);
    assert.equal(await count(page),before+2,name+' different rapid Apply is one navigation');
    assert.equal(await inputs.nth(0).inputValue(),'2026-10-11',name+' latest applied range wins');
    assert.equal(new URLSearchParams(await page.locator('#applied-query').innerText()).get('branch'),'00000000-0000-4000-8000-000000000001',name+' branch survives date Apply');
    await inputs.nth(0).fill('2026-09-01');await page.goBack();await page.waitForTimeout(80);
    assert.equal(await inputs.nth(0).inputValue(),initialStart,name+' Back restores the previous committed range instead of a superseded request or draft');
    await page.goForward();await page.waitForTimeout(80);assert.equal(await inputs.nth(0).inputValue(),'2026-10-11',name+' Forward restores applied dates');
    checks.push({page:name,check:'rapid Apply, scoped loading, branch preservation and URL Back/Forward',navigationRequests:2});
  }
  await page.goto(base+'/?fixture=purchases');await page.locator('#fixture-header').waitFor();await page.waitForTimeout(100);
  let panel=await open(page,'purchases',desktop),inputs=panel.locator('input[type=date]');
  const before=await count(page);
  await page.evaluate(()=>window.dateFixture.delay=1000);
  await inputs.nth(0).fill('2026-10-10');await inputs.nth(1).fill('2026-10-10');await (await applyButton(panel)).click();await page.waitForTimeout(30);
  await page.evaluate(()=>window.dateFixture.delay=30);
  await inputs.nth(0).fill('2026-10-11');await inputs.nth(1).fill('2026-10-11');await (await applyButton(panel)).click();await page.waitForTimeout(80);
  const latest=await signature(page);await page.waitForTimeout(1100);assert.equal(await signature(page),latest,'real paged hook ignores an older response');
  assert.equal(await count(page),before+2,'real loader makes one request per rapid applied change');
  await page.evaluate(()=>window.dateFixture.failNext=true);
  await inputs.nth(0).fill('2026-09-01');await inputs.nth(1).fill('2026-09-01');await (await applyButton(panel)).click();await page.waitForTimeout(100);
  assert.ok(await page.getByRole('alert').isVisible(),'load failure shows existing error feedback');
  assert.equal(await page.locator('[aria-label="Purchase order summary"]').isVisible(),false,'old totals are hidden on failure');
  assert.equal(await page.locator('[class*="listContent"]').isVisible(),false,'old rows are hidden on failure');
  const failedCount=await count(page);await page.getByRole('button',{name:'Retry',exact:true}).click();await page.waitForTimeout(100);
  assert.equal(await count(page),failedCount+1,'Retry loads the applied range exactly once');
  assert.equal(await page.getByRole('alert').count(),0,'successful Retry clears the error');
  checks.push({page:'purchases',check:'actual hook stale-response protection, load failure, hidden stale rows/totals and explicit Retry'});
  await page.goto(base+'/?fixture=orders');await page.locator('#fixture-header').waitFor();await page.waitForTimeout(100);
  panel=await open(page,'orders',desktop);inputs=panel.locator('input[type=date]');
  await inputs.nth(0).fill('2026-10-10');await inputs.nth(1).fill('2026-10-10');
  await page.evaluate(()=>window.dateFixture.background({new:{id:'unrelated'},old:{}}));await page.waitForTimeout(800);
  const background=await page.evaluate(()=>window.dateFixture.requests.filter(request=>request.kind==='background'));
  assert.equal(background.length,1,'realtime is distinguished from filter-triggered requests');
  assert.equal(new URLSearchParams(background[0].query).get('from'),null,'background refresh uses applied values, never draft dates');
  checks.push({page:'orders',check:'realtime refresh uses applied route filters during a date draft',backgroundRequests:1});
}
async function run(){
  await build();
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/fixture-data'){const delay=Number(url.searchParams.get('delay'))||0;setTimeout(()=>{res.statusCode=url.searchParams.get('fail')==='true'?503:200;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({fixture:true}));},delay);return;}
    if(url.pathname==='/fixture.js'||url.pathname==='/style.css'){res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':'text/css');res.end(fs.readFileSync(path.join(temp,url.pathname.slice(1))));return;}
    res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  let browser;
  try{
    browser=await chromium.launch({channel:'chrome',headless:true});
    const context=await browser.newContext({timezoneId:'Asia/Phnom_Penh'});
    await context.route('**/*',route=>{if(new URL(route.request().url()).origin===base)return route.continue();blockedRequests.push(route.request().url());return route.abort();});
    await context.addInitScript(()=>{const OriginalDate=Date;window.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:['2026-10-11T12:00:00Z']));}static now(){return new OriginalDate('2026-10-11T12:00:00Z').getTime();}};});
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{if(request.url().includes('/fixture-data'))requests.push(request.url());});
    await matrix(page,base);
    await advanced(page,base);
    assert.deepEqual(errors,[],'no browser exceptions');
    assert.deepEqual(blockedRequests,[],'no external service request attempts');
    fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify({checks,requests,errors,blockedRequests,limits:'Real controls/client filters with isolated navigation/services; live database, actual Next RSC transport, OS calendar popovers and physical keyboards are not exercised.'},null,2));
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{fs.writeFileSync(path.join(output,'browser-failure.txt'),error.stack+'\n'+JSON.stringify(errors));console.error(error);console.error(errors);process.exitCode=1;});
