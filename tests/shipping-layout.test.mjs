import test from "node:test";
import assert from "node:assert/strict";
import { defaultShippingLayout, validateShippingLayout } from "../lib/receipts/shipping-layout.ts";

test("custom shipping designs survive serialization at every supported paper size", () => {
  for(const size of ["80x50","100x100","100x150"]){
    const layout={...defaultShippingLayout(),size};
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
