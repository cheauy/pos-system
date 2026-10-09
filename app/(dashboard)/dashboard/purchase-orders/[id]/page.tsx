import Link from "next/link";
import {notFound} from "next/navigation";
import {ArrowLeft, CalendarDays, Package, ReceiptText} from "lucide-react";
import {requirePermission} from "@/lib/auth/require-permission";
import {businessHasPermission} from "@/lib/auth/effective-permissions";
import {createClient} from "@/lib/supabase/branch-server";
import OrderWorkflow from "../order-workflow";
import {setPurchaseOrderStatus} from "../actions";

const money=(value:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(value);
export default async function Page({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const [business,db]=await Promise.all([requirePermission("purchases.view"),createClient()]);
  const [canUpdate,canCancel,canCreate,orderResult,itemResult]=await Promise.all([businessHasPermission(business,"purchases.update"),businessHasPermission(business,"purchases.cancel"),businessHasPermission(business,"purchases.create"),
    db.from("purchase_orders").select("id,po_number,status,supplier_name,order_date,expected_date,reference_number,notes,total").eq("id",id).eq("business_id",business.id).maybeSingle(),
    db.from("purchase_order_items").select("id,purchase_order_id,product_name,sku,ordered_quantity,received_quantity,unit_cost").eq("purchase_order_id",id).eq("business_id",business.id).order("created_at"),
  ]);
  if(orderResult.error||itemResult.error)throw new Error("Unable to load this purchase order. Please try again.");
  const order=orderResult.data;if(!order)notFound();
  const items=(itemResult.data??[]).map(item=>({...item,unit_cost:Number(item.unit_cost)}));
  const title=order.status==="draft"?"Draft Order":order.status==="received"?"Completed Order":order.status==="partial"?"Partially Received Order":order.status==="cancelled"?"Cancelled Order":"Sent Order";
  const quantity=items.reduce((sum,item)=>sum+item.ordered_quantity,0),received=items.reduce((sum,item)=>sum+item.received_quantity,0);
  return <main className="mx-auto max-w-6xl space-y-4">
    <nav className="flex flex-wrap items-center justify-between gap-3 text-sm font-semibold"><Link href="/dashboard/purchase-orders" className="inline-flex items-center gap-2 text-slate-500 hover:text-teal-700"><ArrowLeft size={17}/>Purchase Orders</Link>{canCreate&&<Link href="/dashboard/purchase-orders?new=1" className="inline-flex items-center gap-2 text-teal-700"><ArrowLeft size={17}/>New Purchase Order</Link>}</nav>
    <header className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5"><span className="rounded-xl bg-teal-50 p-3 text-teal-700"><ReceiptText size={25}/></span><div><p className="text-xs font-semibold uppercase tracking-wide text-teal-700">{title}</p><h1 className="mt-1 text-xl font-bold text-slate-950">{order.po_number}</h1><p className="mt-1 text-sm text-slate-500">{order.supplier_name||"No supplier"}</p></div></header>
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-200 p-4"><h2 className="flex items-center gap-2 font-bold"><Package size={18} className="text-teal-700"/>Order Items</h2><span className="text-xs text-slate-500">{items.length} items · {quantity} units</span></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Product / SKU</th><th className="p-3 text-right">Cost</th><th className="p-3 text-center">Received</th><th className="p-3 text-right">Total</th></tr></thead><tbody className="divide-y divide-slate-100">{items.map(item=><tr key={item.id}><td className="p-3"><p className="font-semibold text-slate-900" data-i18n-ignore="true">{item.product_name}</p><p className="mt-1 text-xs text-slate-500" data-i18n-ignore={Boolean(item.sku)}>{item.sku||"No SKU"}</p></td><td className="p-3 text-right">{money(item.unit_cost)}</td><td className="p-3 text-center">{item.received_quantity} / {item.ordered_quantity}</td><td className="p-3 text-right font-semibold">{money(item.unit_cost*item.ordered_quantity)}</td></tr>)}</tbody></table></div>
        <div className="flex justify-between border-t border-slate-200 bg-slate-50 p-4 font-bold"><span>Order total</span><span>{money(Number(order.total))}</span></div>
        {order.notes&&<div className="border-t border-slate-200 p-4"><h3 className="text-xs font-semibold uppercase text-slate-500">Notes</h3><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700" data-i18n-ignore="true">{order.notes}</p></div>}
      </section>
      <aside className="rounded-2xl border border-slate-200 bg-white p-4 lg:sticky lg:top-[calc(var(--workspace-header-h,72px)+1rem)] xl:top-4"><h2 className="flex items-center gap-2 font-bold"><CalendarDays size={18} className="text-teal-700"/>Order Summary</h2><dl className="mt-4 space-y-3 text-sm">{[["Order date",order.order_date],["Expected date",order.expected_date||"Not set"],["Reference",order.reference_number||"—"],["Stock received",`${received} / ${quantity}`]].map(([label,value])=><div key={label} className="flex justify-between gap-3"><dt className="text-slate-500">{label}</dt><dd className="text-right font-medium">{value}</dd></div>)}</dl>
        <OrderWorkflow order={{...order,items}} canUpdate={canUpdate}/>
        {canCancel&&["draft","sent"].includes(order.status)&&<form action={setPurchaseOrderStatus} className="mt-3"><input type="hidden" name="id" value={id}/><input type="hidden" name="status" value="cancelled"/><button className="w-full rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">Cancel Order</button></form>}
      </aside>
    </div>
  </main>;
}
