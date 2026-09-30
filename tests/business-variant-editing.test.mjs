import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadTs} from './helpers/load-ts.cjs';
const helpers=loadTs('lib/products/variant-editor.ts');
const modes=loadTs('lib/business/business-mode-presets.ts');
const base={id:'v1',color:'Black',size:'M',sku:'SHIRT-BLK-M',costPrice:'4',sellingPrice:'9',stockQuantity:'0',lowStockQuantity:'5',isActive:true,expectedUpdatedAt:'2026-09-29T07:00:00Z'};
for(const value of ['general','shoes','fashion','grocery','accessories']) test(`${value} is selectable in both flows`,()=>assert.equal(modes.isBusinessModeSelectable(value),true));
for(const value of ['milk_tea','restaurant','cafe','beauty','electronics','other']) test(`${value} is visibly coming soon, not selectable`,()=>{assert.equal(modes.getBusinessModeAvailability(value),'coming-soon');assert.equal(modes.isBusinessModeSelectable(value),false);});
test('unknown/retired types are hidden, never selectable',()=>{assert.equal(modes.getBusinessModeAvailability('retired-type'),'hidden');assert.equal(modes.isBusinessModeSelectable('retired-type'),false);});
test('shared business choices retain the exact wizard order',()=>assert.deepEqual(modes.visibleBusinessModePresets.map(p=>p.value),['general','milk_tea','shoes','restaurant','cafe','fashion','grocery','accessories','beauty','electronics','other']));
test('clothing sizes use wearable order rather than alphabetical order',()=>assert.deepEqual(['XL','S','XXL','XS','L','M'].sort(helpers.compareVariantSizes),['XS','S','M','L','XL','XXL']));
test('shoe sizes sort numerically, including decimals',()=>assert.deepEqual(['40','9','10','38.5','38'].sort(helpers.compareVariantSizes),['9','10','38','38.5','40']));
test('sort groups colours first and orders sizes within the colour',()=>assert.deepEqual([{...base,color:'White',size:'S'},{...base,color:'Black',size:'XL'},{...base,color:'Black',size:'M'}].sort(helpers.compareColorSize).map(r=>r.color+r.size),['BlackM','BlackXL','WhiteS']));
test('apparel aliases compare equal',()=>assert.equal(helpers.compareVariantSizes('2XL','XXL'),0));
test('comma/newline values are trimmed and deduplicated',()=>assert.deepEqual(helpers.splitVariantValues('Black, White\nblack, Blue ,'),['Black','White','Blue']));
test('generation skips existing colour/size combinations case-insensitively',()=>assert.deepEqual(helpers.missingVariantCombinations([base],['Black','White'],['M','L']),[{color:'Black',size:'L'},{color:'White',size:'M'},{color:'White',size:'L'}]));
test('SKU duplicates ignore case and surrounding spaces',()=>assert.match(helpers.validateEditableVariants([base,{...base,id:'v2',sku:' shirt-blk-m ',size:'L'}],true),/Duplicate SKU/));
test('colour-size duplicates ignore case and repeated whitespace',()=>assert.match(helpers.validateEditableVariants([base,{...base,id:'v2',sku:'NEW',color:' black ',size:' m '}],true),/already exists/));
test('same saved ID cannot be submitted twice',()=>assert.match(helpers.validateEditableVariants([base,{...base,sku:'NEW',size:'L'}],true),/submitted twice/));
for(const field of ['costPrice','sellingPrice','lowStockQuantity']) for(const value of ['',-1,NaN,Infinity]) test(`reject invalid ${field}: ${String(value)}`,()=>assert.ok(helpers.validateEditableVariants([{...base,[field]:value}],true)));
test('new-stock quantities must be whole numbers',()=>assert.ok(helpers.validateEditableVariants([{...base,id:null,stockQuantity:'1.5'}],true)));
test('existing stock is not revalidated or overwritten by the editor',()=>assert.equal(helpers.validateEditableVariants([{...base,stockQuantity:'-2'}],true),null));
test('zero prices and zero low-stock threshold are allowed',()=>assert.equal(helpers.validateEditableVariants([{...base,costPrice:0,sellingPrice:0,lowStockQuantity:0}],true),null));
test('standard products do not require size and colour',()=>assert.equal(helpers.validateEditableVariants([{...base,size:'',color:''}],false),null));
test('variants require both size and colour',()=>assert.match(helpers.validateEditableVariants([{...base,size:''}],true),/both colour and size/));

