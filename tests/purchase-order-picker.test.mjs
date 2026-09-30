import test from 'node:test';
import assert from 'node:assert/strict';
import * as jsx from 'react/jsx-runtime';
import * as icons from 'lucide-react';
import {loadTs} from './helpers/load-ts.cjs';

function find(node, predicate) {
  if (!node || typeof node !== 'object') return;
  if (predicate(node)) return node;
  for (const child of [node.props?.children,node.props?.actions].flat(Infinity)) { const result=find(child,predicate);if(result)return result; }
}

test('promotion picker adds PO variants once and preserves edited quantities and costs', () => {
  const state=[];let cursor=0;
  const Picker=()=>null;
  const Form=loadTs('app/(dashboard)/dashboard/purchase-orders/new/purchase-order-form.tsx',{
    'react/jsx-runtime':jsx,'next/link':()=>null,'lucide-react':icons,
    'next/navigation':{useRouter:()=>({push(){}})},'react-dom':{useFormStatus:()=>({pending:false})},sonner:{toast:{success(){}}},
    react:{useMemo:fn=>fn(),useRef:()=>({current:null}),useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value;}];}},
    '../actions':{createPurchaseOrder(){}},'@/components/product-picker':{default:Picker},
  }).default;
  const products=[{id:'small',name:'Shirt',sku:'S',size:'S',color:'Blue',cost_price:5,variant_image_url:'blue.jpg'}, {id:'large',name:'Shirt',sku:'L',size:'L',color:'Blue',cost_price:6,image_url:'shirt.jpg'}];
  const render=()=>{cursor=0;return Form({suppliers:[],products});};
  const picker=tree=>find(tree,node=>node.type===Picker);
  const payload=tree=>JSON.parse(find(tree,node=>node.props?.name==='items').props.value);
  let tree=render();
  assert.equal(picker(tree),undefined,'picker stays closed until requested');
  find(tree,node=>node.props?.['aria-expanded']===false).props.onClick();tree=render();
  assert.equal(picker(tree).props.products[0].image,'blue.jpg');
  assert.equal(picker(tree).props.products[0].variant,'S / Blue');
  picker(tree).props.onChange(['small','large','small']);tree=render();
  assert.equal(payload(tree).length,2);
  find(tree,node=>node.type==='input'&&node.props.min===1).props.onChange({target:{value:'4'}});
  find(tree,node=>node.type==='input'&&node.props.min===0).props.onChange({target:{value:'7.50'}});
  tree=render();const edited=payload(tree)[0];
  picker(tree).props.onChange(['small']);tree=render();
  assert.deepEqual(payload(tree),[edited]);
  picker(tree).props.onChange(['small','large']);tree=render();
  assert.deepEqual(payload(tree)[0],edited);
  find(tree,node=>node.props?.['aria-label']==='Remove purchase order item').props.onClick();tree=render();
  assert.deepEqual(picker(tree).props.value,['large']);
  picker(tree).props.onChange([]);assert.deepEqual(payload(render()),[]);
});
