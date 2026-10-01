"use client";
import {useRef, useState} from "react";
import {Loader2, PackageCheck} from "lucide-react";
import {toast} from "sonner";
import {receivePurchaseOrder} from "../actions";
type Item={id:string;product_name:string;sku:string|null;ordered_quantity:number;received_quantity:number;unit_cost:number};
export default function ReceiveForm({id,items,onReceived,onBusyChange}:{id:string;items:Item[];onReceived?:()=>void;onBusyChange?:(busy:boolean)=>void}) {
  const [qty,setQty]=useState<Record<string,number>>({});
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const lock=useRef(false);
  const outstanding=items.filter(item=>item.ordered_quantity>item.received_quantity);
  const receipts=outstanding.map(item=>({itemId:item.id,quantity:qty[item.id]||0})).filter(item=>item.quantity>0);
  const valid=receipts.length>0&&receipts.every(receipt=>Number.isInteger(receipt.quantity)&&receipt.quantity<=outstanding.find(item=>item.id===receipt.itemId)!.ordered_quantity-outstanding.find(item=>item.id===receipt.itemId)!.received_quantity);
  const complete=outstanding.length>0&&outstanding.every(item=>qty[item.id]===item.ordered_quantity-item.received_quantity);
  return <form onSubmit={async event=>{
    event.preventDefault();if(lock.current||!valid)return;
    lock.current=true;setBusy(true);onBusyChange?.(true);setError("");
    try{const data=new FormData();data.set("id",id);data.set("receipts",JSON.stringify(receipts));await receivePurchaseOrder(data);setQty({});toast.success(complete?"Purchase order completed.":"Stock received. The order is partially received.");onReceived?.();}
    catch(error){setError(error instanceof Error?error.message:"Unable to receive stock.");}
    finally{lock.current=false;setBusy(false);onBusyChange?.(false);}
  }} className="space-y-4 bg-white p-4">
    <div className="flex items-center justify-between gap-2"><h2 className="font-semibold text-slate-900">Receive stock</h2><button type="button" disabled={busy} onClick={()=>setQty(Object.fromEntries(outstanding.map(item=>[item.id,item.ordered_quantity-item.received_quantity])))} className="text-xs font-semibold text-teal-700">Receive all remaining</button></div>
    <p className="text-xs text-slate-500">Enter quantities that have arrived. Receiving every remaining item completes the order and updates stock.</p>
    <div className="divide-y divide-slate-100">{outstanding.map(item=><div key={item.id} className="flex items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-900">{item.product_name}</p><p className="text-xs text-slate-500">{item.sku||"No SKU"} · {item.received_quantity}/{item.ordered_quantity} received</p></div><input aria-label={`Receive ${item.product_name} ${item.sku||""}`} disabled={busy} type="number" min={0} step={1} max={item.ordered_quantity-item.received_quantity} value={qty[item.id]??""} onChange={event=>setQty(current=>({...current,[item.id]:Number(event.target.value)}))} placeholder="0" className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>)}</div>
    {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
    <button disabled={busy||!valid} aria-busy={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{busy?<Loader2 size={17} className="animate-spin"/>:<PackageCheck size={17}/>} {busy?"Receiving…":complete?"Receive & Complete":"Receive Items"}</button>
  </form>;
}
