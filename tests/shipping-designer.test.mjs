import test from 'node:test';
import assert from 'node:assert/strict';
import * as jsxRuntime from 'react/jsx-runtime';
import helpers from './helpers/load-ts.cjs';
const {loadTs}=helpers,api=loadTs('lib/receipts/shipping-layout.ts');
const icons=new Proxy({}, {get:()=>()=>null});
function nodes(root){if(!root||typeof root!=='object')return [];if(Array.isArray(root))return root.flatMap(nodes);return [root,...nodes(root.props?.children),...nodes(root.props?.additionalTools)];}
function component(file,dependencies,props){
  let cursor=0,refCursor=0;const state=[],refs=[];
  const react={useState(initial){const at=cursor++;if(!(at in state))state[at]=typeof initial==='function'?initial():initial;return [state[at],next=>{state[at]=typeof next==='function'?next(state[at]):next;}];},useRef(initial){const at=refCursor++;return refs[at]??(refs[at]={current:initial});},useEffect(){},useCallback:fn=>fn};
  const Component=loadTs(file,{'react/jsx-runtime':jsxRuntime,react,'lucide-react':icons,'@/lib/receipts/shipping-layout':api,...dependencies}).default;
  return ()=>{cursor=0;refCursor=0;return nodes(Component(props));};
}
const find=(tree,label)=>{const node=tree.find(node=>node.props?.['aria-label']===label);assert.ok(node,label);return node;};
function designer(){
  const Rich=()=>null,Content=()=>null;
  const layout=api.defaultShippingLayout('80x50');layout.elements.push({...layout.elements[0],id:'text-a',field:'text',text:'Hello សួស្តី',x:5,y:84,width:90,height:10,fontSize:9});
  const props={layout,size:layout.size,values:{qrMinimumMm:'18.6'},onChange:next=>{props.layout=next;}};
  const render=component('app/(dashboard)/dashboard/settings/printers/shipping-designer.tsx',{'@/components/receipts/shipping-canvas':{ShippingElementContent:Content,shippingElementStyle:api.shippingElementStyle},'./shipping-rich-text':{default:Rich}},props);
  return {props,render,Rich,Content};
}
const event=(extra={})=>({preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},nativeEvent:{isComposing:false},...extra});

test('double-click and Enter open the custom editor on the canvas; dynamic fields stay protected',()=>{
  const h=designer();find(h.render(),'Move Custom text').props.onDoubleClick(event());
  const tree=h.render(),group=find(tree,'Move Custom text');assert.equal(group.props.role,'group');
  const host=nodes(group).find(node=>node.type==='div'&&typeof node.props.ref==='function'),target={};host.props.ref(target);
  assert.equal(h.render().find(node=>node.type===h.Rich).props.inlineTarget,target);
  group.props.onClick(event({ctrlKey:true}));assert.equal(find(h.render(),'Move Custom text').props.role,'group');
  const before=h.props.layout;group.props.onKeyDown(event({key:'ArrowRight',target:{isContentEditable:true}}));assert.equal(h.props.layout,before);
  h.render().find(node=>node.type===h.Rich).props.onFinish();assert.equal(find(h.render(),'Move Custom text').props.role,'button');
  find(h.render(),'Move Custom text').props.onKeyDown(event({key:'Enter',target:{isContentEditable:false}}));assert.equal(find(h.render(),'Move Custom text').props.role,'group');
  find(h.render(),'Move Shop name').props.onDoubleClick(event());const protectedField=h.render().find(node=>node.type===h.Rich);assert.equal(protectedField.props.item.field,'storeName');assert.equal(protectedField.props.inlineTarget,null);assert.equal(find(h.render(),'Move Shop name').props.role,'button');
});

