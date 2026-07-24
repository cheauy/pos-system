"use client";

import {
  useActionState,
  useEffect,
  useState,
} from "react";

import {
  AlertCircle,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Loader2,
  X,
} from "lucide-react";

import {
  cancelPurchase,
  type CancelPurchaseState,
} from "../actions";

type CancelPurchaseFormProps = {
  purchaseId: string;
  purchaseNumber: string;
};

const initialState: CancelPurchaseState = {
  success: false,
  message: "",
};

export default function CancelPurchaseForm({
  purchaseId,
  purchaseNumber,
}: CancelPurchaseFormProps) {
  const [isOpen, setIsOpen] =
    useState(false);

  const [state, formAction, isPending] =
    useActionState(
      cancelPurchase,
      initialState,
    );

  useEffect(() => {
    if (!state.success) {
      return;
    }

    const timer = window.setTimeout(() => {
      setIsOpen(false);
      window.location.reload();
    }, 1000);

    return () =>
      window.clearTimeout(timer);
  }, [state.success]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-5 py-3 font-semibold text-red-600 transition hover:bg-red-50"
      >
        <Ban size={18} />
        Cancel Purchase
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-200 p-6">
              <div className="flex gap-3">
                <div className="rounded-xl bg-red-50 p-3 text-red-600">
                  <AlertTriangle size={22} />
                </div>

                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    Cancel Purchase
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    {purchaseNumber}
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={isPending}
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 disabled:opacity-50"
              >
                <X size={19} />
              </button>
            </div>

            <form
              action={formAction}
              className="p-6"
            >
              <input
                type="hidden"
                name="purchaseId"
                value={purchaseId}
              />

              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                Cancelling this purchase will
                remove all purchased quantities
                from inventory. It cannot continue
                when any product has insufficient
                stock.
              </div>

              {state.message && (
                <div
                  className={`mt-5 flex items-start gap-3 rounded-xl border p-4 text-sm ${
                    state.success
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-red-200 bg-red-50 text-red-800"
                  }`}
                >
                  {state.success ? (
                    <CheckCircle2
                      size={20}
                      className="mt-0.5 shrink-0"
                    />
                  ) : (
                    <AlertCircle
                      size={20}
                      className="mt-0.5 shrink-0"
                    />
                  )}

                  <p>{state.message}</p>
                </div>
              )}

              <div className="mt-5">
                <label
                  htmlFor="reason"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Cancellation reason
                </label>

                <textarea
                  id="reason"
                  name="reason"
                  required
                  minLength={3}
                  rows={4}
                  disabled={isPending}
                  placeholder="Example: Incorrect products received from supplier"
                  className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-100 disabled:bg-slate-100"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    setIsOpen(false)
                  }
                  className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Keep Purchase
                </button>

                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-3 font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending && (
                    <Loader2
                      size={18}
                      className="animate-spin"
                    />
                  )}

                  {isPending
                    ? "Cancelling..."
                    : "Confirm Cancellation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}