function fixture(options={}){
 let rows=structuredClone(options.rows??[{...base,image_url:'https://images.test/main.jpg',variant_image_url:'https://images.test/black.jpg',stock_quantity:0,updated_at:base.expectedUpdatedAt,product_type:'variant',variant_group_id:'group',name:'Shirt',business_id:'business',is_active:true,is_online:true}]);
 const writes=[],uploads=[],removedFiles=[],queries=[],permissions=[],rpcCalls=[];let updateCount=0;
 function query(table,admin=false){const call={table,steps:[],operation:'select',payload:null};queries.push(call);const q={};
  for(const method of ['select','eq','in','neq','limit','single','maybeSingle','order','upsert'])q[method]=(...args)=>{call.steps.push([method,...args]);return q;};
  for(const method of ['update','insert','delete'])q[method]=payload=>{call.operation=method;call.payload=payload;return q;};
  q.then=(ok,fail)=>Promise.resolve().then(()=>{
   let found=rows.filter(row=>call.steps.every(([method,key,value])=>method==='eq'?row[key]===value:method==='neq'?row[key]!==value:method==='in'?value.includes(row[key]):true));
   if(table==='categories')return {data:{id:'category'},error:options.categoryError??null};
   if(call.operation==='update'){
    updateCount++;writes.push(structuredClone(call));if(options.failUpdateAt===updateCount)return {data:null,error:{message:'Simulated save interruption'}};
    if(options.zeroUpdate)return {data:[],error:null};found.forEach(row=>Object.assign(row,call.payload));return {data:found.map(row=>({id:row.id})),error:null};
   }
   if(call.operation==='insert'){writes.push(structuredClone(call));const created={...call.payload,id:'new-id',updated_at:'new-version'};rows.push(created);return {data:{id:created.id},error:null};}
   if(call.operation==='delete'){writes.push(structuredClone(call));rows=rows.filter(row=>!found.includes(row));return {data:found,error:options.deleteError??null};}
   if(table==='product_location_stock')return {data:[],error:null};
   const one=call.steps.some(([m])=>m==='single'||m==='maybeSingle');return {data:one?found[0]??null:found,error:null};
  }).then(ok,fail);return q;
 }
 const db={auth:{getUser:async()=>({data:{user:{id:'user'}}})},from:table=>query(table),rpc:async(name,args)=>{rpcCalls.push({name,args});return {data:null,error:null};},storage:{from:()=>({upload:async(path,file)=>{uploads.push({path,file});return {error:options.uploadError??null};},getPublicUrl:path=>({data:{publicUrl:`https://images.test/${path}`}}),remove:async paths=>{removedFiles.push(...paths);return {error:null};}})}};
 const business={id:'business',slug:'shop',productMode:'variant',role:'owner'};
 const api=loadTs('app/(dashboard)/dashboard/products/actions.ts',{
  '@/lib/products/variant-editor':helpers,'@/lib/images/compress-photo':{compressPhoto:async file=>file},'@/lib/public-photo-cache':{PUBLIC_PHOTO_CACHE_SECONDS:'3600'},
  'next/cache':{revalidatePath(){}},'next/navigation':{redirect(){throw Error('Unexpected redirect');}},
  '@/lib/subscriptions/branch-limits':{assertBranchOperation:async()=>{}},'@/lib/audit/create-audit-log':{createAuditLog:async()=>{}},
  '@/lib/business/get-current-business-mode':{getCurrentBusinessMode:async()=>({value:options.general?'general':'fashion'})},
  '@/lib/supabase/branch-server':{createClient:async()=>db},'@/lib/branches/context':{getBranchContext:async()=>({business,branchId:options.branch??'branch'})},
  '@/lib/supabase/admin':{supabaseAdmin:{...db,from:table=>query(table,true)}},
  '@/lib/auth/require-permission':{requirePermission:async p=>{permissions.push(p);if(options.denied || options.deniedPermissions?.includes(p))throw Error('Permission denied');return business;}},
 });
 function form(variants=[base],extra={}){const f=new FormData();for(const [k,v]of Object.entries({productId:'v1',branchId:'branch',name:'Shirt',isOnline:'true',mainImageAction:'keep',...extra}))f.set(k,v);f.set('variants',JSON.stringify(variants));return f;}
 return {api,form,writes,uploads,removedFiles,queries,permissions,rpcCalls,rows:()=>rows};
}
test('an invalid row rejects the entire save, including valid rows',async()=>{const f=fixture();const r=await f.api.updateProductGroup({},f.form([base,{...base,id:null,sku:'BAD',costPrice:'bad'}]));assert.equal(r.success,false);assert.equal(f.writes.length,0);assert.equal(f.uploads.length,0);});
test('saved stock is never included in the update payload',async()=>{const f=fixture();const r=await f.api.updateProductGroup({},f.form([{...base,stockQuantity:999}]));assert.equal(r.success,true);assert.ok(!Object.hasOwn(f.writes[0].payload,'stock_quantity'));});
test('stale branch is rejected before a write',async()=>{const f=fixture({branch:'other'});const r=await f.api.updateProductGroup({},f.form());assert.equal(r.success,false);assert.equal(r.refreshRequired,true);assert.equal(f.writes.length,0);});
test('foreign variant IDs are rejected',async()=>{const f=fixture();const r=await f.api.updateProductGroup({},f.form([{...base,id:'foreign'}]));assert.equal(r.success,false);assert.equal(f.writes.length,0);});
test('missing saved rows are not treated as deletion',async()=>{const f=fixture({rows:[...fixture().rows(),{...fixture().rows()[0],id:'v2',sku:'OTHER',size:'L'}]});const r=await f.api.updateProductGroup({},f.form());assert.equal(r.success,false);assert.equal(f.writes.length,0);});
test('stale row versions stop before writes',async()=>{const f=fixture();const r=await f.api.updateProductGroup({},f.form([{...base,expectedUpdatedAt:'old'}]));assert.equal(r.refreshRequired,true);assert.equal(f.writes.length,0);});
test('update checks each row version and scopes to this business',async()=>{const f=fixture();await f.api.updateProductGroup({},f.form());assert.ok(f.writes[0].steps.some(s=>s[0]==='eq'&&s[1]==='business_id'&&s[2]==='business'));assert.ok(f.writes[0].steps.some(s=>s[0]==='eq'&&s[1]==='updated_at'&&s[2]===base.expectedUpdatedAt));});
test('zero affected rows require reload, not a successful save',async()=>{const f=fixture({zeroUpdate:true});const r=await f.api.updateProductGroup({},f.form());assert.equal(r.success,false);assert.equal(r.refreshRequired,true);});
test('main image X persists explicit null without touching colour images',async()=>{const f=fixture();const r=await f.api.updateProductGroup({},f.form([base],{mainImageAction:'remove'}));assert.equal(r.success,true);assert.equal(f.writes[0].payload.image_url,null);assert.ok(!Object.hasOwn(f.writes[0].payload,'variant_image_url'));assert.equal(f.removedFiles.length,0);});
test('variant image X persists null and keeps the main image',async()=>{const f=fixture();const r=await f.api.updateProductGroup({},f.form([{...base,imageAction:'remove'}]));assert.equal(r.success,true);assert.equal(f.writes[0].payload.variant_image_url,null);assert.ok(!Object.hasOwn(f.writes[0].payload,'image_url'));});
test('existing group image can be assigned to a variant',async()=>{const f=fixture();const r=await f.api.updateProductGroup({},f.form([{...base,imageAction:'existing',variantImageUrl:'https://images.test/main.jpg'}]));assert.equal(r.success,true);assert.equal(f.writes[0].payload.variant_image_url,'https://images.test/main.jpg');});
test('unrelated URL cannot be assigned as a product image',async()=>{const f=fixture();const r=await f.api.updateProductGroup({},f.form([base],{mainImageAction:'existing',mainImageUrl:'https://foreign.test/image.jpg'}));assert.equal(r.success,false);assert.equal(f.writes.length,0);});
test('foreign image on a variant is rejected before uploads',async()=>{const f=fixture();const r=await f.api.updateProductGroup({},f.form([{...base,imageAction:'existing',variantImageUrl:'javascript:alert(1)'}]));assert.equal(r.success,false);assert.equal(f.uploads.length,0);});
test('missing upload is an error, never a silent image removal',async()=>{const f=fixture();const r=await f.api.updateProductGroup({},f.form([{...base,imageAction:'upload',imageSlot:'file-1'}]));assert.equal(r.success,false);assert.equal(f.writes.length,0);});
test('replacement upload applies to saved variants (not only new rows)',async()=>{const f=fixture();const form=f.form([{...base,imageAction:'upload',imageSlot:'file-1'}]);form.set('runImage_file-1',new File(['png'],'colour.png',{type:'image/png'}));const r=await f.api.updateProductGroup({},form);assert.equal(r.success,true);assert.equal(f.uploads.length,1);assert.match(f.writes[0].payload.variant_image_url,/business\/user/);});
test('one upload can serve main image and all selected variants',async()=>{const f=fixture();const form=f.form([{...base,imageAction:'upload',imageSlot:'file-1'}],{mainImageAction:'upload',mainImageSlot:'file-1'});form.set('runImage_file-1',new File(['png'],'colour.png',{type:'image/png'}));const r=await f.api.updateProductGroup({},form);assert.equal(r.success,true);assert.equal(f.uploads.length,1);assert.equal(f.writes[0].payload.variant_image_url,f.writes[0].payload.image_url);});
test('invalid image type rejects save before writes',async()=>{const f=fixture();const form=f.form([{...base,imageAction:'upload',imageSlot:'file-1'}]);form.set('runImage_file-1',new File(['bad'],'x.svg',{type:'image/svg+xml'}));const r=await f.api.updateProductGroup({},form);assert.equal(r.success,false);assert.equal(f.uploads.length,0);assert.equal(f.writes.length,0);});
test('hidden rows cannot be re-exposed by the product online checkbox',async()=>{const f=fixture();await f.api.updateProductGroup({},f.form([{...base,isActive:false}]));assert.equal(f.writes[0].payload.is_online,false);});
test('partial save sets reload-required and never deletes committed uploads',async()=>{const rows=[...fixture().rows(),{...fixture().rows()[0],id:'v2',sku:'OTHER',size:'L'}];const f=fixture({rows,failUpdateAt:2});const form=f.form([{...base,imageAction:'upload',imageSlot:'file-1'},{...base,id:'v2',sku:'OTHER',size:'L'}]);form.set('runImage_file-1',new File(['png'],'x.png',{type:'image/png'}));const r=await f.api.updateProductGroup({},form);assert.equal(r.success,false);assert.equal(r.refreshRequired,true);assert.equal(f.writes.length,2);assert.equal(f.removedFiles.length,0);});
test('a new variant uses branch stock assignment rather than overwriting existing stock',async()=>{const f=fixture();const r=await f.api.updateProductGroup({},f.form([base,{...base,id:null,sku:'NEW',size:'L',stockQuantity:2}]));assert.equal(r.success,true);assert.equal(f.writes.filter(w=>w.operation==='insert').length,1);assert.ok(f.rpcCalls.some(c=>c.name==='tenh_pos_allocate_stock'));});
test('last variant cannot be removed through the row-removal endpoint',async()=>{const f=fixture();const r=await f.api.deleteProductVariants('v1',['v1']);assert.equal(r.success,false);assert.equal(f.writes.length,0);});
test('variant removal delegates stock clearing to one branch-scoped database deletion',async()=>{const rows=[{...fixture().rows()[0],stock_quantity:3},{...fixture().rows()[0],id:'v2',sku:'OTHER',size:'L'}];const f=fixture({rows});const r=await f.api.deleteProductVariants('v1',['v1']);assert.equal(r.success,true);assert.match(r.message,/stock was cleared/);assert.equal(f.writes.length,1);assert.equal(f.writes[0].table,'branch_products');assert.equal(f.writes[0].operation,'delete');});
test('removing the displayed representative returns the remaining route ID',async()=>{const rows=[...fixture().rows(),{...fixture().rows()[0],id:'v2',sku:'OTHER',size:'L'}];const f=fixture({rows});const r=await f.api.deleteProductVariants('v1',['v1']);assert.equal(r.success,true);assert.equal(r.remainingProductId,'v2');assert.equal(f.writes[0].table,'branch_products');});