test('Add field and text tools stay together without selection; formatting defaults apply to the next field',()=>{
  const h=designer();find(h.render(),'Label workspace').props.onClick(event({currentTarget:{focus(){}}}));
  let tree=h.render();const section=tree.find(node=>node.type==='section'&&nodes(node).some(child=>child.props?.['aria-label']==='Add field'));
  assert.ok(nodes(section).some(node=>node.type===h.Rich));assert.ok(nodes(section).some(node=>node.props?.['aria-label']==='Field font family'));
  assert.equal(tree.find(node=>node.type===h.Rich).props.toolsOnly,true);
  const before=structuredClone(h.props.layout);find(tree,'Field font family').props.onChange({target:{value:'khmer'}});
  h.render().find(node=>node.type===h.Rich).props.onChange({bold:true,fontSize:18,text:'',richText:[]});assert.deepEqual(h.props.layout,before);
  find(h.render(),'Add field').props.onClick();const added=h.props.layout.elements.at(-1);
  assert.equal(added.fontFamily,'khmer');assert.equal(added.bold,true);assert.equal(added.fontSize,18);assert.equal(added.text,'Your text');api.validateShippingLayout(h.props.layout,18.6);
  h.props.layout={...h.props.layout,elements:[]};tree=h.render();assert.equal(tree.find(node=>node.type===h.Rich).props.toolsOnly,true);assert.ok(find(tree,'Field font family'));
});

function clipboardEvent(data={},target={tagName:'DIV',isContentEditable:false}){
  const contents=new Map(Object.entries(data));return event({type:'copy',target,clipboardData:{getData:key=>contents.get(key)??'',setData:(key,value)=>contents.set(key,value)}});
}
test('clipboard copies styled fields with fresh IDs and pastes English/Khmer text onto the label',()=>{
  const h=designer();find(h.render(),'Field font family').props.onChange({target:{value:'khmer'}});
  const copied=clipboardEvent();h.render()[0].props.onCopy(copied);assert.equal(copied.prevented,true);assert.equal(copied.clipboardData.getData('text/plain'),'Hello សួស្តី');
  const source=h.props.layout.elements.at(-1),count=h.props.layout.elements.length;
  const paste={...copied,type:'paste',prevented:false};h.render()[0].props.onPaste(paste);
  const clone=h.props.layout.elements.at(-1);assert.equal(h.props.layout.elements.length,count+1);assert.notEqual(clone.id,source.id);assert.equal(clone.text,source.text);assert.equal(clone.fontFamily,'khmer');
  api.validateShippingLayout(h.props.layout,18.6);
  const external=clipboardEvent({'text/plain':'Copied English\r\nអត្ថបទខ្មែរ'});h.render()[0].props.onPaste(external);assert.equal(h.props.layout.elements.at(-1).text,'Copied English\nអត្ថបទខ្មែរ');
  for(const target of [{tagName:'SPAN',isContentEditable:true},{tagName:'INPUT',isContentEditable:false},{tagName:'TEXTAREA',isContentEditable:false}]){
    const native=clipboardEvent({'text/plain':'native text'},target),before=h.props.layout;
    h.render()[0].props.onCopy(native);h.render()[0].props.onPaste(native);assert.equal(native.prevented,undefined);assert.equal(h.props.layout,before);
  }
});
test('invalid or oversized pasted fields are rejected without changing the label',()=>{
  const h=designer(),before=h.props.layout;
  for(const data of [{'text/plain':'a'.repeat(301)},{'application/x-tenh-shipping-field':'{broken JSON'},{'application/x-tenh-shipping-field':JSON.stringify({...before,elements:[{...before.elements[0],fontFamily:'bad-font'}]})}]){
    h.render()[0].props.onPaste(clipboardEvent(data));assert.equal(h.props.layout,before);assert.ok(h.render().some(node=>node.props?.role==='alert'));
  }
});

test('Backspace/Delete remove selected fields while inputs, rich text and composition keep native deletion',()=>{
  for(const key of ['Backspace','Delete']){
    const h=designer(),count=h.props.layout.elements.length;
    const remove=event({key,target:{tagName:'DIV',isContentEditable:false}});h.render()[0].props.onKeyDown(remove);
    assert.equal(h.props.layout.elements.length,count-1);assert.ok(!h.props.layout.elements.some(element=>element.id==='text-a'));assert.ok(remove.prevented&&remove.stopped);
    for(const target of [{tagName:'SPAN',isContentEditable:true},{tagName:'INPUT',isContentEditable:false},{tagName:'TEXTAREA',isContentEditable:false},{tagName:'SELECT',isContentEditable:false}]){
      const native=designer(),before=native.props.layout,editing=event({key,target});native.render()[0].props.onKeyDown(editing);assert.equal(native.props.layout,before);assert.equal(editing.prevented,undefined);
    }
    const native=designer(),before=native.props.layout;native.render()[0].props.onKeyDown(event({key,target:{tagName:'DIV'},nativeEvent:{isComposing:true}}));assert.equal(native.props.layout,before);
  }
});

