const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { BitArray, Code39Reader } = require('@zxing/library');
const { loadTs } = require('./helpers/load-ts.cjs');
const barcode = loadTs('lib/barcode/code39.ts');
function fixture({ denied = false, legacyBarcode = '0000123456789' } = {}) {
  const business = { id:'business', slug:'shop', role:'owner', productMode:'standard' };
  const context = { business, branchId:'branch-a' };
  const rows = new Map(['branch-a','branch-b'].map(branch => [branch, [{ id:'p1', business_id:'business', name:'Product', sku:'SKU1', barcode:legacyBarcode, product_type:'standard', variant_group_id:null, stock_quantity:3, low_stock_quantity:1, updated_at:'version', is_active:true, is_online:false }]]));
  const writes = [], clients = [], permissions = [];
  function query(table, branch) {
    let payload, operation = 'read'; const filters = [], q = {};
    for (const method of ['select','order','limit']) q[method] = () => q;
    q.eq = (key,value) => { filters.push(row=>row[key]===value); return q; };
    q.neq = (key,value) => { filters.push(row=>row[key]!==value); return q; };
    q.in = (key,values) => { filters.push(row=>values.includes(row[key])); return q; };
    q.update = value => { operation='update'; payload=value; return q; };
    q.insert = value => { operation='insert'; payload=value; return q; };
    q.single = q.maybeSingle = () => { q.one=true; return q; };
    q.then = (ok,fail) => Promise.resolve().then(() => {
      const found = (rows.get(branch) || []).filter(row=>filters.every(filter=>filter(row)));
      if (operation !== 'read') { writes.push({ branch,table,operation,payload }); found.forEach(row=>Object.assign(row,payload)); }
      return { data:q.one ? found[0] || null : found, error:null };
    }).then(ok,fail);
    return q;
  }
  // The edit RPC writes all saved rows of the request branch in one transaction.
  const rpc = branch => async (name,args) => {
    if (name !== 'tenh_edit_product_rows') return { data:null, error:null };
    for (const item of args.p_rows) { writes.push({ branch,table:'branch_products',operation:'update',payload:item.values }); Object.assign((rows.get(branch)||[]).find(row=>row.id===item.id&&row.updated_at===item.expectedUpdatedAt)||{},item.values); }
    return { data:{ success:true, ids:args.p_rows.map(item=>item.id) }, error:null };
  };
  const db = branch => ({ auth:{getUser:async()=>({data:{user:{id:'user'}}})}, from:table=>query(table,branch), rpc:rpc(branch) });
  const api = loadTs('app/(dashboard)/dashboard/products/actions.ts', {
    '@/lib/barcode/code39':barcode,
    '@/lib/products/variant-editor':loadTs('lib/products/variant-editor.ts'),
    '@/lib/images/compress-photo':{}, '@/lib/public-photo-cache':{},
    'next/cache':{revalidatePath(){}}, 'next/navigation':{redirect(){throw Error('redirect');}},
    '@/lib/subscriptions/branch-limits':{assertBranchOperation:async()=>{}},
    '@/lib/audit/create-audit-log':{createAuditLog:async()=>{}},
    '@/lib/business/get-current-business-mode':{getCurrentBusinessMode:async()=>({value:'general',productMode:'standard'})},
    '@/lib/supabase/branch-server':{createClient:async()=>{clients.push(context.branchId);return db(context.branchId);}},
    '@/lib/branches/context':{getBranchContext:async()=>context},
    '@/lib/supabase/admin':{supabaseAdmin:db('branch-a')},
    '@/lib/auth/require-permission':{requirePermission:async permission=>{permissions.push(permission);if(denied)throw Error('Denied');return business;}},
  });
  function form(value) {
    const f = new FormData();
    for (const [key,fieldValue] of Object.entries({productId:'p1',branchId:'branch-a',name:'Product renamed',barcode:value,isOnline:'false',mainImageAction:'keep'})) f.set(key,fieldValue);
    f.set('variants',JSON.stringify([{id:'p1',sku:'SKU1',barcode:value,size:'',color:'',costPrice:2,sellingPrice:5,stockQuantity:3,lowStockQuantity:1,isActive:true,expectedUpdatedAt:'version'}]));
    return f;
  }
  return {api,business,context,rows,writes,clients,permissions,form};
}
test('visibility refuses missing, changed business, and changed branch scopes before opening a database client', async () => {
  for (const scope of [undefined, {businessId:'business',branchId:''}, {businessId:'other',branchId:'branch-a'}, {businessId:'business',branchId:'branch-b'}]) {
    const f=fixture(); const result=await f.api.setProductGroupActive('p1',false,scope);
    assert.equal(result.success,false); assert.match(result.message,/business or operating branch changed/);
    assert.equal(f.clients.length,0); assert.equal(f.writes.length,0);
    for (const rows of f.rows.values()) assert.equal(rows[0].is_active,true);
  }
});
test('visibility retains permission enforcement and changes only the verified branch', async () => {
  const denied=fixture({denied:true}); await assert.rejects(denied.api.setProductGroupActive('p1',false,{businessId:'business',branchId:'branch-a'}),/Denied/);
  assert.equal(denied.clients.length,0);
  const f=fixture(); assert.equal((await f.api.setProductGroupActive('p1',false,{businessId:'business',branchId:'branch-a'})).success,true);
  assert.deepEqual(f.permissions,['products.disable']); assert.equal(f.rows.get('branch-a')[0].is_active,false); assert.equal(f.rows.get('branch-b')[0].is_active,true);
  assert.equal((await f.api.setProductGroupActive('p1',true,{businessId:'business',branchId:'branch-a'})).success,true);
  assert.equal(f.rows.get('branch-a')[0].is_active,true);
});
function nodes(node) { return !node || typeof node!=='object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node,...nodes(node.props?.children)]; }
test('changing the branch cookie while a catalog confirmation is open mutates neither branch', async () => {
  const previousDocument=global.document, previousWindow=global.window;
  global.document={body:{}}; global.window={innerWidth:1200,innerHeight:900};
  try {
    const f=fixture(); let cursor=0,pending; const states=[];
    const Catalog=loadTs('components/product-list.tsx',{
      '@/components/providers/language-provider':{useLanguage:()=>({language:'en',t:text=>text})},
      '@/lib/i18n/translations':loadTs('lib/i18n/translations.ts'),
      react:{useState:initial=>{const k=cursor++;if(!(k in states))states[k]=typeof initial==='function'?initial():initial;return[states[k],value=>{states[k]=typeof value==='function'?value(states[k]):value;}];},useMemo:fn=>fn(),useEffect(){},useTransition:()=>[false,fn=>{pending=fn();}]},
      'react/jsx-runtime':require('react/jsx-runtime'),'react-dom':{createPortal:node=>node},
      'next/link':{default:'a'},'next/navigation':{useRouter:()=>({refresh(){}})},'lucide-react':require('lucide-react'),sonner:{toast:{error(){}}},
      '@/components/anchored-action-menu':{default:'menu'},'@/components/product-photo':{default:'img'},'@/components/product-photo-viewer':{default:()=>null},'@/lib/inventory/stock-adjustment':{},
      '@/app/(dashboard)/dashboard/products/actions':f.api,
    }).default;
    const render=()=>{cursor=0;return Catalog({products:f.rows.get('branch-a'),businessId:'business',branchId:'branch-a'});};
    const find=(tree,predicate)=>nodes(tree).find(predicate);
    find(render(),node=>node.props?.['aria-label']==='Actions for Product').props.onClick({preventDefault(){},stopPropagation(){},currentTarget:{getBoundingClientRect:()=>({right:400,bottom:100,top:70})}});
    const menu=find(render(),node=>node.props?.role==='menu');
    find(menu,node=>node.type==='button' && node.props.children.includes('Hide')).props.onClick();
    const confirmation=find(render(),node=>node.props?.role==='alertdialog');
    f.context.branchId='branch-b';
    nodes(confirmation).filter(node=>node.type==='button').at(-1).props.onClick(); await pending;
    assert.equal(f.writes.length,0); assert.equal(f.clients.length,0);
    for(const rows of f.rows.values())assert.equal(rows[0].is_active,true);
    assert.ok(JSON.stringify(render()).includes('operating branch changed'));
  } finally {global.document=previousDocument;global.window=previousWindow;}
});
test('strict product encoding rejects lowercase, unsupported characters, empty and long codes without transforming', () => {
  for(const [value,message] of [['abc123',/uppercase/],['SKU_1',/unsupported/],['A*B',/unsupported/],['商品',/unsupported/],['123\n456',/unsupported/],['',/required/],['1'.repeat(41),/40 characters/]]) {
    assert.match(barcode.validateCode39(value),message);
    assert.throws(()=>barcode.code39BarsExact(value),message);
  }
});
test('independent ZXing Code39 scanner fixture round-trips exact labels and leading zeros', () => {
  for(const value of ['0000123456789','ABC123','SKU-1','A.B $/+%-','1'.repeat(40)]) {
    assert.equal(barcode.validateCode39(value),null);
    const code=barcode.code39BarsExact(value); assert.equal(code.text,value);
    const row=new BitArray(code.width+80);
    for(const bar of code.bars)for(let x=bar.x+40;x<bar.x+40+bar.width;x++)row.set(x);
    assert.equal(new Code39Reader().decodeRow(0,row,null).getText(),value);
  }
});
test('new or changed invalid product barcodes reject before writes; unchanged legacy codes are preserved', async () => {
  for(const value of ['abc123','SKU_1','1'.repeat(41)]) {
    const changed=fixture(); const result=await changed.api.updateProductGroup({},changed.form(value));
    assert.equal(result.success,false); assert.match(result.message,/Code 39/); assert.equal(changed.writes.length,0);
    const create=fixture();const form=new FormData();for(const[k,v]of Object.entries({name:'Product',sku:'SKU1',barcode:value,locationId:'branch-a'}))form.set(k,v);
    const created=await create.api.createProduct({},form);assert.equal(created.success,false);assert.match(created.message,/Code 39/);assert.equal(create.writes.length,0);
    const legacy=fixture({legacyBarcode:value}); const saved=await legacy.api.updateProductGroup({},legacy.form(value));
    assert.equal(saved.success,true); assert.equal(legacy.rows.get('branch-a')[0].barcode,value);assert.ok(!Object.hasOwn(legacy.writes[0].payload,'stock_quantity'));
  }
});
const labelDeps={react:React,'react/jsx-runtime':require('react/jsx-runtime'),'lucide-react':require('lucide-react'),'@/components/providers/language-provider':{useLanguage:()=>({language:'en',t:text=>text})},'@/lib/i18n/translations':loadTs('lib/i18n/translations.ts'),'@/lib/barcode/code39':barcode,'@/lib/receipts/receipt-model':{printTextScale:()=>1},'@/lib/printing/prepare-print':{},'@/components/product-picker':{default:()=>null}};
test('unsupported saved labels show an explanation instead of a transformed barcode or render crash', () => {
  const {LabelCard}=loadTs('app/(dashboard)/dashboard/barcodes/barcode-labels-client.tsx',labelDeps);
  for(const value of ['abc123','SKU_1','1'.repeat(41),'',' SKU1 ','   ']) {
    const html=renderToStaticMarkup(React.createElement(LabelCard,{product:{id:'product',name:'Legacy',barcode:value,sku:''},businessName:'Fixture',size:'50x30',templateId:'product',elements:{barcode:true,name:true},customText:''}));
    assert.match(html,/role="alert"/);assert.match(html,/unchanged/);assert.ok(!html.includes('<svg'));
  }
});

test('name-only edits preserve NULL and empty legacy barcode columns with the unchanged SKU fallback', async () => {
  for (const legacyBarcode of [null, '']) for (const variantStyle of [false, true]) {
    const f=fixture({legacyBarcode});
    for(const rows of f.rows.values())Object.assign(rows[0],{sku:'LEGACY_1',...(variantStyle?{product_type:'variant',variant_group_id:'style',size:'M',color:'Black'}:{})});
    const form=f.form(legacyBarcode===null?'LEGACY_1':'');
    const variants=JSON.parse(form.get('variants'));
    Object.assign(variants[0],{sku:'LEGACY_1',barcode:'',...(variantStyle?{size:'M',color:'Black'}:{})});
    form.set('variants',JSON.stringify(variants));
    const result=await f.api.updateProductGroup({},form);
    assert.equal(result.success,true,result.message);
    assert.equal(f.rows.get('branch-a')[0].barcode,legacyBarcode);
    assert.equal(f.rows.get('branch-a')[0].name,'Product renamed');
    assert.equal(f.rows.get('branch-a')[0].sku,'LEGACY_1');
    assert.equal(f.rows.get('branch-b')[0].barcode,legacyBarcode);
    assert.equal(f.writes.length,1);
    assert.ok(!Object.hasOwn(f.writes[0].payload,'barcode'));
    assert.ok(!Object.hasOwn(f.writes[0].payload,'stock_quantity'));
  }
});

test('intentional identifier changes validate raw padding and whitespace before any writes', async () => {
  for(const value of ['NEW_CODE','lowercase','1'.repeat(41),' SKU1','SKU1 ','   ','\tSKU1']) {
    const f=fixture({legacyBarcode:null});
    for(const rows of f.rows.values())rows[0].sku='LEGACY_1';
    const form=f.form(value);const variants=JSON.parse(form.get('variants'));variants[0].sku='LEGACY_1';form.set('variants',JSON.stringify(variants));
    const result=await f.api.updateProductGroup({},form);
    assert.equal(result.success,false);assert.match(result.message,/Code 39/);assert.equal(f.writes.length,0);
    assert.equal(f.rows.get('branch-a')[0].barcode,null);
    const create=fixture();const input=new FormData();for(const[k,v]of Object.entries({name:'Product',sku:'SKU1',barcode:value,locationId:'branch-a'}))input.set(k,v);
    const created=await create.api.createProduct({},input);
    assert.equal(created.success,false);assert.match(created.message,/Code 39/);assert.equal(create.writes.length,0);
  }
  for(const value of ['0000009','A B']) {
    const f=fixture({legacyBarcode:null});const saved=await f.api.updateProductGroup({},f.form(value));
    assert.equal(saved.success,true,saved.message);assert.equal(f.rows.get('branch-a')[0].barcode,value);
  }
});

test('unchanged padded and whitespace-only legacy barcodes survive unrelated edits without being trimmed', async () => {
  for(const value of [' SKU1 ','   ']) {
    const f=fixture({legacyBarcode:value});const result=await f.api.updateProductGroup({},f.form(value));
    assert.equal(result.success,true,result.message);assert.equal(f.rows.get('branch-a')[0].barcode,value);
    assert.match(barcode.validateCode39(value),/POS lookup/);assert.throws(()=>barcode.code39BarsExact(value),/POS lookup/);
  }
});

test('scanner fixtures are accepted by the actual POS scan callback, retaining leading zeros and interior spaces', () => {
  const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
  const source=fs.readFileSync(path.resolve(__dirname,'../app/(dashboard)/dashboard/pos/pos-client.tsx'),'utf8');
  const ast=ts.createSourceFile('pos-client.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let callback;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='scan')callback=node.getText(ast);ts.forEachChild(node,visit);}visit(ast);
  assert.ok(callback,'Actual POS scan callback must exist');
  const compiled=ts.transpileModule(callback,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
  for(const value of ['0000123456789','A.B $/+%-','A B','A  B']) {
    const encoded=barcode.code39BarsExact(value),bits=new BitArray(encoded.width+80);
    for(const bar of encoded.bars)for(let x=bar.x+40;x<bar.x+40+bar.width;x++)bits.set(x);
    const decoded=new Code39Reader().decodeRow(0,bits,null).getText();assert.equal(decoded,value);
    let adds=0;
    const scan=new Function('data','addProduct','chooseProduct','changeFilter','setNotice',compiled+'\nreturn scan;')({products:[{id:'product',barcode:value,sku:'OTHER-SKU',product_type:'standard'}]},()=>{adds++;return true;},()=>{},()=>{},()=>{});
    assert.equal(scan(decoded),true);assert.equal(adds,1);
  }
  for(const value of [' SKU1 ','   '])assert.match(barcode.validateCode39(value),/POS lookup/);
});
test('invalid selected labels disable every print entry and never prepare or print, including a mixed selection', async () => {
  for(const invalid of ['bad_code',' SKU1 ','   ']) {
  let cursor=0, preparations=0;const states=[];
  const react={useState:initial=>{const k=cursor++;if(!(k in states))states[k]=k===0?['valid','legacy']:initial;return[states[k],value=>{states[k]=value;}];},useMemo:fn=>fn(),useRef:value=>({current:value}),useEffect:()=>{}};
  const Client=loadTs('app/(dashboard)/dashboard/barcodes/barcode-labels-client.tsx',{...labelDeps,react,'@/lib/printing/prepare-print':{preparePrint:()=>{preparations++;throw Error('must not prepare');}}}).default;
  const props={products:[{id:'valid',name:'Good',barcode:'000123',sku:'GOOD',selling_price:1},{id:'legacy',name:'Legacy',barcode:invalid,sku:'BAD',selling_price:1}],categories:[],settings:{},businessName:'Fixture'};
  const tree=Client(props);const buttons=nodes(tree).filter(node=>node.type==='button'&&node.props.onClick?.constructor.name==='AsyncFunction');
  assert.equal(buttons.length,4);for(const button of buttons){assert.equal(button.props.disabled,true);await button.props.onClick();}
  assert.equal(preparations,0);assert.ok(states.some(value=>typeof value==='string'&&value.includes('Printing blocked')));
  assert.ok(nodes(tree).find(node=>node.props?.id==='barcode-print-area').props.children===false);
  }
});

test('variant create serializer and action preserve raw barcode input until validation rejects padding', async () => {
  for(const value of [' SKU1 ','   ']) {
    const f=fixture();
    const react={useState:initial=>{let state=typeof initial==='function'?initial():initial;if(Array.isArray(state)&&state[0]?.id==='initial-variant')state=[{...state[0],size:'M',color:'Black',sku:'SKU1',barcode:value}];return[state,()=>{}];},useActionState:()=>[{success:false,message:''},()=>{},false],useEffect(){},useMemo:fn=>fn(),useRef:value=>({current:value})};
    const Component=loadTs('app/(dashboard)/dashboard/products/variant-product-form.tsx',{
      '@/components/providers/language-provider':{useLanguage:()=>({language:'en',t:text=>text})},
      '@/lib/i18n/translations':loadTs('lib/i18n/translations.ts'),
      react,'react/jsx-runtime':require('react/jsx-runtime'),'lucide-react':require('lucide-react'),sonner:{toast:{error(){},success(){}}},
      '@/components/product-gallery-input':{default:()=>null},'@/lib/barcode/generate':{generateInternalBarcode:()=> 'GENERATED'},'./actions':f.api,
    }).default;
    const tree=Component({categories:[],branches:[{id:'branch-a',name:'A'}]});
    const variants=nodes(tree).find(node=>node.type==='input'&&node.props.name==='variants').props.value;
    assert.equal(JSON.parse(variants)[0].barcode,value);
    const form=new FormData();form.set('name','Product');form.set('locationId','branch-a');form.set('variants',variants);
    const result=await f.api.createVariantProduct({},form);
    assert.equal(result.success,false);assert.match(result.message,/POS lookup/);assert.equal(f.writes.length,0);
  }
});

test('actual edit submission sends padding unchanged and the action rejects it instead of silently trimming', async () => {
  const value=' SKU1 ',f=fixture();let submitted;
  for(const rows of f.rows.values())Object.assign(rows[0],{product_type:'variant',variant_group_id:'style',size:'M',color:'Black'});
  const react={Fragment:React.Fragment,useState:initial=>{let state=typeof initial==='function'?initial():initial;if(state&&typeof state==='object'&&'variants' in state&&'name' in state)state={...state,name:'Renamed',variants:state.variants.map(row=>({...row,barcode:value}))};return[state,()=>{}];},useEffect(){},useId:()=> 'fixture',useMemo:fn=>fn(),useRef:value=>({current:value})};
  const Component=loadTs('app/(dashboard)/dashboard/products/[id]/edit/edit-product-client.tsx',{
    '@/components/providers/language-provider':{useLanguage:()=>({language:'en',t:text=>text})},
    '@/lib/i18n/translations':loadTs('lib/i18n/translations.ts'),
    react,'react/jsx-runtime':require('react/jsx-runtime'),'lucide-react':require('lucide-react'),sonner:{toast:{error(){},success(){}}},
    'next/link':{default:'a'},'next/navigation':{useRouter:()=>({refresh(){},push(){},replace(){}})},
    '@/components/anchored-action-menu':{default:()=>null},'@/components/product-gallery-input':{default:()=>null},'@/lib/barcode/generate':{generateInternalBarcode:()=> 'GENERATED'},
    '@/lib/products/variant-editor':loadTs('lib/products/variant-editor.ts'),'@/lib/images/shrink-photo':{shrinkPhoto:async file=>file,uploadBytes:()=>0,MAX_SAVE_UPLOAD_BYTES:15*1024*1024},'@/lib/inventory/stock-adjustment':{stockAdjustmentLink:()=> ''},
    '../../actions':{...f.api,updateProductGroup:async(_,form)=>{submitted=form;return f.api.updateProductGroup({},form);}},
  }).default;
  const tree=Component({product:{id:'p1',name:'Product',categoryId:null,description:'',barcode:'VALID',imageUrl:null,images:[],galleryUrls:[],productType:'variant',variantGroupId:'style',isActive:true,isOnline:false},initialVariants:[{id:'p1',size:'M',color:'Black',sku:'SKU1',barcode:'VALID',costPrice:'2',sellingPrice:'5',stockQuantity:'3',lowStockQuantity:'1',isActive:true,imageUrl:null,variantImageUrl:null,imageSlot:null,expectedUpdatedAt:'version'}],categories:[],branchId:'branch-a'});
  const RealFormData=global.FormData;
  global.FormData=class extends RealFormData{constructor(){super();}};
  try{await nodes(tree).find(node=>node.type==='form').props.onSubmit({preventDefault(){},currentTarget:{}});}finally{global.FormData=RealFormData;}
  assert.ok(submitted);assert.equal(JSON.parse(submitted.get('variants'))[0].barcode,value);
  assert.equal(f.writes.length,0);assert.equal(f.rows.get('branch-a')[0].barcode,'0000123456789');
});
