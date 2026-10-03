import test from 'node:test';
import assert from 'node:assert/strict';
import * as jsxRuntime from 'react/jsx-runtime';
import helpers from './helpers/load-ts.cjs';
const {loadTs}=helpers;
const layout=loadTs('lib/receipts/shipping-layout.ts');
function nodes(root){if(!root||typeof root!=='object')return [];if(Array.isArray(root))return root.flatMap(nodes);return [root,...nodes(root.props?.children)];}
function harness(){
 let cursor=0,refCursor=0,closed=0,resolve,reject;const state=[],refs=[],calls=[];
 const pending=new Promise((yes,no)=>{resolve=yes;reject=no;});
 const react={useState(initial){const index=cursor++;if(!(index in state))state[index]=initial;return [state[index],next=>{state[index]=next;}];},useRef(initial){const index=refCursor++;return refs[index]??(refs[index]={current:initial});},useEffect(){}};
 const Designer=()=>null;
 const Editor=loadTs('app/(dashboard)/dashboard/settings/printers/shipping-template-editor.tsx',{'react/jsx-runtime':jsxRuntime,react,'./shipping-designer':{default:Designer},'@/lib/receipts/shipping-layout':layout,'@/lib/receipts/shipping-templates':{SHIPPING_LABEL_SIZES:[{id:'80x50',label:'80 x 50 mm'},{id:'100x100',label:'100 x 100 mm'}],shippingTemplateName:name=>name.trim()}}).default;
 const initial={id:'example',name:'Original',mode:'update',layout:layout.defaultShippingLayout('80x50')};
 const render=()=>{cursor=0;refCursor=0;return nodes(Editor({initial,values:{qrMinimumMm:'20.6'},onSave:async draft=>{calls.push(draft);await pending;},onClose:()=>closed++}));};
 const find=(tree,type,label)=>tree.find(node=>node.type===type&&(!label||node.props['aria-label']===label||node.props.children===label));
 return {initial,Designer,render,find,calls,resolve,reject,closed:()=>closed};
}
const settled=()=>new Promise(resolve=>setImmediate(resolve));

test('deferred save locks text/layout/size/name and closing synchronously before React rerenders',async()=>{
 const h=harness(),before=h.render(),save=h.find(before,'button','Save changes');save.props.onClick();
 h.find(before,'input','Template name').props.onChange({target:{value:'Late name'}});
 h.find(before,'select','Custom template label size').props.onChange({target:{value:'100x100'}});
 h.find(before,h.Designer).props.onChange({...h.initial.layout,elements:[]});
 h.find(before,'button','Cancel').props.onClick();h.find(before,'button','Close template editor').props.onClick();save.props.onClick();
 const locked=h.render();assert.equal(h.find(locked,'fieldset').props.inert,true);assert.equal(h.find(locked,'fieldset').props.disabled,true);
 assert.equal(h.find(locked,'input','Template name').props.value,'Original');assert.deepEqual(h.find(locked,h.Designer).props.layout,h.initial.layout);
 assert.equal(h.calls.length,1);assert.equal(h.closed(),0);h.resolve();await settled();assert.deepEqual(h.calls[0],h.initial);
});

test('saving captures input/paste/cut/drop/pointer/click/keyboard and guards dismiss actions',async()=>{
 const h=harness();h.find(h.render(),'button','Save changes').props.onClick();const tree=h.render(),dialog=tree.find(node=>node.props.role==='dialog');
 for(const name of ['onBeforeInputCapture','onInputCapture','onPasteCapture','onCutCapture','onDropCapture','onPointerDownCapture','onPointerMoveCapture','onClickCapture','onKeyDownCapture']){
  let prevented=false,stopped=false;dialog.props[name]({key:'Escape',preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});assert.ok(prevented&&stopped,name);
 }
 h.find(tree,'button','Cancel').props.onClick();h.find(tree,'button','Close template editor').props.onClick();tree[0].props.onPointerDown({target:tree[0],currentTarget:tree[0]});
 let tabPrevented=false;dialog.props.onKeyDown({key:'Tab',preventDefault(){tabPrevented=true;}});assert.equal(tabPrevented,true);
 assert.equal(h.closed(),0);assert.ok(tree.filter(node=>node.type==='button').every(node=>node.props.disabled));h.resolve();await settled();
});

test('failed deferred save unlocks and retains the draft for retry',async()=>{
 const h=harness();h.find(h.render(),'input','Template name').props.onChange({target:{value:'Unsaved name'}});
 h.find(h.render(),'button','Save changes').props.onClick();h.reject(Error('Storage failed'));await settled();const tree=h.render();
 assert.equal(h.find(tree,'fieldset').props.inert,false);assert.equal(h.find(tree,'input','Template name').props.value,'Unsaved name');assert.ok(tree.some(node=>node.props.role==='alert'&&node.props.children==='Storage failed'));
 h.find(tree,'input','Template name').props.onChange({target:{value:'Retry name'}});assert.equal(h.find(h.render(),'input','Template name').props.value,'Retry name');assert.equal(h.closed(),0);
});
