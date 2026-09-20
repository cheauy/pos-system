"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, Minus, Plus, UsersRound, X } from "lucide-react";
import {
  calculateCustomSubscriptionPrice,
  subscriptionTerms,
  type SubscriptionTermMonths,
} from "@/lib/subscriptions/plans";

type Props = {
  users: number;
  branches: number;
  months: SubscriptionTermMonths;
  minimumUsers: number;
  minimumBranches: number;
  onClose: () => void;
  onApply: (users: number, branches: number, months: SubscriptionTermMonths) => void;
};

export default function CustomPlanDialog(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [users, setUsers] = useState(props.users);
  const [branches, setBranches] = useState(props.branches);
  const [months, setMonths] = useState(props.months);
  const price = calculateCustomSubscriptionPrice(users, branches, months);

  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="custom-plan-title"
      aria-describedby="custom-plan-description"
      onCancel={props.onClose}
      onClick={event => { if (event.target === event.currentTarget) props.onClose(); }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
    >
      <div className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="custom-plan-title" className="text-2xl font-bold">Build your Custom Plan</h2>
            <p id="custom-plan-description" className="mt-2 text-sm text-slate-500 dark:text-slate-400">Choose the users and branches your business needs.</p>
          </div>
          <button type="button" aria-label="Close custom plan" onClick={props.onClose} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={20} /></button>
        </div>

        <div className="my-6 space-y-3">
          <Quantity label="Users" hint="$5 per user / month · includes the owner" icon={UsersRound} value={users} min={props.minimumUsers} max={500} onChange={setUsers} />
          <Quantity label="Branches" hint="$20 per branch / month" icon={Building2} value={branches} min={props.minimumBranches} max={100} onChange={setBranches} />
        </div>
        {(props.minimumUsers > 1 || props.minimumBranches > 1) && <p className="mb-5 text-xs text-slate-500 dark:text-slate-400">Your minimum selection covers active users, active branches and any capacity already paid for this term.</p>}

        <label className="block text-sm font-semibold">
          Billing term
          <select value={months} onChange={event => setMonths(Number(event.target.value) as SubscriptionTermMonths)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
            {subscriptionTerms.map(term => <option key={term.months} value={term.months}>{term.label}{term.discountPercent ? ` · Save ${term.discountPercent}%` : ""}</option>)}
          </select>
        </label>

        <div aria-live="polite" aria-atomic="true" className="my-6 space-y-3 rounded-2xl bg-blue-50 p-5 text-sm dark:bg-blue-950/30">
          <div className="flex justify-between"><span>{users} {users === 1 ? "user" : "users"} × $5</span><span>${(users * 5).toFixed(2)}</span></div>
          <div className="flex justify-between"><span>{branches} {branches === 1 ? "branch" : "branches"} × $20</span><span>${(branches * 20).toFixed(2)}</span></div>
          <div className="flex justify-between border-t border-blue-200 pt-3 font-bold dark:border-blue-900"><span>Monthly price</span><span>${price.monthlyPrice.toFixed(2)}</span></div>
          {price.discountAmount > 0 && <div className="flex justify-between text-emerald-700 dark:text-emerald-400"><span>Term discount ({price.discountPercent}%)</span><span>−${price.discountAmount.toFixed(2)}</span></div>}
          <div className="flex justify-between text-lg font-bold"><span>Total for {months} {months === 1 ? "month" : "months"}</span><span>${price.total.toFixed(2)}</span></div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Any remaining paid-plan credit is shown in your checkout summary.</p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={props.onClose} className="rounded-xl border border-slate-200 px-5 py-3 font-semibold dark:border-slate-700">Cancel</button>
          <button type="button" onClick={() => props.onApply(users, branches, months)} className="flex-1 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700">Use this plan</button>
        </div>
      </div>
    </dialog>
  );
}

function Quantity({ label, hint, icon: Icon, value, min, max, onChange }: {
  label: string; hint: string; icon: typeof UsersRound; value: number; min: number; max: number; onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  function commit() {
    if (draft !== null) onChange(Math.max(min, Math.min(max, Math.trunc(Number(draft)) || min)));
    setDraft(null);
  }
  const buttonClass = "rounded-lg p-2 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-slate-800";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex items-center gap-3">
        <Icon size={22} className="text-blue-600" />
        <div><label htmlFor={`custom-${label}`} className="font-semibold">{label}</label><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p></div>
      </div>
      <div className="flex items-center gap-1 rounded-xl border border-slate-200 p-1 dark:border-slate-700">
        <button type="button" aria-label={`Decrease ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(value - 1)} className={buttonClass}><Minus size={16} /></button>
        <input id={`custom-${label}`} type="number" min={min} max={max} step={1} value={draft ?? value} onChange={event => {
          const input = event.target.value;
          setDraft(input);
          const numeric = Number(input);
          if (Number.isInteger(numeric) && numeric >= min && numeric <= max) onChange(numeric);
        }} onBlur={commit} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); commit(); } }} className="w-14 bg-transparent text-center font-bold outline-none focus:ring-2 focus:ring-blue-500" />
        <button type="button" aria-label={`Increase ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)} className={buttonClass}><Plus size={16} /></button>
      </div>
    </div>
  );
}
