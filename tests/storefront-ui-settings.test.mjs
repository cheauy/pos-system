// Focused regression checks: real React rendering and real settings/profile code.
// Icons, Next navigation and database calls are explicit test doubles, not live integrations.
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
  const services={
    'lucide-react':icons, 'react-icons/fa6':icons,
    'next/navigation':{useRouter:()=>({refresh(){}})},
    'next/image':{default:props=>h('img',props)},
    'next/link':{default:props=>h('a',props)},
    'sonner':{toast:{success(){},error(){}}},
    ...overrides,
  };
  function load(file) {
    const full=path.isAbsolute(file)?file:path.join(root,file);
    if(cache.has(full))return cache.get(full).exports;
    const mod={exports:{}};cache.set(full,mod);
    const output=ts.transpileModule(readFileSync(full,'utf8'),{fileName:full,compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    new Function('require','module','exports',output)(id=>{
      if(Object.hasOwn(services,id))return services[id];
      if(id.startsWith('.')||id.startsWith('@/')){
        const base=id.startsWith('@/')?path.join(root,id.slice(2)):path.resolve(path.dirname(full),id);
        const resolved=[base,base+'.ts',base+'.tsx',path.join(base,'index.ts')].find(p=>existsSync(p));
        assert.ok(resolved,`Internal import ${id}`);return load(resolved);
      }
      return require(id);
    },mod,mod.exports);
    return mod.exports;
  }
  return load;
}
const settings={business_id:'shop',business_type:'fashion',is_published:true,accept_online_orders:true,display_name:'Shop',description:'Store description',primary_color:'#2563EB',currency:'USD',allow_pickup:true,allow_delivery:true,accept_cod:true,accept_khqr:false,minimum_order:15,delivery_fee:3,estimated_minutes:45,checkout_message:'Call before delivery',social_links:{profile:{defaultLanguage:'km',openingHours:profile.defaultOpeningHours()}}};

test('default language accepts English/Khmer and rejects invalid values; older submissions omit the field',()=>{
  for(const language of ['en','km']) {const f=new FormData();f.set('defaultLanguage',language);assert.equal(profile.parseStoreProfile(f).defaultLanguage,language);}
  for(const language of ['fr','', 'javascript:bad']) {const f=new FormData();f.set('defaultLanguage',language);assert.throws(()=>profile.parseStoreProfile(f),/English or Khmer/);}
  assert.equal(Object.hasOwn(profile.parseStoreProfile(new FormData()),'defaultLanguage'),false);
});

test('the saved storefront default is used on the initial server render, independently of admin translation',()=>{
  const load=loader();const {StorefrontLanguage,useStorefrontLanguage}=load('app/_sites/[slug]/storefront-language.tsx');
  function Label(){return h('span',null,useStorefrontLanguage().t('Pre-order'));}
  const html=renderToStaticMarkup(h(StorefrontLanguage,{storeId:'shop',initialLanguage:'km'},h(Label)));
  assert.match(html,/lang="km"/);assert.match(html,/data-i18n-ignore="true"/);assert.match(html,/បញ្ជាទិញជាមុន/);
  const legacy=renderToStaticMarkup(h(StorefrontLanguage,{storeId:'shop'},h(Label)));
  assert.match(legacy,/lang="en"/);assert.match(legacy,/>Pre-order</);
});

test('Branding owns language, images, description and fulfillment without payment or display name',()=>{
  const Form=loader({'./actions':{updateStorefrontSettings:async()=>({success:true,message:'Saved',submittedAt:1})}})('app/(dashboard)/dashboard/online-store/storefront-settings-form.tsx').default;
  const html=renderToStaticMarkup(h(Form,{settings,storeUrl:'https://shop.example.test',businessName:'Shop',canEdit:true}));
  assert.match(html,/name="defaultLanguage" value="km"/);
  assert.match(html,/>English<|>English<\/button>/);assert.match(html,/ខ្មែរ/);
  assert.doesNotMatch(html,/data-storefront-save-bar|fixed left-1\/2|>Save Changes</);
  assert.doesNotMatch(html,/Theme preview|Your store theme|>Preview\s*(?:<svg|<\/a>)|Order rules|Configure basic order settings|Ordering &amp; Fulfillment|title=\"Online Payment\"/);
  for(const name of ['minimumOrder','deliveryFee','estimatedMinutes','checkoutMessage'])assert.doesNotMatch(html,new RegExp(`name="${name}"`));
  for(const name of ['allowPickup','allowDelivery','allowScheduledOrders'])assert.match(html,new RegExp(`name="${name}"`));
  assert.doesNotMatch(html,/name="displayName"/);
  assert.ok(html.indexOf('Default storefront language') < html.indexOf('Store logo'));
  assert.ok(html.indexOf('Store banner') < html.indexOf('Store description'));
  const readonly=renderToStaticMarkup(h(Form,{settings,storeUrl:'https://shop.example.test',businessName:'Shop',canEdit:false}));
  assert.doesNotMatch(readonly,/type="submit" form="store-settings-form"/);
});

test('hours Enable/Disable hides the setup without discarding timezone or Monday–Sunday inputs',()=>{
  const Editor=loader()('app/(dashboard)/dashboard/online-store/opening-hours-editor.tsx').default;
  const hours=profile.defaultOpeningHours();hours.timezone='Asia/Singapore';hours.days.monday.open='11:30';hours.days.sunday.closed=true;
  const html=renderToStaticMarkup(h(Editor,{value:hours,disabled:false}));
  assert.match(html,/name="hoursEnabled" value="off"/);
  assert.match(html,/id="opening-hours-configuration" hidden=""/);
  assert.match(html,/>Enable<\/button>/);assert.match(html,/>Disable<\/button>/);
  assert.match(html,/value="Asia\/Singapore" selected=""/);
  assert.match(html,/name="hours-monday-open"[^>]*value="11:30"/);
  assert.match(html,/name="hours-sunday-closed"[^>]*checked=""/);
  for(const day of profile.weekDays)for(const side of ['open','close'])assert.match(html,new RegExp(`name="hours-${day}-${side}"`));
  const enabled=renderToStaticMarkup(h(Editor,{value:{...hours,enabled:true},disabled:false}));
  assert.match(enabled,/name="hoursEnabled" value="on"/);assert.doesNotMatch(enabled,/id="opening-hours-configuration" hidden/);
});

test('storefront hours are hidden when disabled and translated when enabled',()=>{
  const load=loader();const Footer=load('app/_sites/[slug]/storefront-contact.tsx').default;
  const {StorefrontLanguage}=load('app/_sites/[slug]/storefront-language.tsx');
  const hours=profile.defaultOpeningHours();
  const render=value=>renderToStaticMarkup(h(StorefrontLanguage,{storeId:'shop',initialLanguage:'km'},h(Footer,{name:'Shop',settings:{...settings,social_links:{profile:{openingHours:value}}}})));
  assert.doesNotMatch(render(hours),/footer-hours/);
  const html=render({...hours,enabled:true});assert.match(html,/footer-hours/);assert.match(html,/ថ្ងៃចន្ទ/);assert.match(html,/ថ្ងៃអាទិត្យ/);assert.match(html,/Asia\/Phnom Penh/);
});

test('card Pre-order follows the saved variant toggle and never bypasses stock limits',()=>{
  const Catalog=loader()('app/_sites/[slug]/storefront-catalog.tsx').default;
  const product={key:'shirt',name:'Shirt',productType:'variant',categoryId:null,priceFrom:12,totalStock:3,variants:[{id:'red',sellingPrice:12,stockQuantity:3,color:'Red',size:'M'}],optionGroups:[]};
  const render=p=>{const html=renderToStaticMarkup(h(Catalog,{products:[p],categories:[],settings:{currency:'USD',orderingEnabled:true},productHref:k=>'?product='+k,onAdd(){}}));return html.slice(html.indexOf('<article'),html.indexOf('</article>'));};
  assert.match(render({...product,preorderVariantIds:['red']}),/product-stock preorder/);
  assert.doesNotMatch(render({...product,preorderVariantIds:[]}),/product-stock preorder/);
  assert.doesNotMatch(render({...product,preorderVariantIds:['deleted-variant']}),/product-stock preorder/);
  assert.match(render({...product,preorderVariantIds:['red'],totalStock:0,variants:[{...product.variants[0],stockQuantity:0}]}),/class="product-add" disabled=""/);
});

function actionContext(){
  const writes=[];
  const existing={display_name:'Shop',logo_url:'/logo.png',banner_url:'/banner.png',primary_color:'#2563EB',currency:'USD',khqr_image_url:'/qr.png',khqr_account_name:'Melody',khqr_instructions:'Pay order',accept_cod:true,accept_khqr:false,business_type:'fashion',minimum_order:15,delivery_fee:3,estimated_minutes:45,checkout_message:'Call before delivery',social_links:{custom:'preserved',profile:{defaultLanguage:'km',featuredProductIds:['red']}}};
  const supabaseAdmin={from(){let writing=false; const q={select(){return q;},eq(){return q;},is(){return q;},update(p){writing=true;writes.push(p);return q;},maybeSingle:async()=>({data:writing?{business_id:'shop'}:existing,error:null})};return q;}};
  const save=loader({
    '@/lib/images/compress-photo':{compressPhoto:async f=>f},
    '@/lib/auth/require-permission':{requirePermission:async()=>({id:'shop',slug:'shop',product_mode:'variant'})},
    '@/lib/audit/create-audit-log':{createAuditLog:async()=>{}},
    '@/lib/supabase/admin':{supabaseAdmin},'next/cache':{revalidatePath(){}},
  })('app/(dashboard)/dashboard/online-store/actions.ts').updateStorefrontSettings;
  const form=new FormData();for(const [k,v] of Object.entries({acceptOnlineOrders:'on',allowPickup:'on',defaultLanguage:'en',primaryColor:'#2563EB',currency:'USD'}))form.set(k,v);
  return {save,writes,form,existing};
}
test('saving Branding preserves hidden order rules, preorder flags and other profile fields',async()=>{
  const c=actionContext();assert.equal((await c.save({},c.form)).success,true);
  const saved=c.writes[0];for(const field of ['minimum_order','delivery_fee','estimated_minutes','checkout_message'])assert.equal(saved[field],c.existing[field]);
  assert.equal(saved.social_links.profile.defaultLanguage,'en');assert.deepEqual(saved.social_links.profile.featuredProductIds,['red']);assert.equal(saved.social_links.custom,'preserved');
});

test('Online Store saves preserve payment settings now owned by Business Settings',async()=>{
  const c=actionContext();assert.equal((await c.save({},c.form)).success,true);const saved=c.writes[0];
  assert.equal(saved.accept_cod,true);assert.equal(saved.accept_khqr,false);assert.equal(saved.khqr_image_url,'/qr.png');assert.equal(saved.khqr_account_name,'Melody');assert.equal(saved.khqr_instructions,'Pay order');assert.equal(saved.display_name,'Shop');
});
test('legacy forms preserve the saved language; invalid submitted languages cannot reach a write',async()=>{
  const c=actionContext();c.form.delete('defaultLanguage');assert.equal((await c.save({},c.form)).success,true);assert.equal(c.writes[0].social_links.profile.defaultLanguage,'km');
  c.form.set('defaultLanguage','fr');assert.equal((await c.save({},c.form)).success,false);assert.equal(c.writes.length,1);
});
test('Online Store preserves a disabled schedule now owned by Business Settings',async()=>{
  const c=actionContext();const existingHours=profile.defaultOpeningHours();existingHours.timezone='Asia/Singapore';existingHours.days.monday.open='11:30';existingHours.days.sunday.closed=true;c.existing.social_links.profile.openingHours=existingHours;c.form.set('hoursEnabled','off');c.form.set('hoursTimezone','Asia/Singapore');c.form.set('hours-monday-open','01:30');c.form.set('hours-monday-close','21:00');c.form.set('hours-sunday-closed','on');
  assert.equal((await c.save({},c.form)).success,true);const saved=c.writes[0].social_links.profile.openingHours;
  assert.equal(saved.enabled,false);assert.equal(saved.timezone,'Asia/Singapore');assert.equal(saved.days.monday.open,'11:30');assert.equal(saved.days.sunday.closed,true);
});
