// Business Settings section move: every original field still renders, inside the section it moved to.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as profile from '../lib/storefront/profile.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const h=React.createElement;
const icon=props=>h('svg',{'aria-hidden':'true',width:props.size,height:props.size});
const icons=new Proxy({}, {get:()=>icon});
function loader(overrides={}) {
  const cache=new Map();
  const services={'lucide-react':icons,'next/navigation':{useRouter:()=>({refresh(){}}),useSearchParams:()=>new URLSearchParams()},'next/link':{default:props=>h('a',props)},'sonner':{toast:{success(){},error(){}}},...overrides};
  function load(file) {
    const full=path.isAbsolute(file)?file:path.join(root,file);
    if(cache.has(full))return cache.get(full).exports;
    const mod={exports:{}};cache.set(full,mod);
    const output=ts.transpileModule(readFileSync(full,'utf8'),{fileName:full,compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    new Function('require','module','exports',output)(id=>{
      if(Object.hasOwn(services,id))return services[id];
      if(id.startsWith('.')||id.startsWith('@/')){
        const base=id.startsWith('@/')?path.join(root,id.slice(2)):path.resolve(path.dirname(full),id);
        const resolved=[base,base+'.ts',base+'.tsx'].find(p=>existsSync(p));
        assert.ok(resolved,`Internal import ${id}`);return load(resolved);
      }
      return require(id);
    },mod,mod.exports);
    return mod.exports;
  }
  return load;
}
const settings={business_id:'shop',business_type:'restaurant',is_published:true,accept_online_orders:true,display_name:'Shop',description:'Desc',primary_color:'#2563EB',currency:'USD',allow_pickup:true,allow_delivery:true,allow_dine_in:true,accept_cod:true,accept_khqr:false,khqr_image_url:null,khqr_account_name:'M',khqr_instructions:'Pay',social_links:{facebook:'https://facebook.com/x',profile:{openingHours:profile.defaultOpeningHours()}}};

// Cards are siblings, so each field belongs to the nearest data-section marker before it.
function sectionOf(html,name){
  const at=html.indexOf(`name="${name}"`);
  assert.notEqual(at,-1,`missing field ${name}`);
  const marker=html.lastIndexOf('data-section="',at);
  return marker===-1?null:html.slice(marker+14,html.indexOf('"',marker+14));
}

test('storefront fields keep their names and sit in their new sections',()=>{
  const Form=loader({'./actions':{updateStorefrontSettings:async()=>({})}})('app/(dashboard)/dashboard/online-store/storefront-settings-form.tsx').default;
  const html=renderToStaticMarkup(h(Form,{settings,storeUrl:'https://shop.example.test',businessName:'Shop',canEdit:true}));
  const expected={branding:['primaryColor'],storefront:['currency','defaultLanguage','allowPickup','allowDelivery','allowDineIn','newArrivalsEnabled','newArrivalDays'],seo:['seoTitle','seoDescription'],social:['facebookUrl','instagramUrl','tiktokUrl','youtubeUrl','telegramUrl','whatsappUrl','messengerUrl','xUrl']};
  for(const [section,names] of Object.entries(expected))for(const name of names)assert.equal(sectionOf(html,name),section,name);
  // Scheduled-order values are still posted unchanged so a save cannot reset them.
  for(const name of ['allowScheduledOrders','minScheduleLeadMinutes','maxScheduleDays','businessId'])assert.match(html,new RegExp(`type="hidden" name="${name}"`));
});

test('business info fields split into Business Info, Branding and Store Hours inside one form',()=>{
  const Form=loader({'./info-actions':{saveBusinessInfo:async()=>({success:true})}})('app/(dashboard)/dashboard/settings/business/business-info-form.tsx').default;
  const html=renderToStaticMarkup(h(Form,{businessId:'shop',businessName:'Shop',canEditBusinessName:true,phone:'1',address:'A',profile:settings.social_links.profile,canEdit:true}));
  assert.equal((html.match(/<form/g)||[]).length,1);
  const expected={'business-info':['businessName','phone','contactEmail','address','locationUrl'],branding:['logo','banner','description'],'store-hours':['hoursEnabled','hoursTimezone',...profile.weekDays.flatMap(d=>[`hours-${d}-open`,`hours-${d}-close`])]};
  for(const [section,names] of Object.entries(expected))for(const name of names)assert.equal(sectionOf(html,name),section,name);
});

test('payment form keeps its fields and own save path',()=>{
  const Form=loader({'../../online-store/actions':{updateOnlinePaymentSettings:async()=>({})}})('app/(dashboard)/dashboard/settings/business/online-payment-form.tsx').default;
  const html=renderToStaticMarkup(h(Form,{settings,canEdit:true}));
  for(const name of ['acceptCod','acceptKhqr','khqrAccountName','khqrInstructions','businessId'])assert.match(html,new RegExp(`name="${name}"`));
});

test('section nav follows ?section=, falls back to Overview, and every section has a hide rule',()=>{
  const render=(query,available)=>{const {default:Sections}=loader({'next/navigation':{useSearchParams:()=>new URLSearchParams(query)}})('app/(dashboard)/dashboard/settings/business/settings-sections.tsx');return renderToStaticMarkup(h(Sections,{available},h('p',null,'x')));};
  const {SETTINGS_SECTIONS}=loader()('app/(dashboard)/dashboard/settings/business/sections.ts');
  const all=SETTINGS_SECTIONS.map(s=>s.id);
  assert.deepEqual(SETTINGS_SECTIONS.map(s=>s.label),['Overview','Business Info','Branding','Store Hours','Storefront','Product','SEO & Meta','Social Links']);
  assert.deepEqual([...new Set(SETTINGS_SECTIONS.map(s=>s.group).filter(Boolean))],['Business','Storefront','Visibility']);
  const seo=render('section=seo',all);
  assert.match(seo,/data-active="seo"/);
  // One nav serves desktop (sidebar) and phones/tablets (tab strip); no section dropdown remains.
  for(const g of ['Business','Storefront','Visibility'])assert.match(seo,new RegExp(`id="bs-group-${g}"[^>]*>${g}<`));
  assert.doesNotMatch(seo,/<select|<optgroup/);
  assert.deepEqual([...seo.matchAll(/href="\?section=([a-z-]+)"/g)].map(m=>m[1]),all);
  assert.equal((seo.match(/aria-current="page"/g)||[]).length,1);
  assert.doesNotMatch(render('',['overview','branding']),/>Visibility</);assert.match(seo,/href="\?section=seo" aria-current="page"/);
  assert.match(render('section=storefront',['overview','branding']),/data-active="overview"/);
  for(const old of ['fulfillment','online-orders'])assert.match(render(`section=${old}`,all),/data-active="storefront"/);
  assert.doesNotMatch(render('',all),/section=online-orders/);
  assert.doesNotMatch(render('',['overview','branding']),/section=storefront/);
  const css=readFileSync(path.join(root,'app/(dashboard)/dashboard/settings/settings-layout.css'),'utf8');
  for(const id of all)assert.ok(css.includes(`.bs-panel[data-active=${id}] [data-section]:not([data-section~=${id}])`),id);
});

test('old Online Store routes land on the matching Business Settings section',()=>{
  const read=f=>readFileSync(path.join(root,'app/(dashboard)/dashboard',f),'utf8');
  assert.match(read('settings/online-store/page.tsx'),/\/dashboard\/settings\/business\?section=storefront/);
  assert.match(read('settings/online-store/ordering/page.tsx'),/section=storefront/);
  assert.match(read('online-store/ordering/page.tsx'),/section=branding/);
  assert.doesNotMatch(read('settings/business/page.tsx'),/from\("products"\)|from\("categories"\)/);
  assert.match(read('settings/business/page.tsx'),/data-section="product"[^>]*>\s*<CatalogPanel/);
});

test('Store status owns the visibility and order switches; other sections only summarise them',()=>{
  const page=readFileSync(path.join(root,'app/(dashboard)/dashboard/settings/business/page.tsx'),'utf8');
  for(const slot of ['storefront-publish-slot','storefront-orders-slot'])assert.equal(page.split(`"${slot}"`).length-1,1,slot);
  const overview=page.slice(page.indexOf('data-section="overview"'),page.indexOf('data-section="storefront"'));
  for(const text of ['storefront-publish-slot','storefront-orders-slot','CopyStoreUrlButton','Open Public Store','data-section-link="storefront"'])assert.ok(overview.includes(text),text);
  assert.match(page,/isLocalRootDomain\(\)/);
});

test('store favicon comes from that store\'s own logo only',()=>{
  const meta=readFileSync(path.join(root,'app/storefront/[slug]/page.tsx'),'utf8');
  assert.match(meta,/store\.logo_url \? \{ icons: \{ icon: store\.logo_url/);
});
