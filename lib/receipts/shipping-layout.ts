export const SHIPPING_FIELDS = {
  storeName: "Shop name", storePhone: "Shop telephone", storeAddress: "Shop address",
  customerName: "Customer name", customerPhone: "Customer telephone", customerAddress: "Delivery address",
  orderNumber: "Order number", barcode: "Order barcode", qr: "Order QR code", total: "Order total", payment: "Payment method",
  itemCount: "Item count", tracking: "Tracking number", shippingType: "Shipping type", date: "Date", logo: "Logo / Image", text: "Custom text", line: "Divider",
} as const;
export type ShippingField = keyof typeof SHIPPING_FIELDS;
export const SHIPPING_TEXT_TAGS = Object.entries(SHIPPING_FIELDS)
  .filter(([field])=>!['text','line','qr','barcode','logo'].includes(field))
  .flatMap(([field,label])=>[
    {field:field as ShippingField,tag:`{${label}}`},
    {field:field as ShippingField,tag:`{{${({customerName:'recipient_name',customerPhone:'recipient_phone',customerAddress:'recipient_address',orderNumber:'order_number',tracking:'tracking_number',shippingType:'shipping_type',storeName:'shop_name',storePhone:'shop_phone',storeAddress:'shop_address',itemCount:'item_count',payment:'payment_method'} as Record<string,string>)[field]??field}}}`},
  ]);
