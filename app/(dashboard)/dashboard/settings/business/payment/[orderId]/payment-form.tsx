"use client";

import { useRef, useState, type FormEvent } from "react";
import { RefreshCw } from "lucide-react";
import { submitBusinessChangePaymentReference, type BusinessChangePaymentResult } from "../../actions";

type Props = {
  orderId: string;
  paymentReference: string | null;
  paymentNote: string | null;
  hasProof: boolean;
  proofFileName: string | null;
  submitted: boolean;
};

export default function BusinessChangePaymentForm({ orderId, paymentReference, paymentNote, hasProof, proofFileName, submitted }: Props) {
  const [result, setResult] = useState<BusinessChangePaymentResult | null>(null);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const proof = data.get("paymentProof");
    if (proof instanceof File && proof.size > 10 * 1024 * 1024) {
      setResult({ success: false, field: "paymentProof", message: "Payment proof must be 10 MB or smaller." });
      return;
    }
    submitting.current = true;
    setPending(true);
    setResult(null);
    try {
      const response = await submitBusinessChangePaymentReference(data);
      setResult(response);
      if (response.field) {
        const field = form.elements.namedItem(response.field);
        if (field instanceof HTMLElement) field.focus();
      }
    } catch {
      setResult({ success: false, message: "Unable to submit payment details. Check your connection and try again. If your session expired, sign in again." });
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  // Keep the chosen proof file and text fields in place when validation fails.
  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-4" aria-busy={pending}>
      <input type="hidden" name="orderId" value={orderId} />

      <div>
        <label htmlFor="paymentReference" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Payment / transaction reference *</label>
        <input id="paymentReference" name="paymentReference" type="text" required minLength={2} maxLength={120} defaultValue={paymentReference ?? ""} placeholder="Reference from your payment receipt" aria-invalid={result?.field === "paymentReference"} aria-describedby={result?.field === "paymentReference" ? "payment-result" : "payment-reference-help"} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
        <p id="payment-reference-help" className="mt-2 text-xs text-slate-500">Enter the transaction ID or reference shown on your payment receipt.</p>
      </div>
      <div>
        <label
          htmlFor="paymentNote"
          className="block text-sm font-semibold text-slate-700 dark:text-slate-300"
        >
          Note *
        </label>
        <textarea
          id="paymentNote"
          name="paymentNote"
          aria-invalid={result?.field === "paymentNote"}
          aria-describedby={result?.field === "paymentNote" ? "payment-result" : undefined}
          required
          minLength={2}
          maxLength={1000}
          rows={4}
          defaultValue={paymentNote ?? ""}
          placeholder="Add a note for TENH payment review"
          className="mt-2 w-full resize-none rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-blue-950/50"
        />
      </div>

      <div>
        <label
          htmlFor="paymentProof"
          className="block text-sm font-semibold text-slate-700 dark:text-slate-300"
        >
          Payment proof *
        </label>
        <input
          id="paymentProof"
          name="paymentProof"
          aria-invalid={result?.field === "paymentProof"}
          aria-describedby={result?.field === "paymentProof" ? "payment-result" : undefined}
          type="file"
          required={!hasProof}
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="mt-2 block w-full rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-xs file:font-bold file:text-blue-700 hover:file:bg-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
        />
        <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
          JPG, PNG, WEBP or PDF · maximum 10 MB.
          {hasProof && proofFileName
            ? ` Current proof: ${proofFileName}. Upload another file only if you want to replace it.`
            : " Proof is required before TENH can review this payment."}
        </p>
      </div>

      {result && <p id="payment-result" role={result.success ? "status" : "alert"} className={`rounded-xl p-3 text-sm ${result.success ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{result.message}</p>}
      <button
        disabled={pending}
        type="submit"
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw size={16} className={pending ? "animate-spin" : undefined} />
        {pending ? "Submitting…" : submitted
          ? "Update payment submission"
          : "Submit payment for review"}
      </button>
    </form>
  );
}
