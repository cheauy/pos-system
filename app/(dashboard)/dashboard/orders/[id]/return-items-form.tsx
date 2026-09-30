"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, ChevronDown, CircleDollarSign, CircleHelp, Coins, CreditCard, FileText, Info, Loader2, Minus, Package, Plus, RotateCcw, Tag, X } from "lucide-react";

import { createOrderReturn, type CreateReturnState } from "./return-actions";

type OrderItem = {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  returned_quantity: number;
  image_url?: string | null;
  sku?: string | null;
};

type ReturnItemsFormProps = {
  orderId: string;
  orderNumber: string;
  items: OrderItem[];
  triggerClassName?: string;
  onReturned?: () => void;
  currency?: string;
};

const initialState: CreateReturnState = { success: false, message: "" };
const REASONS = ["Incorrect Size or Fit", "Defective or Damaged", "Not as Described", "Wrong Item Sent", "Buyer's Remorse / Changed Mind", "Other"];
const NOTE_LIMIT = 200;
const field = "w-full appearance-none rounded-xl border border-slate-300 bg-white py-3 pl-12 pr-10 text-sm text-slate-900 outline-none transition focus:border-amber-500 focus:ring-4 focus:ring-amber-100 disabled:bg-slate-100";

export default function ReturnItemsForm({ orderId, orderNumber, items, triggerClassName, onReturned, currency = "USD" }: ReturnItemsFormProps) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const handledReturn = useRef<string | null>(null);
  const formatCurrency = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);

  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [state, formAction, isPending] = useActionState(createOrderReturn, initialState);

  const returnableItems = items.filter(item => item.quantity - item.returned_quantity > 0);
  const selectedItems = useMemo(() => returnableItems
    .map(item => ({ order_item_id: item.id, quantity: quantities[item.id] ?? 0 }))
    .filter(item => item.quantity > 0), [quantities, returnableItems]);
  const refundTotal = useMemo(() => returnableItems.reduce((total, item) => total + (quantities[item.id] ?? 0) * Number(item.unit_price), 0), [quantities, returnableItems]);
  const baseReason = reason === "Other" ? otherReason.trim() : reason;
  // Returns store one reason field; the optional staff note is appended to it.
  const submittedReason = (note ?? "").trim() ? `${baseReason} — Note: ${(note ?? "").trim()}` : baseReason;

  useEffect(() => {
    if (!state.success || !state.returnId || handledReturn.current === state.returnId) return;
    handledReturn.current = state.returnId;
    setIsOpen(false);
    setQuantities({});
    setReason("");
    setOtherReason("");
    setNote("");
    toast.success("Items returned. Refund recorded.", { position: "top-right" });
    onReturned?.();
    router.refresh();
  }, [state.success, state.returnId, router, onReturned]);

  useEffect(() => {
    if (!isOpen || !dialog.current) return;
    const element = dialog.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal();
    return () => { element.close(); trigger?.focus(); };
  }, [isOpen]);

  function updateQuantity(item: OrderItem, value: number) {
    const maximum = item.quantity - item.returned_quantity;
    const safeValue = Math.min(Math.max(Number.isFinite(value) ? Math.trunc(value) : 0, 0), maximum);
    setQuantities(current => ({ ...current, [item.id]: safeValue }));
  }

  function closeModal() {
    if (isPending) return;
    setIsOpen(false);
    setQuantities({});
    setReason("");
    setOtherReason("");
    setNote("");
  }

  if (returnableItems.length === 0) {
    return <span className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-500">All items returned</span>;
  }

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}
        className={triggerClassName ?? "inline-flex h-12 min-w-[170px] items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-6 font-semibold text-amber-700 transition hover:border-amber-400 hover:bg-amber-100"}>
        <RotateCcw size={18} />
        Return Items
      </button>

      {isOpen && createPortal(
        <dialog ref={dialog} aria-label="Return items" onCancel={event => { event.preventDefault(); closeModal(); }}
          className="m-auto max-h-[94dvh] w-[min(96vw,1120px)] max-w-none rounded-3xl border-0 p-0 text-slate-900 backdrop:bg-slate-950/50">
          <form action={formAction} className="flex max-h-[94dvh] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="items" value={JSON.stringify(selectedItems)} />
            <input type="hidden" name="reason" value={submittedReason} />

            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
              <div className="flex items-center gap-4">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><Package size={26} /></span>
                <div>
                  <h2 className="text-2xl font-bold">Return Items</h2>
                  <p className="mt-0.5 text-slate-500">Order {orderNumber}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="text-right">
                  <span className="inline-flex items-center gap-3 rounded-full bg-amber-50 px-4 py-1.5 text-sm">
                    <span className="flex items-center gap-2 font-semibold text-amber-800"><span className="h-2.5 w-2.5 rounded-full bg-amber-600" />Original sale</span>
                    <span className="text-slate-600">{orderNumber}</span>
                  </span>
                  <p className="mt-1.5 text-sm text-slate-500">Process a return for items in this order.</p>
                </div>
                <button type="button" disabled={isPending} onClick={closeModal} aria-label="Close return form"
                  className="rounded-xl bg-slate-100 p-2.5 text-slate-600 transition hover:bg-slate-200 disabled:opacity-50"><X size={20} /></button>
              </div>
            </header>

            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto bg-slate-50/60 p-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
              <section className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
                  <div><h3 className="text-xl font-bold">Items to Return</h3><p className="mt-0.5 text-sm text-slate-500">Select the quantity to return for each item.</p></div>
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">{returnableItems.length} {returnableItems.length === 1 ? "item" : "items"}</span>
                </div>

                {state.message && !state.success && <div role="alert" className="mx-5 mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle size={20} className="mt-0.5 shrink-0" /><p>{state.message}</p></div>}

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[660px]">
                    <thead className="bg-slate-50">
                      <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                        <th className="px-5 py-3">Product</th><th className="px-3 py-3 text-center">Sold</th><th className="px-3 py-3 text-center">Returned</th>
                        <th className="px-3 py-3 text-center">Available</th><th className="px-3 py-3 text-center">Return Qty</th><th className="px-5 py-3 text-right">Refund</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {returnableItems.map(item => {
                        const available = item.quantity - item.returned_quantity;
                        const selectedQuantity = quantities[item.id] ?? 0;
                        return <tr key={item.id}>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              {item.image_url
                                ? <img src={item.image_url} alt="" className="h-16 w-16 shrink-0 rounded-lg bg-slate-100 object-cover" />
                                : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400"><Package size={22} /></span>}
                              <div className="min-w-0">
                                <p className="font-semibold">{item.product_name}</p>
                                <p className="text-sm text-slate-600">{formatCurrency(Number(item.unit_price))} each</p>
                                {item.sku && <p className="text-xs text-slate-500">SKU: {item.sku}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-4 text-center">{item.quantity}</td>
                          <td className="px-3 py-4 text-center">{item.returned_quantity}</td>
                          <td className="px-3 py-4 text-center font-semibold">{available}</td>
                          <td className="px-3 py-4">
                            <div className="mx-auto flex w-fit items-center overflow-hidden rounded-lg border border-slate-300">
                              <button type="button" aria-label={`Return one fewer ${item.product_name}`} disabled={isPending || selectedQuantity <= 0} onClick={() => updateQuantity(item, selectedQuantity - 1)} className="flex h-10 w-10 items-center justify-center text-slate-600 hover:bg-slate-50 disabled:text-slate-300"><Minus size={16} /></button>
                              <input type="number" min="0" max={available} step="1" inputMode="numeric" aria-label={`Return quantity for ${item.product_name}`} disabled={isPending} value={selectedQuantity}
                                onChange={event => updateQuantity(item, Number(event.target.value))}
                                className="h-10 w-14 border-x border-slate-300 text-center outline-none [appearance:textfield] focus:bg-amber-50 [&::-webkit-inner-spin-button]:appearance-none" />
                              <button type="button" aria-label={`Return one more ${item.product_name}`} disabled={isPending || selectedQuantity >= available} onClick={() => updateQuantity(item, selectedQuantity + 1)} className="flex h-10 w-10 items-center justify-center text-slate-600 hover:bg-slate-50 disabled:text-slate-300"><Plus size={16} /></button>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-right font-semibold">{formatCurrency(selectedQuantity * Number(item.unit_price))}</td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                </div>

                <p className="m-5 mt-auto flex items-start gap-3 rounded-xl bg-blue-50 px-4 py-3 text-sm text-slate-700"><Info size={18} className="mt-0.5 shrink-0 text-blue-600" />Only items from this order can be returned. The maximum return quantity is the available quantity.</p>
              </section>

              <section className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700"><CircleDollarSign size={24} /></span>
                  <div><h3 className="text-xl font-bold">Return Details</h3><p className="mt-0.5 text-sm text-slate-500">Choose how the refund is paid and provide a reason.</p></div>
                </div>

                <label className="block text-sm">
                  <span className="mb-2 flex justify-between font-semibold">Refund payment method<span className="font-normal text-slate-500">Required</span></span>
                  <span className="relative block">
                    <CreditCard size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                    <select name="refundMethod" disabled={isPending} required defaultValue="" className={field}>
                      <option value="" disabled>Choose how the refund is paid</option><option value="cash">Cash from register</option><option value="bank_transfer">Bank transfer</option><option value="other">Other non-cash payment</option>
                    </select>
                    <ChevronDown size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-600" />
                  </span>
                  <span className="mt-1.5 block text-xs text-slate-500">Cash refunds use the open register at the original sale branch.</span>
                </label>

                <label className="block text-sm">
                  <span className="mb-2 flex justify-between font-semibold">Return reason<span className="font-normal text-slate-500">Required</span></span>
                  <span className="relative block">
                    <Tag size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                    <select id="return-reason" name="reasonChoice" required value={reason} disabled={isPending} onChange={event => setReason(event.target.value)} className={field}>
                      <option value="" disabled>Choose a reason</option>
                      {REASONS.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                    <ChevronDown size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-600" />
                  </span>
                </label>
                {reason === "Other" && <label className="-mt-2 block text-sm">
                  <span className="mb-2 block font-semibold">Please specify</span>
                  <textarea id="other-return-reason" name="otherReason" required minLength={3} rows={2} value={otherReason} onChange={event => setOtherReason(event.target.value)} disabled={isPending}
                    placeholder="Enter the return reason" className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100 disabled:bg-slate-100" />
                </label>}

                <label className="block border-t border-slate-200 pt-5 text-sm">
                  <span className="mb-2 block"><span className="font-semibold">Additional note</span> <span className="text-slate-500">(optional)</span></span>
                  <span className="relative block">
                    <FileText size={20} className="pointer-events-none absolute left-4 top-3.5 text-slate-500" />
                    <textarea rows={3} maxLength={NOTE_LIMIT} value={note ?? ""} onChange={event => setNote(event.target.value)} disabled={isPending} placeholder="Add a note (visible to staff only)"
                      className="w-full resize-none rounded-xl border border-slate-300 py-3 pl-12 pr-4 pb-7 outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100 disabled:bg-slate-100" />
                    <span className="absolute bottom-2.5 right-4 text-xs text-slate-500">{(note ?? "").length}/{NOTE_LIMIT}</span>
                  </span>
                </label>

                <div className="mt-auto flex items-center gap-4 rounded-2xl bg-amber-50 p-4">
                  <Coins size={32} className="shrink-0 text-amber-700" />
                  <div className="min-w-0 flex-1"><p className="text-lg font-bold text-amber-800">Refund Total</p><p className="text-sm text-slate-600">This amount will be refunded to the customer.</p></div>
                  <span className="text-3xl font-bold text-amber-700">{formatCurrency(refundTotal)}</span>
                </div>
              </section>
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
              <p className="flex items-center gap-2 text-sm text-slate-600"><CircleHelp size={18} /><span><span className="font-semibold text-slate-800">Need help?</span> Returns follow the store&apos;s return policy.</span></p>
              <div className="flex gap-3">
                <button type="button" disabled={isPending} onClick={closeModal} className="rounded-xl border border-slate-300 px-8 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={isPending || selectedItems.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-6 py-3 font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50">
                  {isPending ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                  {isPending ? "Processing..." : "Confirm Return"}
                </button>
              </div>
            </footer>
          </form>
        </dialog>, document.body,
      )}
    </>
  );
}
