import test from "node:test";
import assert from "node:assert/strict";
import { defaultShippingLayout, validateShippingLayout } from "../lib/receipts/shipping-layout.ts";

test("custom shipping designs survive serialization at every supported paper size", () => {
  for(const size of ["80x50","100x100","100x150"]){
    const layout=defaultShippingLayout(size);
    assert.deepEqual(validateShippingLayout(JSON.parse(JSON.stringify(layout))),layout);
  }
});
test("shipping designs reject invalid fields, off-paper positions and oversized text", () => {
  for(const patch of [{field:"unknown"},{x:99},{y:-1},{width:101},{height:0},{fontSize:100},{text:"x".repeat(301)},{align:"invalid"},{bold:"yes"}]){
    const layout=defaultShippingLayout();layout.elements[0]={...layout.elements[0],...patch};
    assert.throws(()=>validateShippingLayout(layout));
  }
  assert.throws(()=>validateShippingLayout({...defaultShippingLayout(),size:"500x500"}));
});
test("designs require unique element identities and cap element count",()=>{
  const layout=defaultShippingLayout();layout.elements.push({...layout.elements[0]});
  assert.throws(()=>validateShippingLayout(layout));
  assert.throws(()=>validateShippingLayout({...layout,elements:Array.from({length:41},(_,i)=>({...layout.elements[0],id:String(i)}))}));
});

 test('QR geometry stays square and in bounds through repeated paper changes', async()=>{
 const {resizeShippingLayout,fitShippingElement}=await import('../lib/receipts/shipping-layout.ts');
 let layout=defaultShippingLayout();const qr=layout.elements.find(element=>element.field==='qr');
 for(const size of ['80x50','100x100','100x150','80x50','100x150']){
  layout=resizeShippingLayout(layout,size);validateShippingLayout(layout);
  const item=layout.elements.find(element=>element.field==='qr');const [width,height]=size.split('x').map(Number);
  assert.ok(Math.abs(item.width*width-item.height*height)<.0001);
  assert.equal(item.width,qr.width);
  const moved=fitShippingElement({...item,x:99,y:99,width:0,height:0},size);
  validateShippingLayout({...layout,elements:[moved]});assert.ok(moved.x+moved.width<=100 && moved.y+moved.height<=100);
 }
});

 test('tiny QR resize requests clamp to payload-derived physical size at every paper size',async()=>{
 const {fitShippingElement,shippingQrMinimumMm}=await import('../lib/receipts/shipping-layout.ts');
 const required=shippingQrMinimumMm(37);
 for(const size of ['80x50','100x100','100x150']){
  const [width,height]=size.split('x').map(Number);const element=defaultShippingLayout(size).elements.find(x=>x.field==='qr');
  const tiny={...element,x:98,y:98,width:2,height:3.2};
  const fitted=fitShippingElement(tiny,size,required);
  assert.ok(fitted.width/100*width>=required-.00001);assert.ok(fitted.height/100*height>=required-.00001);
  assert.ok(required/37*203/25.4>=4);
  validateShippingLayout({...defaultShippingLayout(size),elements:[fitted]},required);
 }
});
 test('legacy tiny QR dimensions are rejected for saving but repaired for review without mutating input',async()=>{
 const {shippingQrMinimumMm}=await import('../lib/receipts/shipping-layout.ts');const minimum=shippingQrMinimumMm(37);
 const layout=defaultShippingLayout('80x50');const qr=layout.elements.find(x=>x.field==='qr');qr.width=2;qr.height=3.2;
 assert.throws(()=>validateShippingLayout(layout,minimum),/Order QR code must be at least/);
 const recovered=validateShippingLayout(layout,minimum,true);assert.equal(qr.width,2);
 validateShippingLayout(recovered,minimum);assert.ok(recovered.elements.find(x=>x.field==='qr').width>=minimum/80*100);
});

 test('rich text formats selected EN/KM ranges without changing other text and round-trips safely',async()=>{
 const {formatShippingRuns,normalizeShippingRuns}=await import('../lib/receipts/shipping-layout.ts');
 for(const text of ['Hello world','សួស្តី ពិភពលោក']){
  const runs=formatShippingRuns([{text}],0,5,{bold:true,italic:true,underline:true,fontSize:22});
  assert.equal(runs.map(x=>x.text).join(''),text);assert.equal(runs[0].text,text.slice(0,5));assert.equal(runs[1].bold,undefined);
  const element={...defaultShippingLayout().elements[0],field:'text',text,richText:runs};
  assert.deepEqual(validateShippingLayout({...defaultShippingLayout(),elements:[element]}).elements[0].richText,runs);
  assert.deepEqual(normalizeShippingRuns(JSON.parse(JSON.stringify(runs))),runs);
 }
});
 test('rich text rejects HTML properties, invalid marks, mismatched text, oversized content and dynamic-field runs',async()=>{
 const {normalizeShippingRuns}=await import('../lib/receipts/shipping-layout.ts');
 for(const run of [{text:'x',html:'<script>x</script>'},{text:'x',bold:'yes'},{text:'x',fontSize:100},{text:'x',underline:1},{text:'x'.repeat(301)}])assert.throws(()=>normalizeShippingRuns([run]));
 const element={...defaultShippingLayout().elements[0],field:'text',text:'wrong',richText:[{text:'right'}]};assert.throws(()=>validateShippingLayout({...defaultShippingLayout(),elements:[element]}));
 assert.throws(()=>validateShippingLayout({...defaultShippingLayout(),elements:[{...element,field:'customerName',text:'right'}]}),/protected placeholders/);
});