test('dynamic tag tools can add a custom field without selecting or replacing protected order data',()=>{
  const h=designer();find(h.render(),'Label workspace').props.onClick(event({currentTarget:{focus(){}}}));
  const before=structuredClone(h.props.layout);h.render().find(node=>node.type===h.Rich).props.onInsertTag('{Customer name}');
  const added=h.props.layout.elements.at(-1);assert.equal(added.field,'text');assert.equal(added.text,'{Customer name}');assert.deepEqual(h.props.layout.elements.slice(0,-1),before.elements);api.validateShippingLayout(h.props.layout,18.6);
});

test('inserting a tag preserves raw template text and supports undo, including justified text',()=>{
  let added='';const props={item:{...api.defaultShippingLayout().elements[0],field:'text',text:'Hello',bold:false},onChange:patch=>{props.item={...props.item,...patch};},onInsertTag:tag=>{added=tag;}};
  const render=component('app/(dashboard)/dashboard/settings/printers/shipping-rich-text.tsx',{'react-dom':{createPortal:()=>null},'@/lib/receipts/shipping-custom':{shippingRichTextMarkup:()=>''}},props);
  find(render(),'Insert dynamic tag').props.onChange({target:{value:'{Customer name}'}});assert.equal(props.item.text,'{Customer name}Hello');assert.equal(props.item.richText.map(run=>run.text).join(''),props.item.text);
  find(render(),'Undo text edit').props.onClick();assert.equal(props.item.text,'Hello');
  find(render(),'Align justify').props.onClick();assert.equal(props.item.justify,true);assert.equal(api.shippingElementStyle(props.item).textAlign,'justify');
  find(render(),'Align right').props.onClick();assert.equal(props.item.justify,false);assert.equal(props.item.align,'right');
  props.toolsOnly=true;find(render(),'Insert dynamic tag').props.onChange({target:{value:'{Order number}'}});assert.equal(added,'{Order number}');
});

test('text-only tools stay visible without opening a text box',()=>{
  const props={item:{...api.defaultShippingLayout().elements[0],field:'text',text:'',bold:false},toolsOnly:true,onChange:patch=>{props.item={...props.item,...patch};}};
  const render=component('app/(dashboard)/dashboard/settings/printers/shipping-rich-text.tsx',{'react-dom':{createPortal:()=>null},'@/lib/receipts/shipping-custom':{shippingRichTextMarkup:()=>''}},props);
  assert.ok(find(render(),'Bold'));assert.ok(find(render(),'Rich text font size'));assert.ok(!render().some(node=>node.props?.role==='textbox'));
  find(render(),'Bold').props.onClick();assert.equal(props.item.bold,true);
});

test('font choice, fine positioning and zoom preserve the saved physical label layout',()=>{
  const h=designer();find(h.render(),'Field font family').props.onChange({target:{value:'khmer'}});
  const text=()=>h.props.layout.elements.find(element=>element.id==='text-a');assert.equal(text().fontFamily,'khmer');
  find(h.render(),'Move Custom text').props.onKeyDown(event({key:'ArrowRight',shiftKey:true,target:{isContentEditable:false}}));assert.equal(text().x,10);
  const before=structuredClone(h.props.layout);find(h.render(),'Preview zoom').props.onChange({target:{value:'2'}});assert.deepEqual(h.props.layout,before);assert.equal(find(h.render(),'Preview zoom').props.value,2);
  find(h.render(),'Move Order QR code').props.onClick(event());for(let i=0;i<20;i++)find(h.render(),'Resize Order QR code').props.onKeyDown(event({key:'ArrowUp'}));
  const qr=h.props.layout.elements.find(element=>element.field==='qr');assert.ok(qr.height*50/100>=18.6);assert.ok(Math.abs(qr.width*80-qr.height*50)<.000001);
});

