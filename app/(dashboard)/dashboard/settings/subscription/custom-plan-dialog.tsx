"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Minus, Plus, UsersRound, X } from "lucide-react";
import { promotionDiscount, promotionPrice, type Promotion } from "@/lib/subscriptions/promotions";
import {
  calculateCustomSubscriptionPrice,
  subscriptionPlans,
  subscriptionTerms,
  type SubscriptionTermMonths,
} from "@/lib/subscriptions/plans";

type UpgradeTermMonths = 0 | SubscriptionTermMonths;

type Props = {
  promotions?: Promotion[];
  pricePreviewAt: number;
  users: number;
  branches: number;
  months: UpgradeTermMonths;
  minimumUsers: number;
  minimumBranches: number;
  onClose: () => void;
  onApply: (users: number, branches: number, months: UpgradeTermMonths) => void;
  disabled?: boolean;
  mode?: "build" | "upgrade";
  currentMonthlyPrice?: number | null;
  currentExpiresAt?: string | null;
  remainingAccessDays?: number;
};

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

export default function CustomPlanDialog(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [users, setUsers] = useState(props.users);
  const [branches, setBranches] = useState(props.branches);
  const [months, setMonths] = useState<UpgradeTermMonths>(props.mode === "upgrade" ? 0 : props.months);
  const pricingMonths: SubscriptionTermMonths = months === 0 ? 1 : months;
  const price = promotionPrice(calculateCustomSubscriptionPrice(users, branches, pricingMonths),props.promotions??[],"custom",pricingMonths);
  const matchedPlan = price.matchedPlanKey ? subscriptionPlans[price.matchedPlanKey] : null;
  const upgradeMode = props.mode === "upgrade";

  const upgradeMath = useMemo(() => {
    if (!upgradeMode) return null;
    const currentMonthly = Math.max(0, Number(props.currentMonthlyPrice ?? 0));
    const targetMonthly = Math.max(0, price.monthlyPrice);
    const expiresAtMs = props.currentExpiresAt ? new Date(props.currentExpiresAt).getTime() : 0;
    const remainingSeconds = Number.isFinite(expiresAtMs)
      ? Math.max(0, Math.floor((expiresAtMs - props.pricePreviewAt) / 1000))
      : 0;
    const monthlyDifference = Math.max(0, targetMonthly - currentMonthly);
    const capacityProration = Number(
      ((monthlyDifference * remainingSeconds) / THIRTY_DAYS_SECONDS).toFixed(2),
    );
    const extensionTotal = months === 0 ? 0 : Number(price.total.toFixed(2));
    return {
      capacityProration,
      extensionTotal,
      total: Number((capacityProration + extensionTotal).toFixed(2)),
    };
  }, [months, price.monthlyPrice, price.total, props.currentExpiresAt, props.currentMonthlyPrice, props.pricePreviewAt, upgradeMode]);

  const noUpgradeSelected = upgradeMode && months === 0 && users === props.minimumUsers && branches === props.minimumBranches;

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
            <h2 id="custom-plan-title" className="text-2xl font-bold">
              {upgradeMode ? "Upgrade your Plan" : "Build your Custom Plan"}
            </h2>
            <p id="custom-plan-description" className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {upgradeMode
                ? "Choose users, branches and duration. You can also change duration at checkout."
                : "Choose the users and branches your business needs."}
            </p>
          </div>
          <button type="button" aria-label="Close custom plan" onClick={props.onClose} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={20} /></button>
        </div>

        <div className="my-6 space-y-3">
          <Quantity
            label="Users"
            hint={upgradeMode ? `Current ${props.minimumUsers} · choose the new total` : "Fair plan pricing through 10 users · users 11+ add $5 each / month · includes the owner"}
            icon={UsersRound}
            value={users}
            min={props.minimumUsers}
            max={500}
            onChange={setUsers}
            baseValue={props.minimumUsers}
            quickAdds={upgradeMode ? [1, 5, 10] : undefined}
          />
          <Quantity
            label="Branches"
            hint={upgradeMode ? `Current ${props.minimumBranches} · each added branch is $20 / month` : "1 branch included · each additional branch adds $20 / month"}
            icon={Building2}
            value={branches}
            min={props.minimumBranches}
            max={100}
            onChange={setBranches}
            baseValue={props.minimumBranches}
            quickAdds={upgradeMode ? [1, 2, 5] : undefined}
          />
        </div>

        {upgradeMode ? (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
            <label htmlFor="custom-upgrade-duration" className="font-semibold">Duration</label>
            <select id="custom-upgrade-duration" value={months} onChange={event=>setMonths(Number(event.target.value) as UpgradeTermMonths)} disabled={props.disabled} className="mt-2 w-full rounded-xl border border-blue-200 bg-white px-3 py-3 text-sm font-medium text-slate-900 focus:outline-2 focus:outline-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
              <option value={0}>Keep current expiry</option>
              {subscriptionTerms.map(term=><option key={term.months} value={term.months}>Add {term.months===12?'1 year':`${term.months} ${term.months===1?'month':'months'}`}</option>)}
            </select>
            <p className="mt-2 text-xs">You can change this again at checkout before payment starts.</p>
            {props.remainingAccessDays && props.remainingAccessDays > 0 ? (
              <p className="mt-2 text-xs font-semibold">
                Your current {props.remainingAccessDays} paid {props.remainingAccessDays === 1 ? "day" : "days"} stay protected.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="block text-sm font-semibold">
            <p>Billing term</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {subscriptionTerms.map((term) => (
                <button
                  key={term.months}
                  type="button"
                  onClick={() => setMonths(term.months)}
                  className={`rounded-xl border px-3 py-3 text-left transition ${
                    months === term.months
                      ? "border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500 dark:bg-blue-950/30 dark:text-blue-300"
                      : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  }`}
                >
                  <span className="block font-bold">{term.label}</span>
                  {promotionDiscount(props.promotions??[],"custom",term.months) ? (
                    <span className="mt-1 block text-xs font-semibold text-emerald-600">Save {promotionDiscount(props.promotions??[],"custom",term.months)}%</span>
                  ) : (
                    <span className="mt-1 block text-xs text-slate-400">No discount</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <div aria-live="polite" aria-atomic="true" className="my-6 space-y-3 rounded-2xl bg-blue-50 p-5 text-sm dark:bg-blue-950/30">
          <div className="flex justify-between"><span>Users</span><span>{users}</span></div>
          <div className="flex justify-between"><span>Branches</span><span>{branches}</span></div>
          {matchedPlan ? (
            <div className="rounded-xl border border-blue-200 bg-white/70 p-3 text-xs leading-5 text-blue-800 dark:border-blue-900 dark:bg-slate-900/50 dark:text-blue-300">
              This setup matches <strong>{matchedPlan.name}</strong>, so TENH POS uses the same ${matchedPlan.monthlyPrice?.toFixed(2)}/month base price.
            </div>
          ) : (
            <div className="space-y-2 text-xs text-slate-500 dark:text-slate-400">
              <div className="flex justify-between gap-4"><span>User allowance ({users})</span><span>${price.userBaseMonthlyPrice.toFixed(2)}</span></div>
              <div className="flex justify-between gap-4"><span>First branch included</span><span>$0.00</span></div>
              {price.additionalBranchCount > 0 ? (
                <div className="flex justify-between gap-4"><span>{price.additionalBranchCount} additional {price.additionalBranchCount === 1 ? "branch" : "branches"} × $20</span><span>${price.additionalBranchMonthlyPrice.toFixed(2)}</span></div>
              ) : null}
            </div>
          )}
          <div className="flex justify-between font-bold"><span>{upgradeMode ? "Target monthly rate" : "Monthly price"}</span><span>${price.monthlyPrice.toFixed(2)}</span></div>
          <div className="border-t border-blue-200 dark:border-blue-900" />
          {!upgradeMode && months !== 0 && price.discountAmount > 0 ? (
            <>
              <div className="flex justify-between text-emerald-700 dark:text-emerald-400"><span>Duration discount ({price.discountPercent}%)</span><span>−${price.discountAmount.toFixed(2)}</span></div>
              <div className="flex justify-between font-semibold text-emerald-700 dark:text-emerald-400"><span>Discounted monthly rate</span><span>${(price.total / pricingMonths).toFixed(2)}</span></div>
            </>
          ) : null}
          {upgradeMode && upgradeMath ? (
            <>
              <div className="flex justify-between gap-4"><span>Capacity upgrade for remaining paid time</span><span>${upgradeMath.capacityProration.toFixed(2)}</span></div>
              <div className="flex justify-between gap-4"><span>{months === 0 ? 'Keep current expiry' : `Added duration (${months} ${months === 1 ? 'month' : 'months'})`}</span><span>${upgradeMath.extensionTotal.toFixed(2)}</span></div>
              {months!==0&&price.discountAmount>0&&<p className="text-xs text-emerald-700 dark:text-emerald-400">Includes {price.discountPercent}% off the added duration.</p>}
              <div className="flex justify-between border-t border-blue-200 pt-3 text-lg font-bold dark:border-blue-900"><span>Total due now</span><span>${upgradeMath.total.toFixed(2)}</span></div>
              <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">Your existing paid time stays protected. Added duration starts after the current expiry.</p>
            </>
          ) : (
            <div className="flex justify-between text-lg font-bold"><span>Total for {months} {months === 1 ? "month" : "months"}</span><span>${price.total.toFixed(2)}</span></div>
          )}
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={props.onClose} className="rounded-xl border border-slate-200 px-5 py-3 font-semibold dark:border-slate-700">Cancel</button>
          <button type="button" disabled={props.disabled || noUpgradeSelected} onClick={() => props.onApply(users, branches, months)} className="flex-1 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">Continue to payment</button>
        </div>
      </div>
    </dialog>
  );
}

function Quantity({ label, hint, icon: Icon, value, min, max, onChange, baseValue, quickAdds }: {
  label: string;
  hint: string;
  icon: typeof UsersRound;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  baseValue?: number;
  quickAdds?: number[];
}) {
  const [draft, setDraft] = useState<string | null>(null);
  function commit() {
    if (draft !== null) onChange(Math.max(min, Math.min(max, Math.trunc(Number(draft)) || min)));
    setDraft(null);
  }
  const buttonClass = "rounded-lg p-2 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-slate-800";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex min-w-0 items-center gap-3">
        <Icon size={22} className="text-blue-600" />
        <div><label htmlFor={`custom-${label}`} className="font-semibold">{label}</label><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p></div>
      </div>
      <div className="space-y-2">
        <div className="flex w-40 shrink-0 items-center justify-between gap-1 rounded-xl border border-slate-200 p-1 dark:border-slate-700">
          <button type="button" aria-label={`Decrease ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(value - 1)} className={buttonClass}><Minus size={16} /></button>
          <input id={`custom-${label}`} type="number" min={min} max={max} step={1} value={draft ?? value} onChange={event => {
            const input = event.target.value;
            setDraft(input);
            const numeric = Number(input);
            if (Number.isInteger(numeric) && numeric >= min && numeric <= max) onChange(numeric);
          }} onBlur={commit} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); commit(); } }} className="w-14 bg-transparent text-center font-bold outline-none focus:ring-2 focus:ring-blue-500" />
          <button type="button" aria-label={`Increase ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)} className={buttonClass}><Plus size={16} /></button>
        </div>
        {quickAdds?.length && baseValue !== undefined ? (
          <div className="flex w-40 gap-1">
            {quickAdds.map((amount) => {
              const target = Math.min(max, baseValue + amount);
              const active = value === target;
              return (
                <button
                  key={amount}
                  type="button"
                  onClick={() => onChange(target)}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold transition ${
                    active
                      ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"
                      : "border-slate-200 text-slate-600 hover:border-blue-200 hover:text-blue-700 dark:border-slate-700 dark:text-slate-300"
                  }`}
                >
                  +{amount}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
