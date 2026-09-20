"use client";
import { code39Bars } from "@/lib/barcode/code39";
import type { ShippingElement, ShippingLayout } from "@/lib/receipts/shipping-layout";
export type ShippingValues = Record<string,string>;
export function ShippingElementContent({element,values}:{element:ShippingElement;values:ShippingValues}) {
  if(element.field==="line")return <div style={{borderTop:"1px solid black",width:"100%",marginTop:1}}/>;
  if(element.field==="barcode"){
    const code=code39Bars((values.orderNumber||"ORDER-001").toUpperCase().replace(/[^A-Z0-9 .\-$\/%+]/g,"-").slice(0,40));
    return <svg aria-label={`Order barcode ${code.text}`} viewBox={`0 0 ${code.width} 44`} width="100%" height="100%" preserveAspectRatio="none">{code.bars.map((bar,i)=><rect key={i} x={bar.x} width={bar.width} y="0" height="44" fill="black"/>)}</svg>;
  }
  return <>{element.field==="text" ? element.text : values[element.field] || ""}</>;
}
export function shippingElementStyle(element:ShippingElement):React.CSSProperties {
  return {position:"absolute",left:`${element.x}%`,top:`${element.y}%`,width:`${element.width}%`,height:`${element.height}%`,fontSize:element.fontSize,fontWeight:element.bold?700:400,textAlign:element.align,lineHeight:1.2,whiteSpace:"pre-wrap",overflowWrap:"anywhere",overflow:"hidden",boxSizing:"border-box"};
}
export default function ShippingCanvas({layout,size,values}:{layout:ShippingLayout;size:string;values:ShippingValues}) {
  const [width,height]=size.split("x").map(Number);
  return <article className="shipping-label" style={{position:"relative",width:`${width}mm`,height:`${height}mm`,background:"white",color:"black",fontFamily:"Arial, sans-serif",overflow:"hidden",flexShrink:0}}>{layout.elements.map(element=><div key={element.id} style={shippingElementStyle(element)}><ShippingElementContent element={element} values={values}/></div>)}</article>;
}