test('English/Khmer fonts and advanced text settings validate and survive serialization',()=>{
  for(const fontFamily of Object.keys(api.SHIPPING_FONTS)){
    const layout=api.defaultShippingLayout();Object.assign(layout.elements[0],{fontFamily,lineHeight:1.6,letterSpacing:.3,rotation:5});
    const saved=api.validateShippingLayout(JSON.parse(JSON.stringify(layout)));assert.deepEqual(saved,layout);
    const style=api.shippingElementStyle(saved.elements[0]);assert.match(style.fontFamily,fontFamily==='khmer'?/font-hanuman/:/Arial/);assert.equal(style.lineHeight,1.6);assert.equal(style.letterSpacing,'0.3px');assert.equal(style.transform,'rotate(5deg)');
  }
  for(const patch of [{fontFamily:'Arial; color:red'},{fontFamily:'__proto__'},{lineHeight:0},{letterSpacing:NaN},{rotation:181}]){
    const layout=api.defaultShippingLayout();Object.assign(layout.elements[0],patch);assert.throws(()=>api.validateShippingLayout(layout));
  }
});

test('editor removes properties and quick inserts, retaining top text tools, searchable fields and layers',()=>{
  const h=designer(),original=structuredClone(h.props.layout.elements.at(-1));
  assert.ok(h.render().find(node=>node.type==='section').props.className.includes('grid-cols-'));
  assert.ok(!h.render().some(node=>['Field properties','Quick insert'].includes(node.props?.children)));
  assert.ok(!h.render().some(node=>node.props?.['aria-label']==='Field x position'));
  const main=h.render().find(node=>node.type==='main');assert.ok(nodes(main).some(node=>node.type===h.Rich));
  find(h.render(),'Move Custom text').props.onKeyDown(event({key:'ArrowRight',shiftKey:true,target:{isContentEditable:false}}));assert.equal(h.props.layout.elements.at(-1).x,10);
  find(h.render(),'Text color').props.onChange({target:{value:'#1f2937'}});
  const before=h.props.layout.elements.length;find(h.render(),'Duplicate field').props.onClick();assert.equal(h.props.layout.elements.length,before+1);
  const duplicate=h.props.layout.elements.at(-1);assert.notEqual(duplicate.id,original.id);assert.equal(duplicate.text,original.text);assert.equal(duplicate.color,'#1f2937');
  find(h.render(),'Hide field').props.onClick();assert.equal(h.props.layout.elements.at(-1).hidden,true);assert.equal(h.render().filter(node=>node.props?.['aria-label']==='Move Custom text').length,1);
  find(h.render(),'Show field').props.onClick();assert.equal(h.props.layout.elements.at(-1).hidden,false);
  const layer=find(h.render(),`Select layer ${duplicate.id}`);layer.props.onKeyDown(event({key:'ArrowUp',altKey:true}));assert.equal(h.props.layout.elements.at(-2).id,duplicate.id);
  find(h.render(),'Search fields').props.onChange({target:{value:'tracking'}});assert.ok(find(h.render(),'Add Tracking number'));assert.ok(!h.render().some(node=>node.props?.['aria-label']==='Add Recipient name'));
  find(h.render(),'Add Tracking number').props.onClick();assert.equal(h.props.layout.elements.at(-1).field,'tracking');api.validateShippingLayout(h.props.layout,18.6);
});

test('locked layers block property, keyboard, cut and reorder edits, then unlock cleanly',()=>{
  const h=designer();find(h.render(),'Lock field').props.onClick();const before=structuredClone(h.props.layout),tree=h.render();
  assert.equal(before.elements.at(-1).locked,true);assert.equal(tree.find(node=>node.type===h.Rich).props.toolsOnly,true);
  find(tree,'Move Custom text').props.onDoubleClick(event());assert.equal(find(h.render(),'Move Custom text').props.role,'button');
  find(tree,'Move Custom text').props.onKeyDown(event({key:'ArrowRight',target:{isContentEditable:false}}));
  find(tree,'Field font family').props.onChange({target:{value:'arial'}});find(tree,'Remove field').props.onClick();
  h.render()[0].props.onKeyDown(event({key:'Backspace',target:{tagName:'DIV'}}));
  h.render()[0].props.onCut({...clipboardEvent(),type:'cut'});find(tree,'Hide field').props.onClick();
  find(tree,'Select layer text-a').props.onKeyDown(event({key:'ArrowUp',altKey:true}));assert.deepEqual(h.props.layout,before);
  find(h.render(),'Unlock field').props.onClick();find(h.render(),'Move Custom text').props.onKeyDown(event({key:'ArrowRight',shiftKey:true,target:{isContentEditable:false}}));assert.equal(h.props.layout.elements.at(-1).x,10);
});