function businessFixture(current='fashion') {
 let calls=0;
 const business={id:'business',slug:'shop',productMode:'variant',role:'owner'};
 const q={select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{business_type:current},error:null})};
 const api=loadTs('app/(dashboard)/dashboard/settings/business/actions.ts',{
  'node:crypto':{randomUUID:()=> 'request'},'next/cache':{revalidatePath(){}},'next/navigation':{redirect(){throw Error('REDIRECT');}},'next/dist/client/components/redirect-error':{isRedirectError:e=>e.message==='REDIRECT'},
  '@/lib/auth/require-permission':{requirePermission:async()=>business},'@/lib/audit/create-audit-log':{createAuditLog:async()=>{}},'@/lib/business/business-mode-presets':modes,
  '@/lib/supabase/admin':{supabaseAdmin:{from:()=>q,rpc:async()=>{calls++;return {data:{order_id:'order',order_status:'applied'},error:null};}}},
  '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'user'}}})}})},
  '@/lib/tenancy/store-slug-availability':{getStoreSlugAvailability:async slug=>({slug,status:'available'})},
  '@/lib/subscriptions/manual-bank':{},'@/lib/payway/server':{},'@/lib/subscriptions/payment-expiry':{},
 });
 return {api,calls:()=>calls};
}
for(const target of ['milk_tea','restaurant','cafe','beauty','electronics','other','retired-type']) test(`server rejects switch to ${target} before consuming credits`,async()=>{const f=businessFixture();const form=new FormData();form.set('subdomain','shop');form.set('businessMode',target);const r=await f.api.submitBusinessDetails({},form);assert.ok(r.error);assert.equal(f.calls(),0);});
test('legacy coming-soon business may change URL without changing its type',async()=>{const f=businessFixture('cafe');const form=new FormData();form.set('subdomain','new-shop');form.set('businessMode','cafe');await assert.rejects(()=>f.api.submitBusinessDetails({},form),/REDIRECT/);assert.equal(f.calls(),1);});
test('valid business switch keeps the existing credit application flow',async()=>{const f=businessFixture();const form=new FormData();form.set('subdomain','shop');form.set('businessMode','shoes');await assert.rejects(()=>f.api.submitBusinessDetails({},form),/REDIRECT/);assert.equal(f.calls(),1);});


