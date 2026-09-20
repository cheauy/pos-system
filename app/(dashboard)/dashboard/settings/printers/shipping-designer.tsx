"use client";
import { useRef, useState } from "react";
import { defaultShippingLayout, SHIPPING_FIELDS, type ShippingElement, type ShippingField, type ShippingLayout } from "@/lib/receipts/shipping-layout";
import { ShippingElementContent, shippingElementStyle, type ShippingValues } from "@/components/receipts/shipping-canvas";

export default function ShippingDesigner({ layout, size, values, onChange }: {
  layout: ShippingLayout; size: string; values: ShippingValues; onChange: (layout: ShippingLayout) => void;
}) {
  const [selected,setSelected]=useState<string|null>(null);
  const [field,setField]=useState<ShippingField>("text");
  const canvas=useRef<HTMLDivElement>(null);
  const drag=useRef<{id:string;x:number;y:number;element:ShippingElement;resize:boolean;bounds:DOMRect}|null>(null);
  const item=layout.elements.find(element=>element.id===selected);
  const [width,height]=size.split("x").map(Number);
  function update(id:string,patch:Partial<ShippingElement>){
    onChange({...layout,elements:layout.elements.map(element=>{
      if(element.id!==id)return element;
      const next={...element,...patch};
      next.width=Math.max(2,Math.min(100,next.width));next.height=Math.max(1,Math.min(100,next.height));
      next.x=Math.max(0,Math.min(100-next.width,next.x));next.y=Math.max(0,Math.min(100-next.height,next.y));
      return next;
    })});
  }
  function start(event:React.PointerEvent,element:ShippingElement,resize=false){
    if(!canvas.current)return;
    event.preventDefault();event.stopPropagation();setSelected(element.id);
    (event.currentTarget as HTMLElement).focus();
    drag.current={id:element.id,x:event.clientX,y:event.clientY,element:{...element},resize,bounds:canvas.current.getBoundingClientRect()};
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event:React.PointerEvent){
    const current=drag.current;if(!current)return;
    const dx=(event.clientX-current.x)/current.bounds.width*100,dy=(event.clientY-current.y)/current.bounds.height*100;
    update(current.id,current.resize?{width:Math.min(100-current.element.x,Math.max(2,current.element.width+dx)),height:Math.min(100-current.element.y,Math.max(1,current.element.height+dy))}:{x:current.element.x+dx,y:current.element.y+dy});
  }
  const input="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900";
  return <div className="space-y-4">
    <p className="text-sm text-slate-500">Drag fields to move them. Drag the corner to resize. Use arrow keys for fine adjustments. Customer and order fields fill automatically when printed.</p>
    <div className="flex flex-wrap gap-2">
      <select aria-label="Field to add" value={field} onChange={event=>setField(event.target.value as ShippingField)} className="rounded-lg border bg-white p-2 text-slate-900">{Object.entries(SHIPPING_FIELDS).map(([key,title])=><option key={key} value={key}>{title}</option>)}</select>
      <button type="button" disabled={layout.elements.length>=40} onClick={()=>{
        const id=crypto.randomUUID();onChange({...layout,elements:[...layout.elements,{id,field,x:5,y:5,width:70,height:field==="barcode"?15:10,fontSize:12,bold:false,align:"left",text:field==="text"?"Your text":""}]});setSelected(id);
      }} className="rounded-lg bg-blue-600 px-3 py-2 font-semibold text-white disabled:opacity-40">Add field</button>
      <button type="button" onClick={()=>{onChange({...defaultShippingLayout(),size});setSelected(null);}} className="rounded-lg border px-3 py-2">Reset layout</button>
    </div>
    <div className="overflow-auto rounded-xl border bg-slate-100 p-3">
      <div ref={canvas} aria-label="Shipping label design canvas" onClick={()=>setSelected(null)} style={{position:"relative",width:`${width}mm`,height:`${height}mm`,background:"white",color:"black",fontFamily:"Arial, sans-serif",margin:"auto",overflow:"hidden"}}>
        {layout.elements.map(element=><div key={element.id} role="button" tabIndex={0} aria-label={`Move ${SHIPPING_FIELDS[element.field]}`} aria-pressed={selected===element.id}
          onFocus={()=>setSelected(element.id)} onClick={event=>{event.stopPropagation();setSelected(element.id);}}
          onPointerDown={event=>start(event,element)} onPointerMove={move} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}
          onKeyDown={event=>{const step=event.shiftKey?5:1;const direction={ArrowLeft:{x:element.x-step},ArrowRight:{x:element.x+step},ArrowUp:{y:element.y-step},ArrowDown:{y:element.y+step}}[event.key];if(direction){event.preventDefault();update(element.id,direction);}}}
          style={{...shippingElementStyle(element),touchAction:"none",cursor:"move",outline:selected===element.id?"2px solid #2563eb":"1px dashed #cbd5e1",outlineOffset:-1,userSelect:"none"}}>
          <ShippingElementContent element={element} values={values}/>
          {selected===element.id && <span aria-hidden="true" onPointerDown={event=>start(event,element,true)} style={{position:"absolute",right:0,bottom:0,width:12,height:12,background:"#2563eb",cursor:"nwse-resize",touchAction:"none"}}/>}
        </div>)}
      </div>
    </div>
    {item && <div className="space-y-3 rounded-xl border p-3">
      <div className="flex justify-between"><strong>{SHIPPING_FIELDS[item.field]}</strong><button type="button" className="text-red-600" onClick={()=>{onChange({...layout,elements:layout.elements.filter(element=>element.id!==item.id)});setSelected(null);}}>Remove field</button></div>
      {item.field==="text" && <label className="block text-sm">Text<textarea maxLength={300} value={item.text} onChange={event=>update(item.id,{text:event.target.value})} className={input}/></label>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{(["x","y","width","height"] as const).map(key=><label key={key} className="text-xs">{key} (%)<input type="number" min={key==="width"?2:key==="height"?1:0} max={100} step={0.5} value={Number(item[key].toFixed(1))} onChange={event=>update(item.id,{[key]:Number(event.target.value)||0})} className={input}/></label>)}</div>
      {item.field!=="barcode" && item.field!=="line" && <div className="flex flex-wrap items-center gap-3"><label className="text-xs">Font size<input type="number" min={6} max={36} value={item.fontSize} onChange={event=>update(item.id,{fontSize:Math.max(6,Math.min(36,Number(event.target.value)||6))})} className={input}/></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={item.bold} onChange={event=>update(item.id,{bold:event.target.checked})}/>Bold</label><label className="text-xs">Alignment<select value={item.align} onChange={event=>update(item.id,{align:event.target.value as ShippingElement["align"]})} className={input}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label></div>}
    </div>}
  </div>;
}
