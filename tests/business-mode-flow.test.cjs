/* Actual TS components with disposable hook/service doubles; no browser or database calls. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { loadTs } = require('./helpers/load-ts.cjs');
const variants = loadTs('lib/products/variant-editor.ts');
const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'fragment' };
const formatUiText = (text, args) => text.replace(/\{(\d+)\}/g, (_, i) => args[i]);
function nodes(node) {
 if (!node || typeof node !== 'object') return [];
 if (Array.isArray(node)) return node.flatMap(nodes);
 return [node, ...nodes(node.props?.children)];
}
function text(node) {
 if (node == null || typeof node === 'boolean') return '';
 if (typeof node !== 'object') return String(node);
 return Array.isArray(node) ? node.map(text).join('') : text(node.props?.children);
}
function fixture(file, extra = {}, name = 'default') {
 let cursor=0, effects=[]; const states=[];
 const react = {
  Fragment:'fragment', useId:()=> 'dialog',
  useState(initial) {const id=cursor++;if (!(id in states)) states[id]=typeof initial==='function'?initial():initial;return [states[id],next=>{states[id]=typeof next==='function'?next(states[id]):next;}];},
  useRef(initial) {const id=cursor++;return states[id]??= {current:initial};},
  useMemo:fn=>fn(),useCallback:fn=>fn,useEffect:fn=>effects.push(fn),
  useActionState:(_action,state)=>[state,()=>{},false],startTransition:fn=>fn(),
 };
 const component=loadTs(file,{react,'react/jsx-runtime':jsx,'lucide-react':{},
  '@/components/providers/language-provider':{useLanguage:()=>({t:value=>value})},
  '@/lib/i18n/translations':{formatUiText},...extra})[name];
 return {render(props){cursor=0;effects=[];return component(props);},effects:()=>effects,
  invoke(component,props){cursor=states.length;return component(props);}};
}
const buttons=tree=>nodes(tree).filter(node=>node.type==='button');
const payload=tree=>JSON.parse(nodes(tree).find(node=>node.type==='input'&&node.props.name==='variants').props.value);
function variantForm() {
 return fixture('app/(dashboard)/dashboard/products/variant-product-form.tsx',{
  sonner:{toast:{error(){},success(){}}},'@/components/product-gallery-input':{},
  './quick-fashion.module.css':{default:{desktop:'desktop',legacy:'legacy'}},
  '@/components/anchored-action-menu':{},'./fashion-responsive.module.css':{default:{fashion:'fashion',tabs:'tabs',formBody:'form-body'}},
  '@/lib/barcode/generate':{},'./actions':{createVariantProduct:()=>{}},
 });
}
for(const width of [390,768,1024,1440])for(const mode of ['fashion','shoes']) {
 test(mode+' shares responsive state at mocked width '+width+' and adds only selected mode sizes',()=>{
  const previous=global.window;
  global.window={matchMedia:query=>({matches:query.includes('1279')?width<=1279:width<=767,addEventListener(){},removeEventListener(){}})};
  try {
   const f=variantForm(),props={categories:[],branches:[{id:'b',name:'Branch'}],businessType:mode};
   let tree=f.render(props);for(const effect of f.effects())effect();tree=f.render(props);
   assert.ok(tree.props.className.includes('fashion'));
   assert.equal(typeof tree.props.onSubmit,width<=1279?'function':'undefined');
   assert.equal(buttons(tree).filter(button=>button.props.id?.startsWith('fashion-tab-')).length,3);
   const expected=mode==='shoes'?['EU 35–41','EU 39–46','EU 36–45']:['XS – XXL','Women 24 – 32','Men 28 – 38'];
   assert.deepEqual(buttons(tree).filter(button=>button.props.id?.startsWith('fashion-size-preset-')).map(text),expected);
   const fields=nodes(tree).filter(node=>node.type?.name==='MiniField');
   for(const [label,value]of [['Colour','Blue'],['SKU prefix','ITEM'],['Cost price','1.25'],['Selling price','3.75'],['Initial stock per size','8']])fields.find(field=>field.props.label===label).props.onChange(value);
   const sizes=mode==='shoes'?['36','38']:['S','M'];
   for(const size of sizes){tree=f.render(props);buttons(tree).find(button=>button.props['aria-pressed']!==undefined&&text(button)===size).props.onClick();}
   tree=f.render(props);assert.equal(payload(tree).length,1);assert.equal(payload(tree)[0].size,'');
   buttons(tree).find(button=>text(button)==='Add 2 sizes').props.onClick();tree=f.render(props);
   assert.deepEqual(payload(tree).map(row=>[row.size,row.color,row.sku,row.costPrice,row.sellingPrice,row.stockQuantity]),sizes.map(size=>[size,'Blue','ITEM-BLUE-'+size,1.25,3.75,8]));
   buttons(tree).find(button=>button.props['aria-pressed']!==undefined&&text(button)===sizes[0]).props.onClick();
   tree=f.render(props);buttons(tree).find(button=>text(button)==='Add 1 sizes').props.onClick();tree=f.render(props);assert.equal(payload(tree).length,2);
   buttons(tree).find(button=>button.props.id==='fashion-size-preset-1').props.onClick();tree=f.render(props);
   assert.equal(buttons(tree).find(button=>text(button)==='Add 0 sizes').props.disabled,true);
  } finally {global.window=previous;}
 });
}
test('General variant creation has no Fashion tabs or size run',()=>{
 const tree=variantForm().render({categories:[],businessType:'general'});
 assert.ok(!tree.props.className.includes('fashion'));assert.equal(buttons(tree).filter(button=>button.props.role==='tab').length,0);
 assert.ok(!text(tree).includes('Quick fashion size run'));assert.ok(!text(tree).includes('Quick shoe size run'));
});
for(const mode of ['fashion','shoes','general','grocery','milk_tea'])test(mode+' uses the correct Add Product shell and engine',()=>{
 let dynamicIndex=0;
 const f=fixture('app/(dashboard)/dashboard/products/add-product-modal.tsx',{
  'next/navigation':{useRouter:()=>({refresh(){}})},'next/dynamic':{default:()=>['configurable','standard','variant'][dynamicIndex++]},
  '@/components/ui/content-skeleton':{},'./fashion-responsive.module.css':{default:{overlay:'shared-overlay',modal:'shared-modal',modalBody:'shared-body'}},
  '@/lib/business/product-experience':loadTs('lib/business/product-experience.ts'),
 });
 const engine=['fashion','shoes'].includes(mode)?'variant':mode==='milk_tea'?'configurable':'standard';
 const props={categories:[],branches:[],businessType:mode,productMode:engine};
 buttons(f.render(props)).find(button=>text(button)==='Add Product').props.onClick();let tree=f.render(props);
 const dialog=nodes(tree).find(node=>node.props?.role==='dialog');
 assert.equal(dialog.props.className.includes('shared-overlay'),['fashion','shoes'].includes(mode));
 assert.equal(nodes(tree).filter(node=>node.type===engine).length,1);
 if(mode==='general') {buttons(tree).find(button=>text(button)==='Product with variants').props.onClick();tree=f.render(props);assert.equal(nodes(tree).filter(node=>node.type==='variant').length,1);}
 if(mode==='grocery') assert.ok(!text(tree).includes('Product with variants'));
});
const product={id:'v1',name:'Item',categoryId:null,description:'',barcode:'',imageUrl:null,images:[],galleryUrls:[],productType:'variant',variantGroupId:'group',isActive:true,isOnline:true};
const row={id:'v1',size:'',color:'',sku:'ITEM-1',costPrice:'1',sellingPrice:'2',stockQuantity:'3',lowStockQuantity:'1',isActive:true,imageUrl:null,variantImageUrl:null,imageSlot:null};
function editor() {
 return fixture('app/(dashboard)/dashboard/products/[id]/edit/edit-product-client.tsx',{
  'next/link':{default:'a'},'next/navigation':{useRouter:()=>({})},sonner:{toast:{info(){},error(){}}},
  '@/components/anchored-action-menu':{default:'action-menu'},'@/components/product-gallery-input':{default:'gallery'},
  '@/lib/barcode/generate':{},'@/lib/images/shrink-photo':{},'@/lib/products/variant-editor':variants,
  '@/lib/inventory/stock-adjustment':{},'../../actions':{},
 });
}
for(const mode of ['general','grocery','fashion','shoes'])test(mode+' editor has appropriate fields, copy, presets and validation',()=>{
 const f=editor(),retail=['general','grocery'].includes(mode),initial=retail?row:{...row,size:mode==='shoes'?'38':'M',color:'Black'};
 const props={product:mode==='grocery'?{...product,productType:'standard',variantGroupId:null}:product,initialVariants:[initial],categories:[],businessType:mode,branchId:'branch',canCreateVariants:true};
 let tree=f.render(props);const all=nodes(tree);
 assert.equal(all.some(node=>node.type==='summary'&&text(node).includes('Quick size run')), !retail);
 const fields=all.filter(node=>node.type?.name==='MobileField');
 assert.equal(fields.some(node=>node.props.label==='Size'),!retail);
 assert.equal(fields.some(node=>node.props.label==='Size / option (optional)'),mode==='general');
 assert.equal(all.some(node=>node.type==='th'&&text(node)==='Size'),!retail);
 assert.equal(all.some(node=>node.type==='th'&&text(node)==='Size / option (optional)'),mode==='general');
 if(retail){assert.ok(!text(tree).includes('New / unassigned colour'));assert.ok(!text(tree).includes('Edit sizes, colours and prices'));assert.equal(all.filter(node=>node.props?.role==='status').length,0);}
 if(mode==='grocery'){assert.ok(!fields.some(node=>node.props.label==='Colour'));assert.ok(!buttons(tree).some(button=>text(button).includes('Add Variant')));}
 if(mode==='general') {
  buttons(tree).find(button=>text(button).includes('Add Variant')).props.onClick();tree=f.render(props);
  const cells=nodes(tree).filter(node=>node.type?.name==='Cell'&&node.props.label.startsWith('SKU '));
  cells.find(node=>node.props.value==='').props.onChange('ITEM-2');tree=f.render(props);
  assert.equal(nodes(tree).filter(node=>node.props?.role==='status').length,0,'new SKU-only General variant is valid');
  assert.equal(buttons(tree).find(button=>button.props.type==='submit').props.disabled,false);
  nodes(tree).find(node=>node.type?.name==='Cell'&&node.props.value==='ITEM-2'&&node.props.label.startsWith('SKU ')).props.onChange('ITEM-1');
  assert.ok(text(f.render(props)).includes('Duplicate SKU'));
 }
 if(mode==='fashion'){assert.ok(buttons(tree).some(button=>text(button)==='XS–XXL'));assert.ok(!buttons(tree).some(button=>text(button).startsWith('Shoes ')));}
 if(mode==='shoes'){assert.ok(!buttons(tree).some(button=>text(button)==='XS–XXL'));assert.ok(buttons(tree).some(button=>text(button)==='Shoes 35–40'));}
});
test('Grocery retains saved attributes for inherited products',()=>{
 const tree=editor().render({product:{...product,productType:'standard',variantGroupId:null},initialVariants:[{...row,size:'Pack 6',color:'Blue'}],categories:[],businessType:'grocery',branchId:'branch'});
 assert.ok(nodes(tree).some(node=>node.type?.name==='Cell'&&node.props.value==='Pack 6'));
 assert.ok(nodes(tree).some(node=>node.type?.name==='Cell'&&node.props.value==='Blue'));
});
const sizeCases=[[['XL','S','XXL','XS','L','M'],['XS','S','M','L','XL','XXL']],[['40','9','10','38.5','38'],['9','10','38','38.5','40']]];
test('actual POS filter expression shares apparel and numeric size order',()=>{
 const file=ts.createSourceFile('pos.tsx',fs.readFileSync('app/(dashboard)/dashboard/pos/pos-client.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let initializer;
 function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(file)==='sizes')initializer=node.initializer;ts.forEachChild(node,visit);}visit(file);assert.ok(initializer);
 const js=ts.transpileModule('const result = '+initializer.getText(file)+';', {compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
 const evaluate=new Function('data','useMemo','compareVariantSizes',js+'return result;');
 for(const [input,expected]of sizeCases)assert.deepEqual(evaluate({products:input.map(size=>({size}))},fn=>fn(),variants.compareVariantSizes),expected);
});
for(const [input,expected]of sizeCases)test('Edit, POS picker and storefront render the same size order '+expected.join(','),()=>{
 const initial=input.map((size,i)=>({...row,id:'v'+i,sku:'SKU-'+i,size,color:'Black'}));
 const editTree=editor().render({product,initialVariants:initial,categories:[],businessType:'fashion',branchId:'branch'});
 assert.deepEqual(nodes(editTree).filter(node=>node.type?.name==='MobileField'&&node.props.label==='Size').map(node=>node.props.children.props.value),expected);
 const f=fixture('app/(dashboard)/dashboard/pos/pos-workspace-flow.tsx',{
  '@/lib/products/variant-editor':variants,'./pos-workspace-helpers':{inventoryFor:()=>({unassigned:0}),stockFor:()=>3},
  './pos-currency-components':{},'./pos-customer-helpers':{},'./pos-currency':{},'./pos-workspace-components':{},'./pos-checkout-controls':{},'./pos-workspace.module.css':{default:{}},
 },'VariantPicker');
 const products=initial.map(item=>({...item,selling_price:2}));
 const tree=f.render({group:{name:'Item',variants:products},data:{products,branches:[],settings:{currency:'USD'}},branchId:'branch',lines:[]});
 assert.deepEqual(nodes(tree).filter(node=>node.type==='strong'&&input.includes(text(node))).map(text),expected);
 const shop=fixture('app/_sites/[slug]/storefront-shop.tsx',{
  '@/lib/products/variant-editor':variants,'./image-viewer':{},'@/lib/storefront/order-tracking':{},'./storefront-hero':{},
  './storefront-language':{useStorefrontLanguage:()=>({t:value=>value})},'@/lib/storefront/checkout-validation':{},
  sonner:{toast:{}},'./product-gallery':{},'./storefront-catalog':{},'@/lib/storefront/cart':{},
 });
 const catalog={key:'group',name:'Item',productType:'variant',variants:initial.map(item=>({...item,stockQuantity:3,sellingPrice:2})),optionGroups:[]};
 for(const mode of ['fashion','shoes']) {
  const shopTree=shop.render({brand:{},slug:'shop',categories:[],products:[catalog],settings:{businessType:mode,currency:'USD',orderingEnabled:false},tableToken:null,productKey:'group'});
  const child=nodes(shopTree).find(node=>node.type?.name==='ProductConfigurator');assert.ok(child);
  const detail=shop.invoke(child.type,child.props);
  assert.deepEqual(buttons(detail).filter(button=>input.includes(text(button))).map(text),expected);
 }
});