test('adding variants requires create permission before any writes',async()=>{
 const f=fixture({deniedPermissions:['products.create']});
 const r=await f.api.updateProductGroup({},f.form([base,{...base,id:null,sku:'NEW',size:'L'}]));
 assert.equal(r.success,false);assert.ok(f.permissions.includes('products.create'));assert.equal(f.writes.length,0);
});
test('changing saved visibility requires disable permission before any writes',async()=>{
 const f=fixture({deniedPermissions:['products.disable']});
 const r=await f.api.updateProductGroup({},f.form([{...base,isActive:false}]));
 assert.equal(r.success,false);assert.ok(f.permissions.includes('products.disable'));assert.equal(f.writes.length,0);
});
test('variant removal rejects an outdated operating branch',async()=>{
 const f=fixture({branch:'different-branch'});const r=await f.api.deleteProductVariants('v1',['v1'],'branch');
 assert.equal(r.success,false);assert.match(r.message,/branch changed/);assert.equal(f.writes.length,0);
});
test('whole-product removal rejects an outdated operating branch',async()=>{
 const f=fixture({branch:'different-branch'});const r=await f.api.deleteProductGroup('v1','branch');
 assert.equal(r.success,false);assert.match(r.message,/branch changed/);assert.equal(f.writes.length,0);
});
test('business switching UI renders only the shared visible choices and disables coming-soon types',()=>{
 const jsx=(type,props)=>({type,props});
 const react={useState:value=>[value,()=>{}],useRef:value=>({current:value}),useMemo:fn=>fn(),useTransition:()=>[false,()=>{}],useActionState:()=>[{error:''},()=>{}]};
 const component=loadTs('app/(dashboard)/dashboard/settings/business/business-settings-client.tsx',{
  'react/jsx-runtime':{jsx,jsxs:jsx},react,'react-dom':{useFormStatus:()=>({pending:false})},
  'next/image':{default:()=>null},'next/link':{default:()=>null},'lucide-react':{},
  './pending-checkout-notice':{default:()=>null},'./credit-badges':{default:()=>null},
  '@/lib/business/business-mode-presets':modes,'@/lib/tenancy/domain':{normalizeTenantSlug:s=>s},
  './actions':{checkStoreAddressAvailability:async()=>({available:true}),submitBusinessDetails:async()=>({error:''})},
 }).default;
 function nodes(node){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(nodes);return [node,...nodes(node.props?.children)];}
 const tree=nodes(component({businessName:'Shop',currentBusinessType:'fashion',currentProductMode:'variant',initialSlug:'shop',rootDomain:'tenh-pos.com',canEdit:true,subscriptionPlanKey:'solo',freeUrlChangesRemaining:0,freeBusinessModeChangesRemaining:0,urlCredits:1,modeCredits:1}));
 const cards=tree.filter(n=>n.props?.preset?.value && 'comingSoon' in n.props);
 assert.deepEqual(cards.map(n=>n.props.preset.value),modes.visibleBusinessModePresets.map(p=>p.value));
 for(const card of cards){
  const disabled=!modes.isBusinessModeSelectable(card.props.preset.value);
  assert.equal(card.props.disabled,disabled);assert.equal(card.props.comingSoon,disabled);
  const rendered=card.type(card.props);assert.equal(rendered.props.disabled,disabled);assert.equal(rendered.props['aria-disabled'],disabled);
 }
 assert.equal(cards.find(n=>n.props.preset.value==='fashion').props.current,true);
});

