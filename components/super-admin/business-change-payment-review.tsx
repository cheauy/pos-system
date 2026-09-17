"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, CircleAlert, Loader2, X } from "lucide-react";

import { reviewBusinessChangePayment } from "@/app/(super-admin)/super-admin/manual-payments/actions";
import { initialBusinessChangeReviewState } from "@/app/(super-admin)/super-admin/manual-payments/state";

type Props = {
  orderId: string;
  businessName: string;
  amount: number;
  currency: string;
  approvalBlockedReason?: string | null;
};

const REJECTION_REASONS = [
  {
    id: "payment_not_verified",
    label: "Payment could not be verified",
    message:
      "We could not verify this payment. Please check the payment and submit a clear payment proof again.",
  },
  {
    id: "proof_unclear",
    label: "Payment proof is unclear",
    message:
      "The payment proof is unclear or incomplete. Please upload a clear payment proof and submit again.",
  },
  {
    id: "details_mismatch",
    label: "Payment details do not match",
    message:
      "The payment amount or payment details do not match this request. Please correct the payment information and submit again.",
  },
] as const;

export default function BusinessChangePaymentReview({
  orderId,
  businessName,
  amount,
  currency,
  approvalBlockedReason = null,
}: Props) {
  const [state, formAction, pending] = useActionState(
    reviewBusinessChangePayment,
    initialBusinessChangeReviewState,
  );
  const [showRejectReasons, setShowRejectReasons] = useState(false);
  const [rejectionReasonId, setRejectionReasonId] = useState<string>("");
  const [confirmDecision, setConfirmDecision] = useState<"approve" | "reject" | null>(null);

  useEffect(() => {
    if (state.success) {
      setShowRejectReasons(false);
      setRejectionReasonId("");
      setConfirmDecision(null);
    }
  }, [state.success, state.reviewedAt]);

  const selectedReason = REJECTION_REASONS.find(
    (reason) => reason.id === rejectionReasonId,
  );

  return (
    <div className="min-w-[250px]">
      {state.message ? (
        <p
          className={`mb-3 rounded-xl px-3 py-2 text-xs font-semibold leading-5 ${
            state.success
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      {showRejectReasons ? (
        <div className="rounded-xl border border-red-100 bg-red-50/40 p-3">
          <div className="flex items-start gap-2">
            <CircleAlert size={16} className="mt-0.5 shrink-0 text-red-600" />
            <div>
              <p className="text-xs font-extrabold text-slate-900">
                Select a rejection message
              </p>
              <p className="mt-0.5 text-[10px] leading-4 text-slate-500">
                The selected message will be sent only to the owner who submitted this request.
              </p>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {REJECTION_REASONS.map((reason) => {
              const selected = rejectionReasonId === reason.id;
              return (
                <button
                  key={reason.id}
                  type="button"
                  disabled={pending}
                  onClick={() => setRejectionReasonId(reason.id)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-50 ${
                    selected
                      ? "border-red-300 bg-white ring-2 ring-red-100"
                      : "border-slate-200 bg-white hover:border-red-200"
                  }`}
                >
                  <span className="flex items-start gap-2.5">
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        selected
                          ? "border-red-600 bg-red-600"
                          : "border-slate-300 bg-white"
                      }`}
                    >
                      {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                    </span>
                    <span>
                      <span className="block text-[11px] font-bold text-slate-800">
                        {reason.label}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">
                        {reason.message}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending || !selectedReason}
              onClick={() => setConfirmDecision("reject")}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X size={14} />
              Continue
            </button>

            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setShowRejectReasons(false);
                setRejectionReasonId("");
              }}
              className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-white disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending || Boolean(approvalBlockedReason)}
            onClick={() => setConfirmDecision("approve")}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            title={approvalBlockedReason ?? undefined}
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {pending ? "Approving..." : "Approve"}
          </button>

          <button
            type="button"
            disabled={pending}
            onClick={() => setShowRejectReasons(true)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
          >
            <X size={14} />
            Reject
          </button>
        </div>
      )}

      {confirmDecision ? (
        <div
          className="fixed inset-0 z-[180] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pending) {
              setConfirmDecision(null);
            }
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
              confirmDecision === "reject"
                ? "bg-red-50 text-red-600"
                : "bg-emerald-50 text-emerald-600"
            }`}>
              {confirmDecision === "reject" ? <CircleAlert size={21} /> : <Check size={21} />}
            </div>

            <h3 className="mt-4 text-lg font-extrabold text-slate-950">
              {confirmDecision === "reject"
                ? `Reject ${businessName}'s submitted payment?`
                : `Approve ${businessName}'s ${currency} ${amount.toFixed(2)} payment?`}
            </h3>

            {confirmDecision === "reject" ? (
              <>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  This message will be sent only to the owner who submitted this request.
                </p>
                <div className="mt-3 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-semibold leading-6 text-red-800">
                  {selectedReason?.message}
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm leading-6 text-slate-600">
                The requested business changes will be applied after approval. Only the submitting owner will receive the notification.
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmDecision(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <form action={formAction}>
                <input type="hidden" name="orderId" value={orderId} />
                <input type="hidden" name="decision" value={confirmDecision} />
                <input
                  type="hidden"
                  name="reviewNote"
                  value={confirmDecision === "reject" ? selectedReason?.message ?? "" : ""}
                />
                <button
                  type="submit"
                  disabled={
                    pending ||
                    (confirmDecision === "reject" && !selectedReason) ||
                    (confirmDecision === "approve" && Boolean(approvalBlockedReason))
                  }
                  className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    confirmDecision === "reject"
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-emerald-600 hover:bg-emerald-700"
                  }`}
                >
                  {pending ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : confirmDecision === "reject" ? (
                    <X size={15} />
                  ) : (
                    <Check size={15} />
                  )}
                  {pending
                    ? "Saving..."
                    : confirmDecision === "reject"
                      ? "Reject & notify owner"
                      : "Approve & notify owner"}
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
