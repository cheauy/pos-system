"use client";

import { useActionState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { reactivateCurrentSubscription } from "./actions";

export default function ReactivateButton({ businessId, billingTerm }: { businessId: string; billingTerm?: string }) {
  const [state, action, pending] = useActionState(reactivateCurrentSubscription, { error: null });
  return (
    <form action={action}>
      <input type="hidden" name="expectedBusinessId" value={businessId} />
      <button type="submit" disabled={pending} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-red-800 disabled:cursor-wait disabled:opacity-60">
        {pending ? "Opening payment…" : "Reactivate"}
        {pending ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowRight size={16} />}
      </button>
      {billingTerm ? <p className="mt-1 text-xs text-slate-600">{billingTerm} · Change term at checkout</p> : null}
      {state.error ? <p role="alert" className="mt-2 max-w-sm text-sm text-red-700">{state.error}</p> : null}
    </form>
  );
}