test('gallery order chooses cover and persists all images',async()=>{const f=fixture();const urls=['https://images.test/black.jpg','https://images.test/main.jpg'];const form=f.form([base],{productGallery:JSON.stringify(urls.map(url=>({url})))});const r=await f.api.updateProductGroup({},form);assert.equal(r.success,true);assert.deepEqual(f.writes[0].payload.image_urls,urls);assert.equal(f.writes[0].payload.image_url,urls[0]);});
test('gallery rejects foreign images and more than eight photos before writes',async()=>{for(const entries of [[{url:'https://foreign.test/photo.jpg'}],Array(9).fill({url:'https://images.test/main.jpg'})]){const f=fixture();const r=await f.api.updateProductGroup({},f.form([base],{productGallery:JSON.stringify(entries)}));assert.equal(r.success,false);assert.equal(f.writes.length,0);assert.equal(f.uploads.length,0);}});
test('gallery uploads use existing image processing and persist cover',async()=>{const f=fixture();const form=f.form([base],{productGallery:JSON.stringify([{slot:'photo-1'}])});form.set('gallery_photo-1',new File(['png'],'photo.png',{type:'image/png'}));const r=await f.api.updateProductGroup({},form);assert.equal(r.success,true);assert.equal(f.uploads.length,1);assert.deepEqual(f.writes[0].payload.image_urls,[f.writes[0].payload.image_url]);});
test('existing barcode survives edits from legacy clients',async()=>{const seed=fixture().rows()[0];const f=fixture({rows:[{...seed,barcode:'T123456789ABC'}]});const r=await f.api.updateProductGroup({},f.form());assert.equal(r.success,true);assert.equal(f.writes[0].payload.barcode,'T123456789ABC');});
test('explicit generated barcode persists without changing SKU',async()=>{const f=fixture();const r=await f.api.updateProductGroup({},f.form([{...base,barcode:'T123456789ABC'}]));assert.equal(r.success,true);assert.equal(f.writes[0].payload.barcode,'T123456789ABC');assert.equal(f.writes[0].payload.sku,base.sku);});

