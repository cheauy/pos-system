"use client";

import { useState, type ComponentType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertTriangle, Ban, Loader2, X } from "lucide-react";

import { cancelOrderWorkspaceOrder } from "@/app/(dashboard)/dashboard/orders/order-workspace-actions";
import { updateOnlineOrderStatus } from "@/app/(dashboard)/dashboard/online-orders/actions";

type CancelOrderFormProps = {
  orderId: string;
  orderNumber: string;
  businessId: string;
  updatedAt: string | null;
  /** Online/QR orders are cancelled through the online "reject" flow. */
  online?: boolean;
  className?: string;
  onCancelled?: (message: string) => void;
  onDiscardRequest?: (discard: () => void) => void;
  modal?: ComponentType<{ title: string; locked: boolean; onClose: () => void; children: ReactNode }>;
};

export default function CancelOrderForm({ orderId, orderNumber, businessId, updatedAt, online = false, className, onCancelled, modal: Dialog, onDiscardRequest }: CancelOrderFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function close() {
    if (busy) return;
    if (onDiscardRequest && reason) onDiscardRequest(() => setOpen(false)); else setOpen(false);
  }

  async function submit() {
    if (busy || !reason.trim() || !updatedAt) return;
    setBusy(true); setError("");
    try {
      const result = online ? await updateOnlineOrderStatus(orderId, "rejected", updatedAt) : await cancelOrderWorkspaceOrder(orderId, updatedAt, reason, businessId);
      if (!result.success) { setError(result.message); return; }
      setOpen(false); setReason("");
      onCancelled?.(result.message || `Order ${orderNumber} cancelled.`);
      router.refresh();
    } catch {
      setError("The result could not be confirmed. Refresh this order before trying again.");
    } finally { setBusy(false); }
  }

  const content = (
      <div role={Dialog ? undefined : "dialog"} aria-modal={Dialog ? undefined : true} aria-labelledby={`cancel-${orderId}`} className="w-full max-w-md rounded-2xl bg-white text-left shadow-xl" onMouseDown={event => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-200 p-5">
          <div className="flex gap-3">
            <div className="rounded-xl bg-red-50 p-3 text-red-600"><AlertTriangle size={22} /></div>
            <div><h2 id={`cancel-${orderId}`} className="text-lg font-bold text-slate-900">Cancel order</h2><p className="mt-1 text-sm text-slate-500">Order <span data-i18n-ignore="true">{orderNumber}</span></p></div>
          </div>
          <button type="button" disabled={busy} onClick={close} className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100" aria-label="Close"><X size={19} /></button>
        </div>
        <div className="p-5">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {online ? "The customer's online order is rejected and its stock is released." : "All product quantities are restored to inventory."} This cannot be undone.
          </div>
          <label htmlFor={`cancel-reason-${orderId}`} className="mt-5 block text-sm font-medium text-slate-700">Cancellation reason</label>
          <textarea id={`cancel-reason-${orderId}`} rows={3} maxLength={500} value={reason} disabled={busy} onChange={event => setReason(event.target.value)}
            placeholder="Example: Customer changed their mind"
            className="mt-2 w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-100" />
          {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" disabled={busy} onClick={close} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Keep Order</button>
            <button type="button" disabled={busy || !reason.trim() || !updatedAt} onClick={() => void submit()} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50">
              {busy && <Loader2 size={16} className="animate-spin" />}Confirm Cancellation
            </button>
          </div>
        </div>
      </div>
  );

  return <>
    <button type="button" onClick={() => { setError(""); setOpen(true); }}
      className={className ?? "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 text-sm font-semibold text-red-600 transition hover:bg-red-100"}>
      <Ban size={17} />Cancel Order
    </button>
    {open && (Dialog ? <Dialog title="Cancel order" locked={busy} onClose={close}>{content}</Dialog> : createPortal(<div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={close}>
      {content}

    </div>, document.body))}
  </>;
}
