"use client";
import { shippingElementContent, type ShippingValues } from "@/lib/receipts/shipping-custom";
import { shippingElementStyle, resizeShippingLayout } from "@/lib/receipts/shipping-layout";
import type { ShippingElement, ShippingLayout } from "@/lib/receipts/shipping-layout";
export type { ShippingValues } from "@/lib/receipts/shipping-custom";
export { shippingElementStyle } from "@/lib/receipts/shipping-layout";
export function ShippingElementContent({element,values,showPlaceholders=false}:{element:ShippingElement;values:ShippingValues;showPlaceholders?:boolean}) {
  return <div data-i18n-ignore="true" style={{width:"100%",height:"100%"}} dangerouslySetInnerHTML={{__html:shippingElementContent(element,values,showPlaceholders)}}/>;
}
export default function ShippingCanvas({layout,size,values}:{layout:ShippingLayout;size:string;values:ShippingValues}) {
  const [width,height]=size.split("x").map(Number);
  return <article className="shipping-label" style={{position:"relative",width:`${width}mm`,height:`${height}mm`,background:"white",color:"black",fontFamily:"Arial, sans-serif",overflow:"hidden",flexShrink:0}}>{resizeShippingLayout(layout,size).elements.filter(element=>!element.hidden).map(element=><div key={element.id} style={shippingElementStyle(element)}><ShippingElementContent element={element} values={values}/></div>)}</article>;
}
