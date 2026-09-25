const test=require('node:test'),assert=require('node:assert/strict');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {loadTs}=require('./helpers/load-ts.cjs');
const model=loadTs('lib/receipts/receipt-model.ts');
const barcode=loadTs('lib/barcode/code39.ts');
const shared={'react/jsx-runtime':require('react/jsx-runtime'),react:React,'lucide-react':require('lucide-react'),'@/lib/receipts/receipt-model':model,'@/lib/barcode/code39':barcode};
const receipt=loadTs('components/receipts/pos-receipt.tsx',{...shared,'@/app/(dashboard)/dashboard/pos/pos-workspace-helpers':{money:v=>Number(v).toFixed(2)},'./pos-receipt.module.css':{default:new Proxy({},{get:(_,key)=>String(key)})}}).PosReceipt;
const label=loadTs('app/(dashboard)/dashboard/barcodes/barcode-labels-client.tsx',shared).LabelCard;
const shipping=loadTs('app/(dashboard)/dashboard/shipping-labels/shipping-labels-client.tsx',{...shared,'next/link':{default:()=>null},'@/components/print-button':{default:()=>null}}).ShippingLabel;
test('receipt print uses saved typography, images, paper, header and visibility',()=>{
 const context={appearance:model.receiptAppearance({paper_size:'58mm',font_size:'large',density:'compact',receipt_alignment:'left',header_text:'Saved header',receipt_logo_url:'https://example.com/brand.png',show_phone:false,show_address:false}),store:{name:'Shop',phone:'012345678',address:'Hidden street'}};
 const html=renderToStaticMarkup(React.createElement(receipt,{receipt:model.receiptSample('Shop'),context}));
 assert.match(html,/data-paper="58mm"/);assert.match(html,/data-density="compact"/);assert.match(html,/--receipt-font-scale:1.2/);assert.match(html,/--receipt-alignment:left/);assert.match(html,/Saved header/);assert.match(html,/brand.png/);assert.ok(!html.includes('012345678'));assert.ok(!html.includes('Hidden street'));
});
test('barcode typography changes without changing bar encoding or physical label size',()=>{
 const props={product:{id:'product',name:'Shirt',sku:'TEE001',barcode:'TEE001',selling_price:15},businessName:'Shop',size:'50x30',templateId:'product',elements:{name:true,price:true,barcode:true},customText:''};
 const medium=renderToStaticMarkup(React.createElement(label,{...props,fontSize:'medium'}));
 const large=renderToStaticMarkup(React.createElement(label,{...props,fontSize:'large'}));
 assert.match(medium,/font-size:12px/);assert.match(large,/font-size:14\.399999999999999px|font-size:14.4px/);
 assert.match(large,/width:50mm;height:30mm/);
 assert.equal(medium.match(/<svg[\s\S]*?<\/svg>/)[0],large.match(/<svg[\s\S]*?<\/svg>/)[0]);
});
test('shipping output uses saved text size and visibility in both preview and order printing',()=>{
 const props={order:{order_number:'WEB123',guest_name:'Customer',guest_phone:'0123',guest_address:'Street',payment_method:'COD',total:15,order_items:[]},businessName:'Shop',businessAddress:'Sender street',businessPhone:'09876',size:'100x150',settings:{font_size:'large',density:'compact',shipping_show_store_phone:false}};
 const html=renderToStaticMarkup(React.createElement(shipping,props));assert.match(html,/font-size:14\.399999999999999px|font-size:14.4px/);assert.match(html,/line-height:1.2/);assert.match(html,/Sender street/);assert.ok(!html.includes('09876'));assert.match(html,/100mm/);assert.match(html,/150mm/);
});
