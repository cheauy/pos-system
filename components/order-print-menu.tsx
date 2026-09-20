"use client";
import { useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Printer, ReceiptText, Truck, X } from "lucide-react";
const subscribe = () => () => {};
export default function OrderPrintMenu({ orderId, className }: { orderId: string; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const base = `/dashboard/orders/${encodeURIComponent(orderId)}`;
  return <>
    <button type="button" className={className} onClick={(event) => { event.stopPropagation(); dialog.current?.showModal(); }}><Printer size={15} />Print</button>
    {mounted && createPortal(<dialog ref={dialog} aria-label="Print order" className="m-auto w-[min(420px,90vw)] rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl backdrop:bg-black/40" onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">Print order</h2><button type="button" aria-label="Close print options" onClick={() => dialog.current?.close()}><X size={20} /></button></div>
      <p className="mb-4 text-sm text-slate-600">Choose a document to preview before printing.</p>
      <div className="grid gap-3">{[{ path: "shipping-label", label: "Print Shipping label", icon: Truck }, { path: "receipt", label: "Print Receipt", icon: ReceiptText }].map(({ path, label, icon: Icon }) => <a key={path} href={`${base}/${path}`} target="_blank" rel="noopener noreferrer" onClick={() => dialog.current?.close()} className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 font-semibold hover:bg-slate-50"><Icon size={20} />{label}</a>)}</div>
    </dialog>, document.body)}
  </>;
}
