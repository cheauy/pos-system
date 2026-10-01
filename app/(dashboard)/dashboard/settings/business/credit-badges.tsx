"use client";

import { useActionState } from "react";
import { Coins, Crown, Link2, Loader2 } from "lucide-react";
import { buyBusinessCredit } from "./actions";

export default function CreditBadges({
  modeCredits,
  urlCredits,
  canBuy = false,
}: {
  modeCredits: number;
  urlCredits: number;
  canBuy?: boolean;
}) {
  const [result, buy, pending] = useActionState(buyBusinessCredit, { error: "" });

  return (
    <div aria-label="Available change credits" className="grid w-full gap-3 md:grid-cols-3">
      <CreditBalance
        count={modeCredits}
        label="Mode credits available"
        hint="Use to switch business mode"
        icon={<Coins size={20} />}
        tone="bg-amber-50 text-amber-500 dark:bg-amber-950/40"
      />
      <CreditBalance
        count={urlCredits}
        label="Store URL credits"
        hint="Use to change Store URL"
        icon={<Link2 size={20} />}
        tone="bg-blue-50 text-blue-600 dark:bg-blue-950/40"
      />

      <div className="rounded-2xl border border-blue-100 bg-gradient-to-r from-violet-50 via-white to-blue-50 p-4 shadow-sm dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-blue-950/30">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300">
            <Crown size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-slate-950 dark:text-white">Need more credits?</p>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">Unlock more flexibility for your business. Each credit costs $5.</p>
            {canBuy ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <form action={buy}>
                  <input type="hidden" name="creditType" value="mode" />
                  <button disabled={pending} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                    {pending ? <Loader2 size={13} className="animate-spin" /> : null}
                    Buy mode · $5
                  </button>
                </form>
                <form action={buy}>
                  <input type="hidden" name="creditType" value="url" />
                  <button disabled={pending} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 text-xs font-bold text-blue-600 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-900 dark:bg-slate-950">
                    Buy URL · $5
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </div>
        {result.error ? <p role="alert" className="mt-3 text-sm text-red-600">{result.error}</p> : null}
      </div>
    </div>
  );
}

function CreditBalance({
  count,
  label,
  hint,
  icon,
  tone,
}: {
  count: number;
  label: string;
  hint: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-2xl font-extrabold leading-7 text-slate-950 dark:text-white">{count}</p>
        <p className="mt-0.5 text-xs font-bold text-slate-800 dark:text-slate-200">{label}</p>
        <p className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{hint}</p>
      </div>
    </div>
  );
}
