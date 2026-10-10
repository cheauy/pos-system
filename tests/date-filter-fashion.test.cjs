/* eslint-disable @typescript-eslint/no-require-imports -- Actual TS source with isolated service doubles. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const dates = loadTs('lib/date-range.ts');

test('calendar presets use Monday weeks, calendar boundaries and leap days', () => {
  assert.deepEqual(dates.calendarRange('Yesterday', '2024-03-01'), {from:'2024-02-29',to:'2024-02-29'});
  assert.deepEqual(dates.calendarRange('This Week', '2026-01-04'), {from:'2025-12-29',to:'2026-01-04'});
  assert.deepEqual(dates.calendarRange('This Month', '2026-10-10'), {from:'2026-10-01',to:'2026-10-10'});
  assert.deepEqual(dates.calendarRange('This Year', '2026-10-10'), {from:'2026-01-01',to:'2026-10-10'});
  assert.deepEqual(dates.calendarRange('Today', '2026-10-10'), {from:'2026-10-10',to:'2026-10-10'});
  assert.equal(dates.dateRangeError('2024-01-01', '2024-12-31', 365), '');
  assert.ok(dates.dateRangeError('2026-10-10', '2026-10-09'));
});

test('custom date filtering preserves inclusive day boundaries and Cambodia timezone', () => {
  assert.equal(dates.inCalendarDateRange('2026-10-09T17:00:00Z','2026-10-10','2026-10-10','+07:00'),true);
  assert.equal(dates.inCalendarDateRange('2026-10-09T16:59:59.999Z','2026-10-10','2026-10-10','+07:00'),false);
  assert.equal(dates.inCalendarDateRange('2026-10-10T16:59:59.999Z','2026-10-10','2026-10-10','+07:00'),true);
  assert.equal(dates.inCalendarDateRange('2026-10-10T17:00:00Z','2026-10-10','2026-10-10','+07:00'),false);
  assert.equal(dates.inCalendarDateRange('invalid','2026-10-10','2026-10-10'),false);
  assert.equal(dates.inCalendarDateRange('2026-10-10T12:00:00Z','',''),true);
});

function fixture(file, extra = {}, exportName = 'default') {
  let cursor = 0;
  const slots = [];
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], next => {slots[index] = typeof next === 'function' ? next(slots[index]) : next;}]; },
    useRef(value) { const index = cursor++; return slots[index] ??= {current:value}; },
    useEffect() {}, useMemo(fn) {return fn();}, useActionState(_action, state) {return [state,()=>{},false];},
    createContext(value) {return {value};}, useContext(context) {return context.value;}, useTransition() {return [false,fn=>fn()];},
  };
  const jsx = {jsx:(type,props)=>({type,props}), jsxs:(type,props)=>({type,props})};
  const dependencies = {
    react:hooks, 'react/jsx-runtime':jsx,
    '@/components/providers/language-provider':{useLanguage:()=>({t:value=>value})},
    ...extra,
  };
  const component = loadTs(file,dependencies)[exportName];
  return {render(props) {cursor=0; return component(props);}};
}
function elements(node, predicate, found = []) {
  if (Array.isArray(node)) node.forEach(value=>elements(value,predicate,found));
  else if (node?.props) { if (predicate(node)) found.push(node); elements(node.props.children,predicate,found); }
  return found;
}
const buttons = tree => elements(tree,node=>node.type==='button');
const label = button => button.props.children;

test('server date Apply keeps the branch and uses existing custom range navigation without scrolling', () => {
  const calls=[];
  const f=fixture('components/date-range-filter.tsx', {'next/navigation':{useRouter:()=>({push:(...args)=>calls.push(args)})},'@/lib/date-range':dates,'./date-range-filter.module.css':{default:{}}},'NavigationDateRange');
  const tree=f.render({path:'/dashboard/staff-report',query:{branch:'branch-1'},from:'2026-10-01',to:'2026-10-10'});
  tree.props.onApply('2026-10-05','2026-10-10');
  assert.deepEqual(calls,[['/dashboard/staff-report?branch=branch-1&range=custom&from=2026-10-05&to=2026-10-10',{scroll:false}]]);
});

test('new Khmer labels preserve technical size labels and count placeholders', () => {
  const translations=loadTs('lib/i18n/translations.ts');
  for (const text of ['Select sizes first, then click Add.','Size presets','Selected sizes','Add {0} sizes','Women 24 – 32','Men 28 – 38']) assert.notEqual(translations.translateUiText(text,'km'),text);
  assert.equal(translations.formatUiText(translations.translateUiText('Add {0} sizes','km'),[2]),'បន្ថែម 2 ទំហំ');
  assert.equal(translations.translateUiText('XS – XXL','km'),'XS – XXL');
});

test('date draft does not apply until Apply; invalid dates stay unapplied; presets apply once', () => {
  const calls=[];
  const f=fixture('components/date-range-filter.tsx', {'next/navigation':{useRouter:()=>({})},'@/lib/date-range':dates,'./date-range-filter.module.css':{default:{}}});
  const props={from:'2026-10-01',to:'2026-10-10',today:'2026-10-10',onApply:(...args)=>calls.push(args)};
  let tree=f.render(props);
  elements(tree,node=>node.type==='input')[0].props.onChange({target:{value:'2026-10-05'}});
  assert.equal(calls.length,0);
  tree=f.render(props); buttons(tree).find(button=>label(button)==='Apply').props.onClick();
  assert.deepEqual(calls,[['2026-10-05','2026-10-10']]);
  tree=f.render(props); elements(tree,node=>node.type==='input')[0].props.onChange({target:{value:'2026-10-20'}});
  tree=f.render(props); assert.equal(buttons(tree).find(button=>label(button)==='Apply').props.disabled,true);
  buttons(tree).find(button=>label(button)==='Apply').props.onClick(); assert.equal(calls.length,1);
  buttons(tree).find(button=>label(button)==='Yesterday').props.onClick();
  assert.deepEqual(calls[1],['2026-10-09','2026-10-09']);
});

test('fashion chips and presets do not create variants until Add; prices, stock, SKU and deduplication survive', () => {
  const f=fixture('app/(dashboard)/dashboard/products/variant-product-form.tsx', {
    '@/lib/i18n/translations':{formatUiText:(value,args)=>value.replace(/\{(\d+)\}/g,(_,index)=>args[index])},
    'lucide-react':{}, sonner:{toast:{}}, '@/components/product-gallery-input':{}, './quick-fashion.module.css':{default:{desktop:'desktop',legacy:'legacy'}},
    '@/lib/barcode/generate':{}, './actions':{createVariantProduct:()=>{}},
  });
  const props={categories:[],businessType:'fashion'};
  let tree=f.render(props);
  const payload=tree=>JSON.parse(elements(tree,node=>node.type==='input'&&node.props.name==='variants')[0].props.value);
  assert.equal(payload(tree).length,1);
  const fields=elements(tree,node=>node.type?.name==='MiniField');
  for (const [name,value] of [['Colour','Blue'],['SKU prefix','TEE01'],['Cost price','1.25'],['Selling price','3.75'],['Initial stock per size','8']]) fields.find(field=>field.props.label===name).props.onChange(value);
  tree=f.render(props);
  buttons(tree).find(button=>label(button)==='S').props.onClick();
  tree=f.render(props); buttons(tree).find(button=>label(button)==='M').props.onClick();
  tree=f.render(props); assert.deepEqual(payload(tree)[0].size,'');
  buttons(tree).find(button=>label(button)==='Add 2 sizes').props.onClick();
  tree=f.render(props);
  assert.deepEqual(payload(tree).map(row=>[row.size,row.color,row.sku,row.costPrice,row.sellingPrice,row.stockQuantity]),[['S','Blue','TEE01-BLUE-S',1.25,3.75,8],['M','Blue','TEE01-BLUE-M',1.25,3.75,8]]);
  buttons(tree).find(button=>label(button)==='S').props.onClick();
  tree=f.render(props); buttons(tree).find(button=>label(button)==='Add 1 sizes').props.onClick();
  tree=f.render(props); assert.equal(payload(tree).length,2);
  buttons(tree).find(button=>label(button)==='XS').props.onClick();
  tree=f.render(props); buttons(tree).find(button=>button.props.role==='tab'&&button.props.id==='fashion-size-preset-1').props.onClick();
  tree=f.render(props); assert.equal(buttons(tree).find(button=>label(button)==='Add 0 sizes').props.disabled,true);
  assert.equal(payload(tree).length,2);
});
