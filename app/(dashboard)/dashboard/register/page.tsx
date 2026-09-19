import { Banknote, CircleDollarSign, LockKeyhole, UnlockKeyhole } from "lucide-react";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { addCashMovement, closeRegisterShift, openRegisterShift } from "./actions";

export default async function RegisterPage() {
  const business = await requirePermission("register.manage");
  const supabase = await createClient();
  const { data: locations } = await supabase.from("business_locations").select("id,name,code").eq("business_id", business.id).eq("is_active", true).order("is_default", { ascending: false });
  const { data: shifts } = await supabase.from("cash_register_shifts").select("id,status,opening_cash,closing_cash,expected_cash,variance,opened_at,closed_at,location_id").eq("business_id", business.id).order("opened_at", { ascending: false }).limit(50);
  const { data: movements } = await supabase.from("cash_movements").select("id,shift_id,movement_type,amount,reason,created_at").eq("business_id", business.id).order("created_at", { ascending: false }).limit(100);
  const { data: shiftOrders } = await supabase.from("orders").select("register_shift_id,payment_method,total,amount_paid,change_amount,status,pos_checkout").eq("business_id", business.id).not("register_shift_id", "is", null).order("created_at", { ascending: false }).limit(1000);
  const openShift = shifts?.find((s) => s.status === "open") ?? null;
  const openMovements = (movements ?? []).filter((m) => m.shift_id === openShift?.id);
  const cashIn = openMovements.filter((m) => m.movement_type === "cash_in").reduce((s,m)=>s+Number(m.amount),0);
  const cashOut = openMovements.filter((m) => m.movement_type === "cash_out").reduce((s,m)=>s+Number(m.amount),0);
  const openOrders = (shiftOrders ?? []).filter((o) => o.register_shift_id === openShift?.id);
  const cashSales = openOrders.filter((o) => o.status === "completed").reduce((sum,o) => sum + cashPortion(o), 0);
  const nonCashSales = openOrders.filter((o) => o.status === "completed").reduce((sum,o) => sum + (o.pos_checkout ? Math.max(0,Number(o.amount_paid??0)-Number(o.change_amount??0)-cashPortion(o)) : o.payment_method !== "cod" ? Number(o.total??0) : 0), 0);
  const refunds = openOrders.filter((o) => o.status === "refunded").reduce((s,o)=>s+Number(o.total??0),0);
  return <main className="space-y-6">
    <div><h1 className="text-3xl font-bold text-slate-900">Staff Shifts & Cash Register</h1><p className="mt-1 text-slate-500">Open a drawer, track cash movements, and close with an expected-vs-actual count.</p></div>
    {!openShift ? <section className="max-w-xl rounded-2xl border bg-white p-6 shadow-sm"><div className="mb-5 flex items-center gap-3"><UnlockKeyhole className="text-emerald-600"/><h2 className="text-xl font-semibold">Open Register</h2></div><form action={openRegisterShift} className="space-y-4"><select name="locationId" required className={input}><option value="">Choose branch</option>{(locations??[]).map(l=><option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}</select><input name="openingCash" type="number" min="0" step="0.01" defaultValue="0" className={input} placeholder="Opening cash"/><textarea name="note" className={input} placeholder="Opening note (optional)"/><button className={primary}><UnlockKeyhole size={18}/> Open Shift</button></form></section> : <div className="grid gap-6 xl:grid-cols-2">
      <section className="rounded-2xl border bg-white p-6 shadow-sm"><h2 className="text-xl font-semibold">Open Shift</h2><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3"><Card label="Opening" value={money(openShift.opening_cash)}/><Card label="Cash Sales" value={money(cashSales)}/><Card label="Non-cash Sales" value={money(nonCashSales)}/><Card label="Cash In" value={money(cashIn)}/><Card label="Cash Out" value={money(cashOut)}/><Card label="Refunds" value={money(refunds)}/></div><form action={addCashMovement} className="mt-6 grid gap-3 sm:grid-cols-2"><input type="hidden" name="shiftId" value={openShift.id}/><select name="type" className={input}><option value="cash_in">Cash In</option><option value="cash_out">Cash Out</option></select><input name="amount" type="number" min="0.01" step="0.01" required className={input} placeholder="Amount"/><input name="reason" required className={input} placeholder="Reason"/><input name="reference" className={input} placeholder="Reference (optional)"/><button className={primary}><CircleDollarSign size={18}/> Record Movement</button></form></section>
      <section className="rounded-2xl border bg-white p-6 shadow-sm"><div className="flex items-center gap-2"><LockKeyhole className="text-slate-600"/><h2 className="text-xl font-semibold">Close Register</h2></div><p className="mt-2 text-sm text-slate-500">Count the physical cash. TENH calculates expected cash and the over/short variance server-side.</p><form action={closeRegisterShift} className="mt-5 space-y-3"><input type="hidden" name="shiftId" value={openShift.id}/><input name="closingCash" type="number" min="0" step="0.01" required className={input} placeholder="Actual counted cash"/><textarea name="note" className={input} placeholder="Closing note"/><button className={primary}><Banknote size={18}/> Close & Calculate</button></form></section>
    </div>}
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="border-b px-5 py-4"><h2 className="font-semibold">Shift History / Z Report</h2></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-3">Opened</th><th className="p-3">Status</th><th className="p-3">Opening</th><th className="p-3">Expected</th><th className="p-3">Actual</th><th className="p-3">Over / Short</th><th className="p-3">Payments</th></tr></thead><tbody>{(shifts??[]).map(s=>{const so=(shiftOrders??[]).filter(o=>o.register_shift_id===s.id&&o.status==="completed"); const breakdown=so.reduce<Record<string,number>>((a,o)=>{const meta=o.pos_checkout as PosTenderMetadata|null;
if (meta && Array.isArray(meta.tenders)) { for (const tender of meta.tenders) { const k=tender.method||"unknown"; a[k]=(a[k]??0)+Number(tender.amount??0); } if(Number(o.change_amount??0)>0) a.cash=Math.max(0,(a.cash??0)-Number(o.change_amount)); if(meta.method==="credit")a.credit=(a.credit??0)+Number(o.total??0); }
else { const k=o.payment_method||"unknown";a[k]=(a[k]??0)+Number(o.total??0); } return a;},{}); return <tr key={s.id} className="border-t"><td className="p-3">{new Date(s.opened_at).toLocaleString()}</td><td className="p-3 capitalize">{s.status}</td><td className="p-3">{money(s.opening_cash)}</td><td className="p-3">{s.expected_cash==null?"—":money(s.expected_cash)}</td><td className="p-3">{s.closing_cash==null?"—":money(s.closing_cash)}</td><td className="p-3 font-semibold">{s.variance==null?"—":money(s.variance)}</td><td className="p-3 text-xs text-slate-500">{Object.entries(breakdown).map(([k,v])=>`${k.replaceAll("_"," ")}: ${money(v)}`).join(" · ")||"—"}</td></tr>})}</tbody></table></div></section>
  </main>;
}
const input="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500";
const primary="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700";
function money(v: unknown){return `$${Number(v??0).toFixed(2)}`}
function Card({label,value}:{label:string;value:string}){return <div className="rounded-xl bg-slate-50 p-4"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-bold">{value}</div></div>}

type PosTenderMetadata = { cashReceived?: number; method?: string; tenders?: Array<{ method: string; amount: number }> };
function cashPortion(order: { payment_method: string | null; amount_paid: unknown; pos_checkout?: unknown }): number {
  const meta = order.pos_checkout as PosTenderMetadata | null | undefined;
  return meta ? Math.max(0, Number(meta.cashReceived ?? 0)) : order.payment_method === "cod" ? Number(order.amount_paid ?? 0) : 0;
}
