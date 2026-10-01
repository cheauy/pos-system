import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loadTs} from './helpers/load-ts.cjs';
const require=createRequire(import.meta.url);
const money=loadTs('lib/currency-format.ts');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup({currencyFailure=false,taxFailure=false}={}){
 const state=[],refs=[],calls=[];let cursor=0,refCursor=0;
 const Component=loadTs('app/(dashboard)/dashboard/pos/pos-currency-settings.tsx',{
  react:{useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;}];},useRef:initial=>{const i=refCursor++;return refs[i]??(refs[i]={current:initial});}},
  'react/jsx-runtime':require('react/jsx-runtime'),'lucide-react':require('lucide-react'),
  '@/lib/currency-format':money,'@/lib/pos/tax-rate':loadTs('lib/pos/tax-rate.ts'),
  '../settings/pos-currency/currency-settings.module.css':{default:{}},
  './pos-workspace-actions':{savePaymentOptions:async(...args)=>{calls.push(['payments',...args]);return {success:true};},saveStoreCurrencySettings:async(...args)=>{calls.push(['currency',...args]);return currencyFailure?{success:false,message:'Currency rejected'}:{success:true};}},
  '../settings/pos-currency/tax-actions':{saveTaxRate:async(...args)=>{calls.push(['tax',...args]);if(taxFailure)throw Error('Tax rejected');}},
 }).PosCurrencySettings;
 const walk=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(walk):[node,...walk(node.props?.children)];
 const render=()=>{cursor=0;refCursor=0;return walk(Component({businessId:'business',branchId:'branch',settings:{currency:'USD',usdKhrRate:4000,taxRate:5}}));};
 const input=(name,value)=>render().find(n=>n.props?.['aria-label']===name).props.onChange({target:{value}});
 const button=label=>render().find(n=>n.type==='button'&&(n.props.children===label||n.props.children?.includes?.(label)));
 const submit=()=>render()[0].props.onSubmit({preventDefault(){}});
 return {render,input,button,submit,calls};
}
test('reset and cancel are local; save applies currency and branch tax with duplicate-submit protection',async()=>{
 const app=setup();app.button('Reset to defaults').props.onClick();assert.equal(app.calls.length,0);
 app.button('Cancel').props.onClick();assert.equal(app.render().find(n=>n.props?.['aria-label']==='Tax percentage').props.value,'5');
 app.input('Exchange rate','4100');app.input('Tax percentage','10');app.submit();app.submit();await tick();
 assert.equal(app.calls.length,2);assert.deepEqual(app.calls[0].slice(0,4),['currency','business','USD',4100]);assert.equal(app.calls[0][5],'branch');
 assert.deepEqual(app.calls[1],['tax','business','branch',10]);assert.ok(app.render().some(n=>n.props?.role==='status'));
});
test('invalid drafts never save; currency rejection stops tax and a tax failure reports partial success',async()=>{
 const invalid=setup();invalid.input('Tax percentage','101');invalid.submit();await tick();assert.equal(invalid.calls.length,0);
 const rejected=setup({currencyFailure:true});rejected.input('Exchange rate','4100');rejected.input('Tax percentage','10');rejected.submit();await tick();assert.equal(rejected.calls.length,1);assert.ok(rejected.render().some(n=>n.props?.role==='alert'&&n.props.children==='Currency rejected'));
 const partial=setup({taxFailure:true});partial.input('Exchange rate','4100');partial.input('Tax percentage','10');partial.submit();await tick();assert.ok(partial.render().some(n=>n.props?.role==='alert'&&n.props.children.includes('Currency settings saved, but tax was not confirmed')));
 partial.button('Cancel').props.onClick();assert.equal(partial.render().find(n=>n.props?.['aria-label']==='Exchange rate').props.value,'4100');assert.equal(partial.render().find(n=>n.props?.['aria-label']==='Tax percentage').props.value,'5');
});

test('payment switches remain draft until Save and save both options once',async()=>{
 const app=setup();
 const split=app.render().find(n=>n.props?.['aria-label']==='Split payment');
 assert.equal(split.props.checked,true);
 split.props.onChange({target:{checked:false}});
 assert.equal(app.calls.length,0);
 app.button('Cancel').props.onClick();
 assert.equal(app.render().find(n=>n.props?.['aria-label']==='Split payment').props.checked,true);
 app.render().find(n=>n.props?.['aria-label']==='Split payment').props.onChange({target:{checked:false}});
 app.submit();app.submit();await tick();
 assert.deepEqual(app.calls,[['payments','business','branch',false,true]]);
});