test('per-variant online visibility does not hide sibling variants',async()=>{
 const seed=fixture().rows()[0];
 const f=fixture({rows:[seed,{...seed,id:'v2',sku:'OTHER',size:'L'}]});
 const r=await f.api.updateProductGroup({},f.form([{...base,isOnline:false},{...base,id:'v2',sku:'OTHER',size:'L',isOnline:true}]));
 assert.equal(r.success,true);
 assert.deepEqual(f.writes.filter(w=>w.operation==='update').map(w=>w.payload.is_online),[false,true]);
});
test('invalid per-variant online visibility rejects save before writes',async()=>{
 const f=fixture(); const r=await f.api.updateProductGroup({},f.form([{...base,isOnline:'false'}]));
 assert.equal(r.success,false); assert.equal(f.writes.length,0);
});

test('stock selection may delete the last selected variant without widening deletion',async()=>{
 const f=fixture(); const r=await f.api.deleteProductVariants('v1',['v1'],undefined,true);
 assert.equal(r.success,true); assert.equal(f.writes.length,1);
});
test('stock visibility rejects a stale operating branch before writes',async()=>{
 const f=fixture({branch:'other'}); const r=await f.api.setProductVariantsActive('v1',['v1'],false,'branch');
 assert.equal(r.success,false); assert.equal(f.writes.length,0);
});
