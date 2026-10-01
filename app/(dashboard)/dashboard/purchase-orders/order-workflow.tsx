"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal, useFormStatus } from "react-dom";
import { CheckCircle2, Loader2, PackageCheck, Send, X } from "lucide-react";
import { toast } from "sonner";
import { setPurchaseOrderStatus } from "./actions";
import ReceiveForm from "./[id]/receive-form";
import type { PurchaseOrderListItem } from "./purchase-orders-client";

const primary = "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50";

export default function OrderWorkflow({ order, canUpdate }: { order: Pick<PurchaseOrderListItem,"id"|"status"|"po_number"|"items">; canUpdate: boolean }) {
  const [receiving, setReceiving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (receiving) dialog.current?.showModal(); }, [receiving]);
  const completed = order.status === "received";
  const step = completed ? 2 : order.status === "draft" ? 0 : 1;
  return <div className="mt-5 space-y-3 border-t border-slate-200 pt-4">
    {order.status !== "cancelled" && <ol aria-label="Order stages" className="flex items-center gap-1 text-[10px] font-semibold">{["Draft", "Sent", "Completed"].map((label, index) => <li key={label} aria-current={index === step ? "step" : undefined} className={`flex-1 rounded-lg px-2 py-2 text-center ${index <= step ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-400"}`}>{label}</li>)}</ol>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {canUpdate && order.status === "draft" && <form action={async data => {
      setError("");
      try { await setPurchaseOrderStatus(data); toast.success("Purchase order marked as sent."); }
      catch (error) { setError(error instanceof Error ? error.message : "Unable to send purchase order."); }
    }}><input type="hidden" name="id" value={order.id} /><input type="hidden" name="status" value="sent" /><SendButton /></form>}
    {canUpdate && (order.status === "sent" || order.status === "partial") && <button type="button" onClick={() => setReceiving(true)} className={primary}><PackageCheck size={17} />Receive Items</button>}
    {completed && <p className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"><CheckCircle2 size={17} />Completed</p>}
    {order.status === "cancelled" && <p className="rounded-xl bg-rose-50 px-4 py-3 text-center text-sm font-semibold text-rose-700">Cancelled</p>}
    {receiving && createPortal(<dialog ref={dialog} aria-label={`Receive ${order.po_number}`} onCancel={event => { event.preventDefault(); if (!busy) setReceiving(false); }}
      style={{width:"min(620px, calc(100vw - 2rem))",maxHeight:"90dvh"}} className="m-auto overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-950/30">
      <header className="flex items-center justify-between border-b border-slate-200 p-4"><div><p className="text-xs font-semibold uppercase text-teal-700">Receive purchase order</p><h2 className="font-bold text-slate-900">{order.po_number}</h2></div><button type="button" disabled={busy} aria-label="Close receive dialog" onClick={() => setReceiving(false)} className="rounded-lg p-2 hover:bg-slate-100"><X size={20} /></button></header>
      <ReceiveForm id={order.id} items={order.items} onBusyChange={setBusy} onReceived={() => setReceiving(false)} />
    </dialog>, document.body)}
  </div>;
}

function SendButton() {
  const {pending} = useFormStatus();
  return <button type="submit" disabled={pending} aria-busy={pending} className={primary}>{pending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}{pending ? "Sending…" : "Send Purchase Order"}</button>;
}
