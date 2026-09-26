const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {loadTs}=require('./helpers/load-ts.cjs');
function nodes(root){if(!root||typeof root!=='object')return [];if(Array.isArray(root))return root.flatMap(nodes);return [root,...nodes(root.props?.children)];}
function hooks(){let state=[],cursor=0,refs=[],refCursor=0;return {react:{useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>state[i]=v];},useRef(initial){const i=refCursor++;return refs[i]??(refs[i]={current:initial});},useEffect(){},useSyncExternalStore:()=>true},reset(){cursor=0;refCursor=0;},state};}
test('both print choices open a preview component without a navigation link',()=>{
 const h=hooks(),Preview=()=>null,previous=global.document;global.document={body:{}};
 try{
 const Menu=loadTs('components/order-print-menu.tsx',{'react/jsx-runtime':require('react/jsx-runtime'),react:h.react,'react-dom':{createPortal:node=>node},'lucide-react':require('lucide-react'),'./order-print-preview':{default:Preview}}).default;
 for(const [label,kind]of [['Print Receipt','receipt'],['Print Shipping label','shipping-label']]){
  h.reset();let tree=nodes(Menu({orderId:'order-123'}));const option=tree.find(n=>n.type==='button'&&Array.isArray(n.props.children)&&n.props.children.includes(label));assert.ok(option);option.props.onClick();h.reset();tree=nodes(Menu({orderId:'order-123'}));assert.ok(tree.some(n=>n.type===Preview&&n.props.kind===kind));assert.ok(!tree.some(n=>n.type==='a'));
 }
 }finally{global.document=previous;}
});
test('centered preview has header Print, waits for a valid document and blocks missing shipping address',async()=>{
 const h=hooks(),Button=()=>null,previous=global.document;global.document={body:{}};
 try{
 const Preview=loadTs('components/order-print-preview.tsx',{'react/jsx-runtime':require('react/jsx-runtime'),react:h.react,'react-dom':{createPortal:node=>node},'lucide-react':require('lucide-react'),'./print-button':{default:Button},'@/lib/printing/wait-for-preview':{waitForPrintPreview:async doc=>{const content=doc.getElementById();if(!content)throw Error('Preview unavailable');return content;}}}).default;
 const render=()=>{h.reset();return nodes(Preview({orderId:'order-123',kind:'shipping-label',onClose(){}}));};
 let tree=render();assert.match(tree[0].props.className,/fixed inset-0 m-auto/);
 assert.equal(tree.find(n=>n.type===Button).props.disabled,true);
 const iframe=tree.find(n=>n.type==='iframe');assert.equal(iframe.props.src,'/dashboard/orders/order-123/shipping-label?preview=1');
 iframe.props.ref.current={contentDocument:{getElementById:()=>({dataset:{printDisabled:'true'}})}};await iframe.props.onLoad();tree=render();assert.equal(tree.find(n=>n.type===Button).props.disabled,true);
 iframe.props.ref.current={contentDocument:{getElementById:()=>({dataset:{}})}};await iframe.props.onLoad();tree=render();assert.equal(tree.find(n=>n.type===Button).props.disabled,false);
 assert.ok(nodes(tree.find(n=>n.type==='header')).some(n=>n.type===Button));
 iframe.props.ref.current={contentDocument:{getElementById:()=>null}};await iframe.props.onLoad();tree=render();assert.equal(tree.find(n=>n.type===Button).props.disabled,true);assert.ok(tree.some(n=>n.props.role==='alert'));
 }finally{global.document=previous;}
});
test('header Print targets only the preview frame after resources load',async()=>{
 const h=hooks();let prints=0,decoded=0;
 const content={querySelectorAll:selector=>selector==='img'?[{naturalWidth:100,decode:async()=>{decoded++;}}]:[]};
 const frame={current:{contentWindow:{document:{querySelector:()=>content,fonts:{ready:Promise.resolve()}},focus(){},print(){prints++;}}}};
 const Button=loadTs('components/print-button.tsx',{'react/jsx-runtime':require('react/jsx-runtime'),react:h.react,'lucide-react':require('lucide-react'),'@/lib/printing/prepare-print':loadTs('lib/printing/prepare-print.ts')}).default;
 const tree=nodes(Button({frame,selector:'#order-receipt-print-area'}));await tree.find(n=>n.type==='button').props.onClick();assert.equal(prints,1);assert.equal(decoded,1);
 frame.current.contentWindow.document.querySelector=()=>null;await tree.find(n=>n.type==='button').props.onClick();assert.equal(prints,1);assert.ok(h.state.some(s=>typeof s==='string'&&s.includes('Print preview')));
});
test('orders row actions and saved-receipt viewer use modal previews',()=>{
 const workspace=fs.readFileSync('app/(dashboard)/dashboard/orders/orders-workspace.tsx','utf8');
 assert.match(workspace,/onPrint\("shipping-label"\)/);assert.match(workspace,/onPrint\("receipt"\)/);assert.ok(!workspace.includes('target="_blank"'));
 const viewer=fs.readFileSync('components/receipts/receipt-viewer.tsx','utf8');assert.match(viewer,/<OrderPrintPreview/);assert.ok(!viewer.includes('target="_blank"'));
});
test('detail print delegates to stable page state instead of closing when detail reloads',()=>{
 const h=hooks(),Preview=()=>null,previous=global.document;global.document={body:{}};
 try{
  const Menu=loadTs('components/order-print-menu.tsx',{'react/jsx-runtime':require('react/jsx-runtime'),react:h.react,'react-dom':{createPortal:node=>node},'lucide-react':require('lucide-react'),'./order-print-preview':{default:Preview}}).default;
  let selected;const props={orderId:'order-123',onPreview:kind=>selected=kind};
  let tree=nodes(Menu(props));tree.find(n=>n.type==='button'&&Array.isArray(n.props.children)&&n.props.children.includes('Print Receipt')).props.onClick();
  assert.equal(selected,'receipt');h.reset();tree=nodes(Menu(props));assert.ok(!tree.some(n=>n.type===Preview));
  const source=fs.readFileSync('app/(dashboard)/dashboard/orders/orders-workspace.tsx','utf8');
  assert.match(source,/<DetailPanel onPrint=/);assert.match(source,/onPreview=\{kind=>onPrint\(order.id,kind\)\}/);
 }finally{global.document=previous;}
});
