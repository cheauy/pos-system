"use client";
import { printTextScale } from "@/lib/receipts/receipt-model";
import Link from "next/link";
import PrintButton from "@/components/print-button";
import { useMemo, useState } from "react";
import { ChevronLeft, Search, Truck } from "lucide-react";
import { code39Bars } from "@/lib/barcode/code39";
type Customer={name?:string|null;phone?:string|null;address?:string|null};
export type Order={id:string;order_number:string;total:number;payment_method:string|null;payment_status:string|null;guest_name:string|null;guest_phone:string|null;guest_address:string|null;fulfillment_type:string|null;created_at:string;customers:Customer|Customer[]|null;order_items:Array<{quantity:number}>};
export default function ShippingLabelsClient({businessName,businessPhone,businessAddress,orders,settings}:{businessName:string;businessPhone:string;businessAddress:string;orders:Order[];settings:Record<string,unknown>}){
 const [q,setQ]=useState(""); const [selected,setSelected]=useState<string[]>([]); const size=["80x50","100x100","100x150"].includes(String(settings.shipping_label_size))?String(settings.shipping_label_size):"100x150";
 const filtered=useMemo(()=>orders.filter(o=>`${o.order_number} ${o.guest_name??""} ${o.guest_phone??""} ${o.guest_address??""}`.toLowerCase().includes(q.toLowerCase())),[orders,q]); const chosen=orders.filter(o=>selected.includes(o.id));
 function toggle(id:string){setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);}
 return <main className="mx-auto max-w-[1600px] space-y-5 pb-10"><div><Link href="/dashboard/settings/printers" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600"><ChevronLeft size={16}/>Printer Settings</Link><h1 className="mt-3 flex items-center gap-3 text-3xl font-bold"><Truck/>Shipping Labels</h1><p className="mt-1 text-slate-500">Print labels only for delivery orders in this business.</p></div><div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_430px]"><section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="relative"><Search className="absolute left-3 top-3 text-slate-400" size={18}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search order, customer, phone or address" className="w-full rounded-xl border py-2.5 pl-10 pr-3"/></div><div className="mt-4 divide-y">{filtered.length?filtered.map(o=>{const c=Array.isArray(o.customers)?o.customers[0]:o.customers; const name=o.guest_name||c?.name||"Customer"; const phone=o.guest_phone||c?.phone||""; const address=o.guest_address||c?.address||"";return <label key={o.id} className="flex items-start gap-3 py-3"><input type="checkbox" className="mt-1" checked={selected.includes(o.id)} onChange={()=>toggle(o.id)}/><div className="min-w-0 flex-1"><p className="font-semibold">{o.order_number} · {name}</p><p className="text-xs text-slate-500">{phone}</p><p className="truncate text-xs text-slate-500">{address||"No delivery address"}</p></div><span className="font-bold">${Number(o.total).toFixed(2)}</span></label>}):<div className="py-12 text-center text-slate-500">No delivery orders found.</div>}</div></section><aside className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="font-bold">Print preview</h2><p className="text-xs text-slate-500">{chosen.length} selected · {size} mm</p><div id="shipping-label-print-area" className="mt-4 max-h-[560px] space-y-3 overflow-auto">{chosen.map(o=><ShippingLabel key={o.id} order={o} businessName={businessName} businessPhone={businessPhone} businessAddress={businessAddress} size={size} settings={settings}/>)}</div><PrintButton selector="#shipping-label-print-area" label={`Print ${chosen.length} shipping label${chosen.length===1?"":"s"}`} disabled={!chosen.length}/></aside></div><ShippingPrintStyles size={size}/></main>
}
export function ShippingLabel({order,businessName,businessPhone,businessAddress,size,settings}:{order:Order;businessName:string;businessPhone:string;businessAddress:string;size:string;settings:Record<string,unknown>}){
 const c=Array.isArray(order.customers)?order.customers[0]:order.customers;
 const name=order.guest_name||c?.name||"Customer",phone=order.guest_phone||c?.phone||"",address=order.guest_address||c?.address||"";
 const qty=(order.order_items??[]).reduce((sum,item)=>sum+Number(item.quantity||0),0);
 const data=code39Bars(order.order_number.replace(/[^A-Za-z0-9 .\-$/%+]/g,"-").slice(0,32));
 const [w,h]=size.split("x").map(Number),compact=h<=100;
 const tight=compact||settings.density==='compact';
 const showName=Boolean(settings.shipping_show_store_name??settings.shipping_show_sender??true);
 const showAddress=Boolean(settings.shipping_show_store_address??settings.shipping_show_sender??true);
 const showPhone=Boolean(settings.shipping_show_store_phone??settings.shipping_show_sender??true);
 return <article data-width-mm={w} data-height-mm={h} className={`shipping-label border-2 border-black bg-white text-black ${tight?"p-2":"p-5"}`} style={{width:`${w}mm`,minHeight:`${h}mm`,boxSizing:"border-box",overflowWrap:"anywhere",flexShrink:0,fontSize:(compact?10:12)*printTextScale(settings.font_size),lineHeight:tight?1.2:1.5}}>
  {(showName||(showAddress&&businessAddress)||(showPhone&&businessPhone))&&<div>
   <p style={{fontSize:"0.9em",fontWeight:700}}>Sender:</p>
   {showName&&<p style={{fontSize:"1.3em",fontWeight:900}}>{businessName}</p>}
   {showAddress&&businessAddress&&<p>Address: {businessAddress}</p>}
   {showPhone&&businessPhone&&<p>Tel: {businessPhone}</p>}
  </div>}
  <div className={`${tight?"my-1":"my-4"} border-t border-black`}/>
  <p style={{fontSize:"1.5em",fontWeight:900}}>Customer Name: {name}</p>
  {settings.shipping_show_phone!==false&&phone&&<p className="font-semibold">Tel: {phone}</p>}
  <p>Address: {address||"Delivery address missing"}</p>
  <div className={`${tight?"my-1":"my-4"} border-t border-black`}/>
  <div className={`grid ${compact?"grid-cols-4 gap-1":"grid-cols-2 gap-3"}`} style={{fontSize:compact?"0.8em":"1em"}}>
   {settings.shipping_show_order_number!==false&&<div><span>Order</span><p className="font-bold">{order.order_number}</p></div>}
   {settings.shipping_show_item_count!==false&&<div><span>Items</span><p className="font-bold">{qty}</p></div>}
   {settings.shipping_show_cod!==false&&<><div><span>Payment</span><p className="font-bold">{(order.payment_method||'').toUpperCase()}</p></div><div><span>Amount</span><p className="font-bold">${Number(order.total).toFixed(2)}</p></div></>}
  </div>
  {settings.shipping_show_barcode!==false&&<div className={tight?"mt-1":"mt-6"}><svg viewBox={`0 0 ${data.width} 44`} className={`${compact?"h-5":"h-14"} w-full`} preserveAspectRatio="none">{data.bars.map((bar,index)=><rect key={index} x={bar.x} y="0" width={bar.width} height="44" fill="black"/>)}</svg><p className="text-center tracking-[.2em]">{data.text}</p></div>}
 </article>;
}
export function ShippingPrintStyles({size}:{size:string}) {
 const [width,height]=size.split("x").map(Number);
 return <style media="print">{`@page{size:${width}mm ${height}mm;margin:0}
 html,body{width:${width}mm!important;min-width:${width}mm!important;margin:0!important;padding:0!important;background:white!important}
 body *:has(#shipping-label-print-area){display:block!important;position:static!important;margin:0!important;padding:0!important;overflow:visible!important;height:auto!important;min-height:0!important;max-height:none!important;transform:none!important}
 body *:not(:has(#shipping-label-print-area)):not(#shipping-label-print-area):not(#shipping-label-print-area *){display:none!important}
 #shipping-label-print-area,#shipping-label-print-area *{visibility:visible!important;color:black!important}
 #shipping-label-print-area{display:block!important;position:static!important;margin:0!important;padding:0!important;max-height:none!important;overflow:visible!important}
 .shipping-label{break-after:page;break-inside:avoid;margin:0!important;box-shadow:none!important}
 .shipping-label:last-child{break-after:auto}
 `}</style>;
}