test('Preview shows clean output and blocks canvas and property mutations',()=>{
  const h=designer();find(h.render(),'Preview label').props.onClick();const before=h.props.layout,tree=h.render();
  assert.equal(find(tree,'Move Custom text').props.style.outline,'none');assert.equal(find(tree,'Move Custom text').props.tabIndex,-1);
  find(tree,'Move Custom text').props.onDoubleClick(event());find(tree,'Move Custom text').props.onKeyDown(event({key:'ArrowRight',target:{isContentEditable:false}}));
  find(tree,'Field font family').props.onChange({target:{value:'arial'}});find(tree,'Add field').props.onClick();find(tree,'Duplicate field').props.onClick();h.render()[0].props.onPaste(clipboardEvent({'text/plain':'paste'}));
  assert.equal(h.props.layout,before);find(h.render(),'Edit label').props.onClick();find(h.render(),'Duplicate field').props.onClick();assert.equal(h.props.layout.elements.length,before.elements.length+1);
});

test('new dynamic fields show placeholders while Edit retains raw tags and Preview resolves data',()=>{
 const h=designer();h.props.values.customerName='Dara';find(h.render(),'Add Recipient name').props.onClick();
 const added=h.props.layout.elements.at(-1);assert.equal(added.field,'customerName');assert.equal(added.text,'');
 const content=()=>h.render().find(node=>node.type===h.Content&&node.props.element.id===added.id);
 assert.equal(content().props.showPlaceholders,true);assert.equal(content().props.values.customerName,'Dara');
 find(h.render(),'Preview label').props.onClick();assert.equal(content().props.showPlaceholders,false);
 find(h.render(),'Edit label').props.onClick();assert.equal(content().props.showPlaceholders,true);assert.equal(h.props.layout.elements.at(-1).text,'');
});

test('Shipping type is available directly and retains its dynamic binding through edit, preview and clipboard',()=>{
 const h=designer();h.props.values.shippingType='J&T';find(h.render(),'Add Shipping type').props.onClick();
 const added=h.props.layout.elements.at(-1);assert.equal(added.field,'shippingType');assert.equal(added.text,'');
 api.validateShippingLayout(h.props.layout,18.6);
 const content=()=>h.render().find(node=>node.type===h.Content&&node.props.element.id===added.id);
 assert.equal(content().props.showPlaceholders,true);assert.equal(content().props.values.shippingType,'J&T');
 const copied=clipboardEvent();h.render()[0].props.onCopy(copied);assert.equal(copied.clipboardData.getData('text/plain'),'{{shipping_type}}');
 find(h.render(),'Preview label').props.onClick();assert.equal(content().props.showPlaceholders,false);
 find(h.render(),'Edit label').props.onClick();assert.equal(content().props.showPlaceholders,true);assert.equal(added.text,'');
});

function selectionDesigner(){
 const h=designer(),base=h.props.layout.elements.at(-1);h.props.layout={...h.props.layout,elements:[
  {...base,id:'a',x:10,y:10,width:20,height:10},
  {...base,id:'b',field:'customerName',x:40,y:10,width:20,height:10,text:''},
  {...base,id:'hidden',hidden:true,x:15,y:12,width:20,height:10},
  {...base,id:'locked',locked:true,x:80,y:70,width:20,height:10},
 ]};
 const bounds={left:100,top:100,width:400,height:200};find(h.render(),'Shipping label design canvas').props.ref.current={getBoundingClientRect:()=>bounds};
 const field=id=>h.render().find(node=>node.props?.['data-shipping-element']===id);
 const pointer=(extra={})=>event({button:0,pointerId:1,clientX:150,clientY:125,target:{tagName:'DIV',closest:()=>null},currentTarget:{focus(){},setPointerCapture(){}},...extra});
 const ctrlClick=id=>{field(id).props.onPointerDown(pointer({ctrlKey:true}));field(id).props.onClick(event({ctrlKey:true}));};
 const pressed=()=>h.render().filter(node=>node.props?.['data-shipping-element']&&node.props['aria-pressed']).map(node=>node.props['data-shipping-element']);
 return {...h,field,pointer,ctrlClick,pressed};
}

