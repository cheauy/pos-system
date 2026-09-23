"use client";

import { useState } from "react";
import { FileCheck2, UploadCloud } from "lucide-react";
import { useFormStatus } from "react-dom";

import { submitSubscriptionPayment } from "../../actions";

export default function ManualPaymentProofForm({
  orderId,
  initialProofFileName,
  initialNote,
}: {
  orderId: string;
  initialProofFileName: string | null;
  initialNote: string | null;
}) {
  const [hasProof, setHasProof] = useState(Boolean(initialProofFileName));

  return (
    <form action={submitSubscriptionPayment} className="mt-4 space-y-4">
      <input type="hidden" name="orderId" value={orderId} />

      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <label
          htmlFor="manualPaymentProof"
          className="flex cursor-pointer items-start gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 transition hover:border-blue-400 hover:bg-blue-50/40 dark:border-slate-700 dark:bg-slate-950"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
            <UploadCloud size={19} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-extrabold text-slate-900 dark:text-white">
              Upload your receipt
            </span>
            <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">
              JPG, PNG, WEBP, or PDF · max 10 MB
            </span>
            {hasProof ? (
              <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                Receipt ready
              </span>
            ) : (
              <span className="mt-2 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                Receipt required before submit
              </span>
            )}
          </span>
        </label>
        <input
          id="manualPaymentProof"
          name="paymentProof"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          required={!initialProofFileName}
          onChange={(event) => setHasProof(Boolean(initialProofFileName) || Boolean(event.currentTarget.files?.length))}
          className="mt-3 block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-bold file:text-slate-700 dark:text-slate-400 dark:file:bg-slate-800 dark:file:text-slate-200"
        />
      </div>

      <div>
        <label
          htmlFor="manualPaymentNote"
          className="block text-sm font-semibold text-slate-700 dark:text-slate-300"
        >
          Additional note <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <textarea
          id="manualPaymentNote"
          name="paymentNote"
          maxLength={1000}
          rows={3}
          defaultValue={initialNote ?? ""}
          placeholder="Optional transfer details for the TENH team"
          className="mt-2 w-full resize-none rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
        <SubmitButton enabled={hasProof} />
      </div>
    </form>
  );
}

function SubmitButton({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  const disabled = !enabled || pending;

  return (
    <button
      type="submit"
      disabled={disabled}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
    >
      <FileCheck2 size={17} />
      {pending ? "Submitting..." : enabled ? "Submit payment proof" : "Upload receipt to continue"}
    </button>
  );
}
