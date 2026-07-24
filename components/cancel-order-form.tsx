"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Ban,
  X,
} from "lucide-react";

import { cancelOrder } from "@/app/(dashboard)/dashboard/orders/actions";

type CancelOrderFormProps = {
  orderId: string;
  orderNumber: string;
};

export default function CancelOrderForm({
  orderId,
  orderNumber,
}: CancelOrderFormProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex h-12 min-w-[170px]
    items-center justify-center gap-2
    rounded-xl
    border border-red-300
    bg-red-50
    px-6
    font-semibold
    text-amber-700
    transition
    hover:bg-amber-100
    hover:border-amber-400"
      >
        <Ban size={18} />
        Cancel Order
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-200 p-6">
              <div className="flex gap-3">
                <div className="rounded-xl bg-red-50 p-3 text-red-600">
                  <AlertTriangle size={22} />
                </div>

                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Cancel order
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Order {orderNumber}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
                aria-label="Close"
              >
                <X size={19} />
              </button>
            </div>

            <form
              action={cancelOrder}
              className="p-6"
            >
              <input
                type="hidden"
                name="orderId"
                value={orderId}
              />

              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                Cancelling this order will restore all
                product quantities to inventory. This
                action cannot be reversed from this page.
              </div>

              <label
                htmlFor="reason"
                className="mt-5 block text-sm font-medium text-slate-700"
              >
                Cancellation reason
              </label>

              <textarea
                id="reason"
                name="reason"
                rows={3}
                placeholder="Example: Customer changed their mind"
                className="mt-2 w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-100"
              />

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Keep Order
                </button>

                <button
                  type="submit"
                  className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
                >
                  Confirm Cancellation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}