test('Ctrl/Cmd click toggles canvas selection, focus preserves it and Ctrl+A leaves input selection native',()=>{
 const h=selectionDesigner();assert.deepEqual(h.pressed(),['a']);h.ctrlClick('b');assert.deepEqual(h.pressed(),['a','b']);
 h.field('a').props.onFocus();assert.deepEqual(h.pressed(),['a','b']);h.ctrlClick('a');assert.deepEqual(h.pressed(),['b']);
 h.field('a').props.onPointerDown(h.pointer({metaKey:true}));h.field('a').props.onClick(event({metaKey:true}));assert.deepEqual(h.pressed(),['a','b']);
 h.render()[0].props.onKeyDown(event({key:'a',ctrlKey:true,target:{tagName:'DIV'}}));assert.deepEqual(h.pressed(),['a','b','locked']);
 const native=event({key:'a',ctrlKey:true,target:{tagName:'INPUT'}});h.render()[0].props.onKeyDown(native);assert.equal(native.prevented,undefined);assert.deepEqual(h.pressed(),['a','b','locked']);
});

test('dragging a selection box selects visible fields and releasing does not clear the selection',()=>{
 const h=selectionDesigner();find(h.render(),'Label workspace').props.onPointerDown(h.pointer({clientX:100,clientY:100}));
 find(h.render(),'Label workspace').props.onPointerMove(h.pointer({clientX:350,clientY:145}));assert.deepEqual(h.pressed(),['a','b']);
 assert.ok(find(h.render(),'Selection marquee'));find(h.render(),'Label workspace').props.onPointerUp(h.pointer());
 find(h.render(),'Label workspace').props.onClick(event({currentTarget:{focus(){}}}));assert.deepEqual(h.pressed(),['a','b']);assert.ok(!h.render().some(node=>node.props?.['aria-label']==='Selection marquee'));
 h.ctrlClick('a');assert.deepEqual(h.pressed(),['b']);
 find(h.render(),'Label workspace').props.onPointerDown(h.pointer({clientX:135,clientY:115,ctrlKey:true}));find(h.render(),'Label workspace').props.onPointerMove(h.pointer({clientX:220,clientY:140}));assert.deepEqual(h.pressed(),['a','b']);
});

test('selected fields drag and nudge together, stop at paper edges and preserve locked fields',()=>{
 const h=selectionDesigner();h.ctrlClick('b');h.ctrlClick('locked');const before=structuredClone(h.props.layout);
 h.field('a').props.onPointerDown(h.pointer());h.field('a').props.onPointerMove(h.pointer({clientX:190,clientY:145}));
 const item=id=>h.props.layout.elements.find(element=>element.id===id);
 assert.equal(item('a').x,20);assert.equal(item('b').x,50);assert.equal(item('a').y,20);assert.equal(item('b').y,20);assert.deepEqual(item('locked'),before.elements.find(element=>element.id==='locked'));
 h.field('a').props.onPointerMove(h.pointer({clientX:1000,clientY:125}));assert.equal(item('a').x,50);assert.equal(item('b').x,80);assert.equal(item('b').x-item('a').x,30);
 h.field('a').props.onPointerUp(h.pointer());h.field('a').props.onClick(event());assert.deepEqual(h.pressed(),['a','b','locked']);
 h.field('a').props.onKeyDown(event({key:'ArrowLeft',shiftKey:true,target:{isContentEditable:false}}));assert.equal(item('a').x,45);assert.equal(item('b').x,75);assert.equal(item('locked').x,80);api.validateShippingLayout(h.props.layout,18.6);
});

test('a plain click selects one member without treating pointer jitter as a layout edit',()=>{
 const h=selectionDesigner();h.ctrlClick('b');const before=h.props.layout;
 h.field('a').props.onPointerDown(h.pointer());h.field('a').props.onPointerMove(h.pointer({clientX:151,clientY:125}));h.field('a').props.onPointerUp(h.pointer());h.field('a').props.onClick(event());
 assert.deepEqual(h.pressed(),['a']);assert.equal(h.props.layout,before);
});

