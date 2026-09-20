export const SHIPPING_FIELDS = {
  storeName: "Shop name", storePhone: "Shop telephone", storeAddress: "Shop address",
  customerName: "Customer name", customerPhone: "Customer telephone", customerAddress: "Delivery address",
  orderNumber: "Order number", barcode: "Order barcode", total: "Order total", payment: "Payment method",
  itemCount: "Item count", text: "Custom text", line: "Divider",
} as const;
export type ShippingField = keyof typeof SHIPPING_FIELDS;
export type ShippingElement = { id: string; field: ShippingField; x: number; y: number; width: number; height: number; fontSize: number; bold: boolean; align: "left" | "center" | "right"; text: string };
export type ShippingLayout = { version: 1; size: string; enabled: boolean; elements: ShippingElement[] };
export function defaultShippingLayout(): ShippingLayout {
  const rows: Array<[ShippingField, number, number, number]> = [["storeName",3,8,16],["storePhone",12,6,11],["storeAddress",19,10,11],["line",30,1,10],["customerName",34,8,18],["customerPhone",43,6,12],["customerAddress",50,15,12],["orderNumber",68,6,11],["total",75,6,13],["barcode",84,13,10]];
  return {version:1,size:"100x150",enabled:true,elements:rows.map(([field,y,height,fontSize],i)=>({id:`field-${i}`,field,x:5,y,width:90,height,fontSize,bold:field==="storeName"||field==="customerName"||field==="total",align:"left",text:""}))};
}
export function validateShippingLayout(value: unknown): ShippingLayout {
  if (!value || typeof value !== "object") throw new Error("Invalid shipping design.");
  const layout = value as ShippingLayout;
  if(!["80x50","100x100","100x150"].includes(layout.size) || layout.version!==1 || typeof layout.enabled!=="boolean" || !Array.isArray(layout.elements) || layout.elements.length>40) throw new Error("A design supports up to 40 elements.");
  const ids=new Set<string>();
  for(const item of layout.elements){
    if(!item || typeof item.id!=="string" || item.id.length>80 || ids.has(item.id) || !Object.hasOwn(SHIPPING_FIELDS,item.field)) throw new Error("Invalid shipping element.");
    ids.add(item.id);
    if(![item.x,item.y,item.width,item.height,item.fontSize].every(Number.isFinite) || item.x<0 || item.y<0 || item.width<2 || item.height<1 || item.x+item.width>100.01 || item.y+item.height>100.01 || item.fontSize<6 || item.fontSize>36 || typeof item.bold!=="boolean" || !["left","center","right"].includes(item.align) || typeof item.text!=="string" || item.text.length>300) throw new Error("Keep elements inside the label and text under 300 characters.");
  }
  return {version:1,size:layout.size,enabled:layout.enabled,elements:layout.elements.map(item=>({...item}))};
}
