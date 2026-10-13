/* eslint-disable @typescript-eslint/no-require-imports -- Standalone synthetic Node tests. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs,queryDouble}=require('./helpers/load-ts.cjs');
const z=require('@zxing/library'),qrcode=require('qrcode');
const scan=loadTs('lib/search/scan-code.ts',{'@/lib/tenancy/domain':{getRootHostname:()=> 'tenhpos.com'}});
const ID='11111111-1111-4111-8111-111111111111', BUSINESS='business', BRANCH='branch-a';
test('QR classification rejects arbitrary URLs, credentials, malformed paths and unsupported symbologies',()=>{
  for(const value of ['TENH:ORDER:1:'+ID,'https://tenhpos.com/o/123456789012','https://shop.tenhpos.com/o/123456789012','tenhpos://o/123456789012','123456789012'])assert.equal(scan.classifySearchScan(value,'QR_CODE')?.kind,'order');
  for(const value of ['https://evil.test/o/123456789012','https://tenhpos.com.evil.test/o/123456789012','https://u:p@tenhpos.com/o/123456789012','tenhpos://evil/o/123456789012','https://tenhpos.com/other/o/123456789012','https://tenhpos.com/o/123456789012/extra','https://tenhpos.com/o/123456789012?q=token','javascript:alert(1)','customer private text','TENH:ORDER:1:invalid','0012345678905'])assert.equal(scan.classifySearchScan(value,'QR_CODE'),null,value);
  for(const format of ['EAN_13','EAN_8','UPC_A','CODE_128','CODE_39'])assert.deepEqual(scan.classifySearchScan('0012345678905',format),{kind:'linear',value:'0012345678905'});
  assert.equal(scan.classifySearchScan('0012345','ITF'),null);
  assert.equal(scan.classifySearchScan('a\n','CODE_128'),null);
});
test('camera errors have safe, distinct permission, device and initialization messages',()=>{
  for(const [name,word] of [['NotAllowedError','denied'],['SecurityError','denied'],['NotFoundError','No camera'],['OverconstrainedError','No camera'],['NotReadableError','in use'],['AbortError','in use'],['Other','could not start']]){
    const error=new Error('sensitive data');error.name=name;assert.ok(scan.cameraErrorMessage(error).includes(word));assert.ok(!scan.cameraErrorMessage(error).includes('sensitive'));
  }
});
const L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const G=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const parity=['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
function checksum(value){return String((10-[...value].reverse().reduce((sum,d,i)=>sum+Number(d)*(i%2?1:3),0)%10)%10);}
function ean(value){if(value.length===12)value='0'+value;const half=value.length===8?4:6;let bits='101';const left=value.length===8?value.slice(0,4):value.slice(1,7);[...left].forEach((d,i)=>bits+=(value.length===8||parity[Number(value[0])][i]==='L'?L:G)[Number(d)]);bits+='01010';for(const d of value.slice(-half))bits+=L[Number(d)].replace(/[01]/g,x=>x==='0'?'1':'0');return bits+'101';}
function code128(value){const patterns=z.Code128Reader.CODE_PATTERNS;const codes=[104,...[...value].map(x=>x.charCodeAt(0)-32)];codes.push(codes.reduce((sum,c,i)=>sum+c*(i||1),0)%103,106);return codes.map(c=>Array.from(patterns[c],(w,i)=>(i%2?'0':'1').repeat(w)).join('')).join('');}
function decodeBits(bits){const width=(bits.length+40)*3,height=100,pixels=new Uint8ClampedArray(width*height).fill(255);for(let y=10;y<90;y++)for(let x=0;x<bits.length;x++)if(bits[x]==='1')for(let k=0;k<3;k++)pixels[y*width+(x+20)*3+k]=0;const reader=new z.MultiFormatReader();reader.setHints(new Map([[z.DecodeHintType.POSSIBLE_FORMATS,scan.scanFormats.filter(f=>f!=='UPC_A').map(f=>z.BarcodeFormat[f])]]));return reader.decodeWithState(new z.BinaryBitmap(new z.HybridBinarizer(new z.RGBLuminanceSource(pixels,width,height))));}
test('installed ZXing decodes synthetic EAN-13, EAN-8, UPC-A and Code 128 without dropping leading zeros',()=>{
 const cases=[['EAN_13','001234567890'+checksum('001234567890')],['EAN_8','0012345'+checksum('0012345')],['UPC_A','00123456789'+checksum('00123456789')],['CODE_128','00ABC123']];
 for(const [format,value] of cases){let result;try {result=decodeBits(format==='CODE_128'?code128(value):ean(value));} catch(error) {assert.fail(format+': '+error.message);}const expected=format==='UPC_A'?'0'+value:value;assert.equal(result.getText(),expected,format);assert.deepEqual(scan.classifySearchScan(result.getText(),z.BarcodeFormat[result.getBarcodeFormat()]),{kind:'linear',value:expected});}
});
test('installed ZXing decodes a generated TENH order QR and rejects decoded unknown QR content',()=>{
 for(const payload of ['https://tenhpos.com/o/123456789012','https://evil.test/o/123456789012']){
  const {modules}=qrcode.create(payload,{errorCorrectionLevel:'M'}),width=(modules.size+8)*5,pixels=new Uint8ClampedArray(width*width).fill(255);
  for(let y=0;y<modules.size;y++)for(let x=0;x<modules.size;x++)if(modules.get(y,x))for(let dy=0;dy<5;dy++)for(let dx=0;dx<5;dx++)pixels[((y+4)*5+dy)*width+(x+4)*5+dx]=0;
  const result=new z.QRCodeReader().decode(new z.BinaryBitmap(new z.HybridBinarizer(new z.RGBLuminanceSource(pixels,width,width))));
  assert.equal(result.getText(),payload);assert.equal(scan.classifySearchScan(result.getText(),'QR_CODE')?.kind,payload.includes('evil')?undefined:'order');
 }
});
function actions({permissions=['business.view','products.view','customers.view','orders.view','suppliers.manage','purchases.view','transfers.manage','credit.manage'],failure=null,resolve={id:ID},missing=false,collision=false,productSku='ABC123',productName='Classic shirt',role='staff',retiredAlias=false,aliasFailure=false,unavailable=false}={}){
 const log=[],rows={
  business_locations:[{id:BRANCH,name:'Main',business_id:BUSINESS,is_active:true},{id:'branch-b',name:'Hidden',business_id:BUSINESS,is_active:true}],
  branch_products:[{id:'product',business_id:BUSINESS,name:productName,sku:productSku,barcode:collision?'1001':'0012345678905',color:'Black',size:'M',image_url:'/synthetic.svg',stock_quantity:5,selling_price:12,created_at:'2026-10-10',is_active:true}],
  customers:[{id:'customer',business_id:BUSINESS,name:'Synthetic Customer',phone:'012345678',loyalty_points:3,created_at:'2026-10-10',customer_credit_accounts:{balance:10}}],
  suppliers:[{id:'supplier',business_id:BUSINESS,name:'Synthetic Supplier',phone:'098765432',created_at:'2026-10-10',is_active:true}],
  purchase_orders:[{id:'purchase',business_id:BUSINESS,po_number:'PO-0042',supplier_name:'Synthetic Supplier',reference_number:'REF42',status:'draft',total:20,created_at:'2026-10-10'}],
  stock_transfers:[{id:'restricted-transfer',business_id:BUSINESS,source_location_id:'branch-b',destination_location_id:'branch-c',transfer_number:'TR-0008'}, {id:'transfer',business_id:BUSINESS,transfer_number:'TR-0007',source_location_id:BRANCH,destination_location_id:'branch-b',status:'draft',note:'Synthetic note',created_at:'2026-10-10'}],
  orders:[{id:ID,business_id:BUSINESS,order_code:'123456789012',order_number:'1001',customer_id:'customer',guest_name:'Walk-in',guest_phone:'00001111',total:15,location_id:BRANCH,status:'pending',created_at:'2026-10-10',archived_at:null}]
 };
 const db={from:table=>{const q=queryDouble(table,call=>{
  if(failure===table)return{data:null,error:{message:'synthetic failure'}};
  let data=rows[table]||[];
  for(const [kind,field,value] of call.steps){
   if(kind==='eq')data=data.filter(row=>row[field]===value);
   if(kind==='in')data=data.filter(row=>value.includes(row[field]));
   if(kind==='or'&&table==='stock_transfers'){const ids=field.match(/source_location_id\.in\.\(([^)]*)\)/)?.[1].split(',')||[];if(ids.length)data=data.filter(row=>ids.includes(row.source_location_id)||ids.includes(row.destination_location_id));}
   if(kind==='or'&&field.includes('.eq.')){const terms=[...field.matchAll(/(\w+)\.eq\.("(?:[^"\\]|\\.)*")/g)];data=data.filter(row=>terms.some(([,key,value])=>String(row[key]||'')===JSON.parse(value)));continue;}
   if(kind==='or'){const terms=[...field.matchAll(/(\w+)\.ilike\.("(?:[^"\\]|\\.)*")/g)];data=data.filter(row=>terms.some(([,key,pattern])=>String(row[key]||'').toLowerCase().includes(JSON.parse(pattern).slice(1,-1).replace(/\\([%_\\])/g,'$1').toLowerCase())));}
  }return{data,error:null};
 },log);q.is=(...args)=>{log.at(-1).steps.push(['is',...args]);return q;};return q;}};
 db.rpc=async(name,args)=>{if(missing||(aliasFailure&&name==='tenh_scan_product_ids'))return {data:null,error:{code:'PGRST202'}};log.push({table:'rpc:'+name,steps:[['p_business',args.p_business],['p_value',args.p_value]]});return {error:null,data:(name==='tenh_scan_product_ids'?rows.branch_products.filter(row=>[row.barcode,row.sku].includes(args.p_value)||(retiredAlias&&args.p_value==='123456789012')).map(row=>({product_id:row.id})):rows.orders.filter(row=>[row.order_code,row.order_number].includes(args.p_value)).map(row=>({order_id:row.id})))};};
 const exact=loadTs('lib/search/exact-scan.ts',{'server-only':{},'@/lib/barcode/require-contract':{barcodePreservationEnabled:async()=>{if(unavailable)throw Error('Barcode verification is unavailable');return !missing;}},'@/app/(dashboard)/dashboard/orders/[id]/order-detail-data':{loadDetailedOrder:async(b,id)=>rows.orders.find(row=>row.id===id&&row.business_id===b&&row.location_id===BRANCH)||null}});
 const {runGlobalSearch}=loadTs('app/(dashboard)/dashboard/search/search-actions.ts',{
  '@/lib/auth/require-permission':{requirePermission:async p=>{if(!permissions.includes(p))throw Error('Forbidden');return{id:BUSINESS,role};}},
  '@/lib/auth/effective-permissions':{getEffectivePermissions:async()=>permissions},
  '@/lib/branches/context':{getBranchContext:async()=>({branchId:BRANCH,branches:[{id:BRANCH,name:'Main'}]})},
  '@/lib/supabase/branch-server':{createClient:async()=>db},
  '@/lib/orders/resolve-order-qr':{resolveOrderQr:async()=>resolve},
  '@/lib/search/scan-code':scan,'@/lib/search/exact-scan':exact
 });return{runGlobalSearch,log};
}
for(const [query,kind] of [['#1001','order'],['Order #1001','order'],['SKU ABC123','product'],['Classic shirt','product'],['0012345678905','product'],['Synthetic Customer','customer'],['012345678','customer'],['Synthetic Supplier','supplier'],['PO-0042','purchase_order'],['REF42','purchase_order'],['TR-0007','transfer']])test('supported search: '+query,async()=>{
 const a=actions(),result=await a.runGlobalSearch({query});assert.ok(result.results.some(r=>r.kind===kind));assert.ok(!result.results.some(r=>r.id==='restricted-transfer'));assert.deepEqual(result.branches,[{id:BRANCH,name:'Main'}]);
 for(const call of a.log)assert.ok(call.steps.some(s=>s[0]==='eq'&&s[1]==='business_id'&&s[2]===BUSINESS),call.table);
});
test('barcode exact query, product branch metadata and supplier/credit links',async()=>{
 const a=actions();let result=await a.runGlobalSearch({query:'0012345678905',productBarcode:'0012345678905'});assert.equal(result.results[0].branchId,BRANCH);assert.equal(result.results[0].imageUrl,'/synthetic.svg');
 assert.deepEqual(a.log.find(c=>c.table==='rpc:tenh_scan_product_ids').steps,[['p_business',BUSINESS],['p_value','0012345678905']]);
 result=await a.runGlobalSearch({query:'Synthetic Supplier'});assert.equal(result.results.find(r=>r.kind==='supplier').href,'/dashboard/suppliers/supplier/edit');
 const c=actions({permissions:['business.view','credit.manage']});result=await c.runGlobalSearch({query:'Synthetic Customer'});assert.equal(result.results[0].href,'/dashboard/customer-credit');assert.ok(!c.log.some(x=>x.table==='orders'||x.table==='branch_products'));
});
test('ordinary search also finds an exact numeric receipt order code without stripping zeros',async()=>{
 const a=actions();const result=await a.runGlobalSearch({query:'123456789012'});assert.ok(result.results.some(row=>row.kind==='order'));
 assert.ok(a.log.some(call=>call.table==='orders'&&call.steps.some(step=>step[0]==='or'&&step[1].includes('order_code.eq."123456789012"'))));
});
test('retired product alias colliding with an order stays ambiguous and never degrades to order-only lookup',async()=>{
 const a=actions({retiredAlias:true});const result=await a.runGlobalSearch({query:'123456789012',linearBarcode:'123456789012'});assert.equal(result.scanResolution,'ambiguous');assert.deepEqual(new Set(result.results.map(row=>row.kind)),new Set(['order','product']));
 const unavailable=actions({retiredAlias:true,unavailable:true});await assert.rejects(unavailable.runGlobalSearch({query:'123456789012',linearBarcode:'123456789012'}),/verification is unavailable/);assert.ok(!unavailable.log.some(call=>call.table==='orders'));
 const missingAlias=actions({retiredAlias:true,aliasFailure:true});await assert.rejects(missingAlias.runGlobalSearch({query:'123456789012',linearBarcode:'123456789012'}),/barcode.*lookup/);assert.ok(!missingAlias.log.some(call=>call.table==='orders'||call.table==='rpc:tenh_scan_order_ids'));
});
test('order QR invokes authorized resolver, restricts order id and hides missing/wrong-business codes',async()=>{
 const a=actions(),result=await a.runGlobalSearch({query:'TENH POS order',orderQr:'https://tenhpos.com/o/123456789012'});
 assert.equal(result.results.length,1);assert.equal(result.results[0].href,'/dashboard/orders/'+ID);assert.ok(a.log.find(c=>c.table==='orders').steps.some(s=>s[0]==='eq'&&s[1]==='id'&&s[2]===ID));
 for(const orderQr of ['https://evil.test/o/123456789012','https://tenhpos.com/other/o/123456789012'])assert.deepEqual((await actions().runGlobalSearch({query:'TENH POS order',orderQr})).results,[]);
 for(const resolve of [{error:'Order not found or unavailable in this branch.'},{id:'other-business-id'}])assert.deepEqual((await actions({resolve}).runGlobalSearch({query:'TENH POS order',orderQr:'https://tenhpos.com/o/123456789012'})).results,[]);
 await assert.rejects(actions({resolve:{error:'Unable to load this order. Please try again.'}}).runGlobalSearch({query:'TENH POS order',orderQr:'https://tenhpos.com/o/123456789012'}),/Unable/);
 assert.deepEqual((await actions({permissions:['business.view','products.view']}).runGlobalSearch({query:'TENH POS order',orderQr:'123456789012'})).results,[]);
});
test('search errors distinguish incomplete datasets, invalid inputs and denied workspace access',async()=>{
 const result=await actions({failure:'branch_products'}).runGlobalSearch({query:'ABC123'});assert.ok(result.warnings.includes('Products could not be searched.'));
 assert.deepEqual((await actions().runGlobalSearch({query:123})).results,[]);
 await assert.rejects(actions({permissions:[]}).runGlobalSearch({query:'ABC123'}),/Forbidden/);
});


test('installed ZXing reads the existing Code 39 label representation',()=>{
 const {code39BarsExact}=loadTs('lib/barcode/code39.ts');
 const barcode=code39BarsExact('00ABC123'),bits=Array(barcode.width).fill('0');
 for(const bar of barcode.bars)for(let x=bar.x;x<bar.x+bar.width;x++)bits[x]='1';
 const decoded=decodeBits(bits.join(''));assert.equal(decoded.getText(),'00ABC123');assert.equal(scan.classifySearchScan(decoded.getText(),'CODE_39').kind,'linear');
});
test('linear scans surface collisions and retain exact values and permissions',async()=>{
 const a=actions({collision:true}),result=await a.runGlobalSearch({query:'1001',linearBarcode:'1001'});
 assert.equal(result.scanResolution,'ambiguous');assert.deepEqual(result.results.map(row=>row.kind).sort(),['order','product']);
 const only=actions({permissions:['business.view','products.view']});assert.equal((await only.runGlobalSearch({query:'0012345678905',linearBarcode:'0012345678905'})).results[0].kind,'product');assert.ok(!only.log.some(call=>call.table==='rpc:tenh_scan_order_ids'));
 const no=actions({permissions:['business.view']});assert.deepEqual((await no.runGlobalSearch({query:'0012345678905',linearBarcode:'0012345678905'})).results,[]);assert.ok(!no.log.some(call=>call.table.startsWith('rpc:')));
});
test('missing optional RPCs fall back to exact existing fields without zero-stripping or prefix matching',async()=>{
 const a=actions({missing:true});const result=await a.runGlobalSearch({query:'0012345678905',linearBarcode:'0012345678905'});assert.equal(result.results.length,1);assert.equal(result.results[0].id,'product');
 const productLookup=a.log.find(call=>call.table==='branch_products'&&call.steps.some(step=>step[0]==='select'&&step[1]==='id'));
 assert.ok(productLookup.steps.some(step=>step[0]==='or'&&step[1]==='barcode.eq."0012345678905",sku.eq."0012345678905"'));
 for(const value of ['012345678905','0012345',' ABC123','ABC123 '])assert.deepEqual((await actions({missing:true}).runGlobalSearch({query:value,linearBarcode:value})).results,[]);
 const order=await actions({missing:true}).runGlobalSearch({query:'123456789012',linearBarcode:'123456789012'});assert.equal(order.results[0].kind,'order');assert.equal(order.scanResolution,'unique-order');
});
test('fallback lookup errors remain errors instead of displaying old or partial matches',async()=>{
 await assert.rejects(actions({missing:true,failure:'branch_products'}).runGlobalSearch({query:'ABC123',linearBarcode:'ABC123'}),/lookup/);
});
test('supplier detail route enforces permission and business before returning its form',async()=>{
 const calls=[];let allowed=true;
 const {default:page}=loadTs('app/(dashboard)/dashboard/suppliers/[id]/edit/page.tsx',{
  'react/jsx-runtime':require('react/jsx-runtime'),'next/link':{default:()=>null},'next/navigation':{notFound:()=>{throw Error('Not found');}},'lucide-react':{ArrowLeft:()=>null,Save:()=>null},
  '@/lib/supabase/branch-server':{createClient:async()=>({from:table=>queryDouble(table,{data:{id:'supplier',name:'Synthetic Supplier'},error:null},calls)})},
  '@/lib/auth/require-permission':{requirePermission:async permission=>{assert.equal(permission,'suppliers.manage');if(!allowed)throw Error('Forbidden');return{id:BUSINESS};}},
  '@/app/(dashboard)/dashboard/suppliers/actions':{updateSupplier:()=>{throw Error('Fixture prohibits mutation');}}
 });
 await page({params:Promise.resolve({id:'supplier'})});assert.ok(calls[0].steps.some(step=>step[0]==='eq'&&step[1]==='business_id'&&step[2]===BUSINESS));
 allowed=false;calls.length=0;await assert.rejects(page({params:Promise.resolve({id:'supplier'})}),/Forbidden/);assert.equal(calls.length,0);
});

test('literal SKU underscores, commas, quotes and percent signs remain searchable',async()=>{
 for(const query of ['SKU_A01','Blue, \"100%\" shirt']){
  const result=await actions({productSku:'SKU_A01',productName:'Blue, \"100%\" shirt'}).runGlobalSearch({query});
  assert.ok(result.results.some(row=>row.kind==='product'));assert.equal(result.query,query);
 }
});

test('staff transfer search excludes other branches while owner history remains available',async()=>{
 const staff=await actions().runGlobalSearch({query:'TR-000'});assert.deepEqual(staff.results.filter(row=>row.kind==='transfer').map(row=>row.id),['transfer']);
 const owner=await actions({role:'owner'}).runGlobalSearch({query:'TR-000'});assert.equal(owner.results.filter(row=>row.kind==='transfer').length,2);
});