test('multi-selection copies, duplicates, pastes and deletes as a group with atomic field limits',()=>{
 const h=selectionDesigner();h.ctrlClick('b');const copied=clipboardEvent();h.render()[0].props.onCopy(copied);
 assert.equal(JSON.parse(copied.clipboardData.getData('application/x-tenh-shipping-field')).elements.length,2);assert.ok(copied.clipboardData.getData('text/plain').includes('{{recipient_name}}'));
 h.render()[0].props.onPaste({...copied,type:'paste'});assert.equal(h.props.layout.elements.length,6);const pasted=h.props.layout.elements.slice(-2);assert.equal(pasted[1].x-pasted[0].x,30);assert.ok(pasted.every(element=>!['a','b'].includes(element.id)));assert.equal(h.pressed().length,2);
 find(h.render(),'Duplicate field').props.onClick();assert.equal(h.props.layout.elements.length,8);assert.equal(h.pressed().length,2);
 h.render()[0].props.onKeyDown(event({key:'Backspace',target:{tagName:'DIV'}}));assert.equal(h.props.layout.elements.length,6);assert.equal(h.pressed().length,0);
 const base=h.props.layout.elements[0];h.props.layout={...h.props.layout,elements:Array.from({length:39},(_,i)=>({...base,id:`limit-${i}`}))};const before=h.props.layout;
  h.render()[0].props.onPaste({...copied,type:'paste'});assert.equal(h.props.layout,before);assert.ok(h.render().some(node=>node.props?.role==='alert'));
 const cut=selectionDesigner();cut.ctrlClick('b');const clip={...clipboardEvent(),type:'cut'};cut.render()[0].props.onCut(clip);assert.deepEqual(cut.props.layout.elements.map(element=>element.id),['hidden','locked']);assert.equal(JSON.parse(clip.clipboardData.getData('application/x-tenh-shipping-field')).elements.length,2);
 cut.render()[0].props.onPaste({...clip,type:'paste'});assert.equal(cut.props.layout.elements.length,4);assert.equal(cut.pressed().length,2);
});

test('group delete removes selected unlocked fields and retains locked and hidden fields',()=>{
 const h=selectionDesigner();h.render()[0].props.onKeyDown(event({key:'a',ctrlKey:true,target:{tagName:'DIV'}}));
 assert.equal(find(h.render(),'Remove field').props.disabled,false);find(h.render(),'Remove field').props.onClick();
 assert.deepEqual(h.props.layout.elements.map(element=>element.id),['hidden','locked']);assert.deepEqual(h.pressed(),['locked']);assert.equal(find(h.render(),'Remove field').props.disabled,true);
});

test('Preview blocks marquee and multi-select shortcuts without changing the template',()=>{
 const h=selectionDesigner(),before=h.props.layout;find(h.render(),'Preview label').props.onClick();
 find(h.render(),'Label workspace').props.onPointerDown(h.pointer());find(h.render(),'Label workspace').props.onPointerMove(h.pointer({clientX:350,clientY:145}));
 h.render()[0].props.onKeyDown(event({key:'a',ctrlKey:true,target:{tagName:'DIV'}}));h.ctrlClick('b');assert.equal(h.props.layout,before);assert.ok(!h.render().some(node=>node.props?.['aria-label']==='Selection marquee'));
 find(h.render(),'Edit label').props.onClick();assert.deepEqual(h.pressed(),['a']);
});

test('whole-field formatting is usable without selection, undo restores marks, and inline editing supports Khmer composition',()=>{
  const props={item:{...api.defaultShippingLayout().elements[0],field:'text',text:'Hello សួស្តី',richText:[{text:'Hello '},{text:'សួស្តី',italic:true}],bold:false},inlineTarget:{},onChange:patch=>{props.item={...props.item,...patch};},onFinish:()=>{finished++;}};
  let finished=0;
  const render=component('app/(dashboard)/dashboard/settings/printers/shipping-rich-text.tsx',{'react-dom':{createPortal:(child,target)=>jsxRuntime.jsx('portal',{children:child,target})},'@/lib/receipts/shipping-custom':{shippingRichTextMarkup:()=>''}},props);
  find(render(),'Bold').props.onClick();assert.equal(props.item.bold,true);assert.ok(props.item.richText.every(run=>run.bold));assert.equal(props.item.richText[1].italic,true);
  find(render(),'Undo text edit').props.onClick();assert.equal(props.item.bold,false);assert.deepEqual(props.item.richText,[{text:'Hello '},{text:'សួស្តី',italic:true}]);
  find(render(),'Redo text edit').props.onClick();assert.equal(props.item.bold,true);
  const textbox=find(render(),'Custom rich text');assert.equal(render().find(node=>node.type==='portal').props.target,props.inlineTarget);
  const composing=event({key:'Enter',nativeEvent:{isComposing:true}});textbox.props.onKeyDown(composing);assert.equal(composing.prevented,undefined);assert.equal(composing.stopped,true);
  textbox.props.onKeyDown(event({key:'Escape'}));assert.equal(finished,1);
});