export type ShippingTextMarks = { bold?: boolean; italic?: boolean; underline?: boolean; fontSize?: number };
export type ShippingTextRun = ShippingTextMarks & { text: string };
export const SHIPPING_FONTS = {
  auto: { label: 'Current app fonts · English / ខ្មែរ', family: "var(--font-inter, 'Inter'), var(--font-hanuman, 'Hanuman'), Arial, sans-serif" },
  english: { label: 'Inter · English', family: "var(--font-inter, 'Inter'), var(--font-hanuman, 'Hanuman'), Arial, sans-serif" },
  khmer: { label: 'Hanuman · ខ្មែរ', family: "var(--font-hanuman, 'Hanuman'), var(--font-inter, 'Inter'), 'Khmer Sangam MN', 'Noto Sans Khmer', sans-serif" },
  arial: { label: 'Arial', family: "Arial, var(--font-hanuman, 'Hanuman'), sans-serif" },
} as const;
export type ShippingFont = keyof typeof SHIPPING_FONTS;
export type ShippingElement = { id: string; field: ShippingField; x: number; y: number; width: number; height: number; fontSize: number; bold: boolean; italic?: boolean; underline?: boolean; justify?: boolean; hidden?: boolean; locked?: boolean; color?: string; padding?: number; fontFamily?: ShippingFont; lineHeight?: number; letterSpacing?: number; rotation?: number; align: "left" | "center" | "right"; text: string; richText?: ShippingTextRun[] };
export type ShippingLayout = { version: 1; size: string; enabled: boolean; elements: ShippingElement[] };
export function normalizeShippingRuns(value: unknown): ShippingTextRun[] {
  if (!Array.isArray(value) || value.length > 300) throw new Error('Use at most 300 characters in custom text.');
  const result: ShippingTextRun[] = [];
  let length = 0;
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.text !== 'string' || !Object.keys(item).every(key=>['text','bold','italic','underline','fontSize'].includes(key))) throw new Error('Invalid rich text.');
    for (const key of ['bold','italic','underline'] as const) if (item[key] !== undefined && typeof item[key] !== 'boolean') throw new Error('Invalid rich-text formatting.');
    if (item.fontSize !== undefined && (!Number.isFinite(item.fontSize) || item.fontSize < 6 || item.fontSize > 36)) throw new Error('Use font sizes from 6 to 36 px.');
    length += item.text.length;
    if (length > 300) throw new Error('Use at most 300 characters in custom text.');
    if (!item.text) continue;
    const run: ShippingTextRun = {text:item.text};
    for (const key of ['bold','italic','underline','fontSize'] as const) if (item[key] !== undefined) Object.assign(run,{[key]:item[key]});
    const last = result[result.length-1];
    if (last && ['bold','italic','underline','fontSize'].every(key=>last[key as keyof ShippingTextMarks]===run[key as keyof ShippingTextMarks])) last.text += run.text;
    else result.push(run);
  }
  return result;
}
export function formatShippingRuns(runs: ShippingTextRun[], start: number, end: number, patch: ShippingTextMarks) {
  const normalized = normalizeShippingRuns(runs);
  const length = normalized.reduce((sum,run)=>sum+run.text.length,0);
  start=Math.max(0,Math.min(length,start));end=Math.max(start,Math.min(length,end));
  if (start===end) return normalized;
  let position=0;
  const result: ShippingTextRun[]=[];
  for (const run of normalized) {
    const from=Math.max(0,start-position),to=Math.min(run.text.length,end-position);
    if (from<to) {
      if (from>0) result.push({...run,text:run.text.slice(0,from)});
      result.push({...run,...patch,text:run.text.slice(from,to)});
      if(to<run.text.length)result.push({...run,text:run.text.slice(to)});
    } else result.push(run);
    position+=run.text.length;
  }
  return normalizeShippingRuns(result);
}
// Four dots per module at the lowest assumed thermal head resolution (203 dpi).
// Include four quiet modules on every edge. DENSO: https://www.qrcode.com/en/howto/cell.html
export const SHIPPING_QR_DPI = 203;
export const SHIPPING_QR_DOTS_PER_MODULE = 4;
export function shippingQrMinimumMm(modules = 21 + 8) {
  if (!Number.isInteger(modules) || modules < 29 || modules > 185) throw new Error('Invalid QR module count.');
  return Math.ceil(modules * SHIPPING_QR_DOTS_PER_MODULE * 25.4 / SHIPPING_QR_DPI * 10) / 10;
}
export function shippingQrModules(svg: string) {
  const match = svg.match(/viewBox=["']0 0 (\d+) (\d+)["']/);
  if (!match || match[1] !== match[2]) throw new Error('Order QR geometry is unavailable.');
  const modules = Number(match[1]); shippingQrMinimumMm(modules);
  return modules;
}
export function assertShippingQrSize(element: ShippingElement, size: string, minimumMm = shippingQrMinimumMm()) {
  if (element.field !== 'qr') return;
  const [width,height] = size.split('x').map(Number);
  if (Math.min(element.width * width, element.height * height) / 100 - (element.padding ?? 0) * 2 * 25.4 / 96 + .000001 < minimumMm)
    throw new Error(`Order QR code must be at least ${minimumMm.toFixed(1)} mm square (4 dots per module at 203 dpi). Enlarge the QR and save the layout.`);
}
export function defaultShippingLayout(size = "100x150"): ShippingLayout {
  const rows: Array<[ShippingField, number, number, number]> = [["storeName",3,8,16],["storePhone",12,6,11],["storeAddress",19,10,11],["line",30,1,10],["customerName",34,8,18],["customerPhone",43,6,12],["customerAddress",50,15,12],["orderNumber",68,6,11],["total",75,6,13],["barcode",84,13,10]];
  const layout: ShippingLayout = {version:1,size,enabled:true,elements:rows.map(([field,y,height,fontSize],i)=>({id:`field-${i}`,field,x:5,y,width:90,height,fontSize,bold:field==="storeName"||field==="customerName"||field==="total",align:"left",text:""}))};
  layout.elements = layout.elements.filter(element => element.field !== "barcode");
  for (const element of layout.elements) {
    if (element.y >= 34) element.width = 57;
    if (size === "80x50") element.fontSize = Math.min(element.fontSize, element.field === "customerName" ? 13 : 9);
  }
  layout.elements.push({id:"order-qr",field:"qr",x:68,y:34,width:27,height:27,fontSize:12,bold:false,align:"center",text:""});
  return resizeShippingLayout(layout, size);
}
/** Percent coordinates scale with paper; QR bounds always describe a physical square. */
export function fitShippingElement(element: ShippingElement, size: string, minimumQrMm = shippingQrMinimumMm()): ShippingElement {
  const [paperWidth, paperHeight] = size.split("x").map(Number);
  const next = { ...element };
  next.width = Math.max(2, Math.min(100, next.width));
  next.height = Math.max(1, Math.min(100, next.height));
  if (next.field === "qr") {
    const paddingMm = (next.padding ?? 0) * 2 * 25.4 / 96;
    const side = Math.max(minimumQrMm + paddingMm, Math.min(next.width * paperWidth / 100, paperWidth, paperHeight));
    if (side > Math.min(paperWidth,paperHeight)) throw new Error('Order QR does not fit this paper. Choose a larger label.');
    next.width = side / paperWidth * 100;
    next.height = side / paperHeight * 100;
  }
  next.x = Math.max(0, Math.min(100 - next.width, next.x));
  next.y = Math.max(0, Math.min(100 - next.height, next.y));
  return next;
}
export function resizeShippingLayout(layout: ShippingLayout, size: string, minimumQrMm = shippingQrMinimumMm()): ShippingLayout {
  return { ...layout, size, elements: layout.elements.map(element => fitShippingElement(element, size, minimumQrMm)) };
}
export function shippingElementStyle(element: ShippingElement) {
  return { position: "absolute" as const, left: `${element.x}%`, top: `${element.y}%`, width: `${element.width}%`, height: `${element.height}%`, fontSize: `${element.fontSize}px`, fontWeight: element.bold ? 700 : 400, fontFamily: SHIPPING_FONTS[element.fontFamily ?? 'auto'].family, fontStyle:element.italic?'italic':'normal',textDecoration:element.field==='text'&&element.richText!==undefined?'none':element.underline?'underline':'none',textAlign: element.justify ? 'justify' as const : element.align, color:element.color??'#000000',padding:`${element.padding??0}px`,lineHeight: element.lineHeight ?? 1.2, letterSpacing: `${element.letterSpacing ?? 0}px`, ...(element.rotation ? {transform:`rotate(${element.rotation}deg)`} : {}), whiteSpace: "pre-wrap" as const, overflowWrap: "anywhere" as const, overflow: "hidden", boxSizing: "border-box" as const };
}
export function validateShippingLayout(value: unknown, minimumQrMm = shippingQrMinimumMm(), repairQr = false): ShippingLayout {
  if (!value || typeof value !== "object") throw new Error("Invalid shipping design.");
  const layout = value as ShippingLayout;
  if(!["80x50","100x100","100x150"].includes(layout.size) || layout.version!==1 || typeof layout.enabled!=="boolean" || !Array.isArray(layout.elements) || layout.elements.length>40) throw new Error("A design supports up to 40 elements.");
  const ids=new Set<string>();
  for(const item of layout.elements){
    if(!item || typeof item.id!=="string" || item.id.length>80 || ids.has(item.id) || !Object.hasOwn(SHIPPING_FIELDS,item.field)) throw new Error("Invalid shipping element.");
    ids.add(item.id);
    if(![item.x,item.y,item.width,item.height,item.fontSize].every(Number.isFinite) || item.x<0 || item.y<0 || item.width<2 || item.height<1 || item.x+item.width>100.01 || item.y+item.height>100.01 || item.fontSize<6 || item.fontSize>36 || typeof item.bold!=="boolean" || !["left","center","right"].includes(item.align) || typeof item.text!=="string" || item.text.length>300) throw new Error("Keep elements inside the label and text under 300 characters.");
    if (!repairQr) assertShippingQrSize(item,layout.size,minimumQrMm);
    for(const key of ['italic','underline','justify','hidden','locked'] as const) if(item[key] !== undefined && typeof item[key] !== 'boolean') throw new Error('Invalid text formatting.');
    if(item.color!==undefined&&(typeof item.color!=='string'||!/^#[0-9a-f]{6}$/i.test(item.color)))throw new Error('Use a six-digit hex text color.');
    if(item.fontFamily !== undefined && !Object.hasOwn(SHIPPING_FONTS,item.fontFamily)) throw new Error('Choose a supported English or Khmer font.');
    for(const [key,min,max] of [['lineHeight',1,3],['letterSpacing',-2,10],['rotation',-180,180],['padding',0,20]] as const) {
      const number=item[key];
      if(number !== undefined && (!Number.isFinite(number) || number<min || number>max)) throw new Error(`Invalid ${key}.`);
    }
    if (item.richText !== undefined) {
      if(item.field!=='text')throw new Error('Order fields are protected placeholders.');
      const runs=normalizeShippingRuns(item.richText);
      if(runs.map(run=>run.text).join('')!==item.text)throw new Error('Custom text and formatting do not match.');
    }
  }
  const validated: ShippingLayout = {version:1,size:layout.size,enabled:layout.enabled,elements:layout.elements.map(item=>({...item,...(item.richText!==undefined?{richText:normalizeShippingRuns(item.richText)}:{})}))};
  return repairQr ? resizeShippingLayout(validated,layout.size,minimumQrMm) : validated;
}
