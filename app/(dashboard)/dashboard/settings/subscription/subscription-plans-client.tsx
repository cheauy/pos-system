"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Circle,
  CircleDot,
  Info,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Store,
  UserRound,
  UsersRound,
} from "lucide-react";

import {
  calculateSubscriptionPrice,
  calculateCustomSubscriptionPrice,
  isSubscriptionPlanKey,
  subscriptionPlans,
  subscriptionTerms,
  type SubscriptionPlanKey,
  type SubscriptionTermMonths,
} from "@/lib/subscriptions/plans";
import CustomPlanDialog from "./custom-plan-dialog";
import { continueFreeTrial, createSubscriptionOrder } from "./actions";

type Props = {
  businessName: string;
  currentPlanKey: string | null;
  currentUserLimit: number | null;
  activeSeatCount: number;
  currentBranchLimit?: number;
  activeBranchCount?: number;
  canPurchase: boolean;
  flowMode: "choose" | "upgrade" | "reactivate";
  estimatedRemainingCredit: number;
  onboarding: boolean;
  subscriptionStatus: string | null;
  trialUnavailable: boolean;
};

type FeatureRow = {
  icon: typeof UserRound;
  label: string;
};

const visualMeta: Record<
  SubscriptionPlanKey,
  {
    icon: typeof UserRound;
    badge?: string;
    badgeClass?: string;
    features: FeatureRow[];
  }
> = {
  solo: {
    icon: UserRound,
    features: [
      { icon: UserRound, label: "1 user (owner)" },
      { icon: UsersRound, label: "No team access" },
      { icon: Store, label: "1 branch included" },
      { icon: RefreshCw, label: "URL changes use normal $5 pricing" },
      { icon: RefreshCw, label: "Business Mode switches use normal $5 pricing" },
    ],
  },
  small_team: {
    icon: UsersRound,
    badge: "Popular",
    badgeClass: "bg-blue-100 text-blue-700",
    features: [
      { icon: UserRound, label: "Up to 5 users" },
      { icon: UsersRound, label: "Team access unlocked" },
      { icon: Store, label: "1 branch included" },
      { icon: ShieldCheck, label: "Role-based staff access" },
      { icon: RefreshCw, label: "URL changes use normal $5 pricing" },
      { icon: RefreshCw, label: "Business Mode switches use normal $5 pricing" },
    ],
  },
  growth: {
    icon: Building2,
    badge: "Best Value",
    badgeClass: "bg-emerald-100 text-emerald-700",
    features: [
      { icon: UserRound, label: "Up to 10 users" },
      { icon: UsersRound, label: "Team access unlocked" },
      { icon: Store, label: "1 branch included" },
      { icon: ShieldCheck, label: "Role-based staff access" },
      { icon: RefreshCw, label: "2 free URL changes / month" },
      { icon: RefreshCw, label: "2 free Business Mode switches / month" },
    ],
  },
  custom: {
    icon: Building2,
    badge: "Flexible",
    badgeClass: "bg-violet-100 text-violet-700",
    features: [
      { icon: UserRound, label: "$5 per user / month" },
      { icon: Store, label: "$20 per branch / month" },
      { icon: ShieldCheck, label: "Role-based staff access" },
      { icon: RefreshCw, label: "2 free URL changes / month" },
      { icon: RefreshCw, label: "2 free Business Mode switches / month" },
    ],
  },
};

const planRank: Record<SubscriptionPlanKey, number> = {
  solo: 1,
  small_team: 2,
  growth: 3,
  custom: 4,
};

export default function SubscriptionPlansClient({
  businessName,
  currentPlanKey,
  currentUserLimit,
  activeSeatCount, currentBranchLimit = 1, activeBranchCount = 1,
  canPurchase,
  flowMode,
  estimatedRemainingCredit,
  onboarding,
  subscriptionStatus,
  trialUnavailable,
}: Props) {
  const initialPlan: SubscriptionPlanKey =
    currentPlanKey && isSubscriptionPlanKey(currentPlanKey) ? currentPlanKey : "solo";

  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlanKey>(initialPlan);
  const [termMonths, setTermMonths] = useState<SubscriptionTermMonths>(1);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const minimumCustomUsers = Math.max(1, flowMode === "upgrade" ? currentUserLimit ?? 1 : 1, activeSeatCount);
  const minimumCustomBranches = Math.max(1, activeBranchCount, flowMode === "upgrade" ? currentBranchLimit : 1);
  const [customUsers, setCustomUsers] = useState(minimumCustomUsers);
  const [customBranches, setCustomBranches] = useState(minimumCustomBranches);
  const effectiveUsers = Math.max(customUsers, minimumCustomUsers);

  const selected = subscriptionPlans[selectedPlan];
  const selectedTerm = subscriptionTerms.find((term) => term.months === termMonths);
  const hideBackToSubscription =
    onboarding ||
    subscriptionStatus === "trial_pending" ||
    subscriptionStatus === "trialing" ||
    subscriptionStatus === "trial_blocked";

  const price = useMemo(() => {
    if (selectedPlan === "custom") return calculateCustomSubscriptionPrice(effectiveUsers, customBranches, termMonths);
    return calculateSubscriptionPrice(selectedPlan, termMonths);
  }, [selectedPlan, termMonths, effectiveUsers, customBranches]);

  const currentPaidPlan =
    currentPlanKey && isSubscriptionPlanKey(currentPlanKey) ? currentPlanKey : null;
  const selectedSeatLimit = selectedPlan === "custom" ? effectiveUsers : selected.userLimit;
  const isSeatDowngrade =
    selectedSeatLimit !== null && activeSeatCount > selectedSeatLimit;
  const isPlanDowngrade =
    flowMode === "upgrade" &&
    currentPaidPlan !== null &&
    planRank[selectedPlan] < planRank[currentPaidPlan];
  const isCustomSeatDowngrade =
    flowMode === "upgrade" &&
    currentPaidPlan === "custom" &&
    selectedPlan === "custom" &&
    effectiveUsers < (currentUserLimit ?? 1);

  const creditApplied =
    flowMode === "upgrade" && price
      ? Math.min(price.total, Math.max(0, estimatedRemainingCredit))
      : 0;
  const estimatedPayOnce = price
    ? Number(Math.max(0, price.total - creditApplied).toFixed(2))
    : null;
  const selectionCoveredByCredit =
    flowMode === "upgrade" &&
    estimatedPayOnce !== null &&
    estimatedPayOnce < 0.5;

  const heading =
    flowMode === "upgrade"
      ? "Upgrade Subscription"
      : flowMode === "reactivate"
        ? "Reactivate Subscription"
        : "Choose Subscription";
  const subtitle =
    flowMode === "upgrade"
      ? `Upgrade ${businessName} by changing the plan, team size, or duration. Unused paid value is credited safely toward the new cycle.`
      : flowMode === "reactivate"
        ? `Reactivate ${businessName} with a paid plan. Reactivation starts a new paid cycle and never starts another free trial.`
        : `Choose a plan and billing term for ${businessName}. Payment is made once upfront for the selected term.`;

  return (
    <main className="mx-auto w-full max-w-[1600px] pb-6">
      <form action={createSubscriptionOrder}>
        <input type="hidden" name="branchLimit" value={selectedPlan === "custom" ? customBranches : 1} />
        <input type="hidden" name="plan" value={selectedPlan} />
        <input type="hidden" name="termMonths" value={termMonths} />
        {selectedPlan === "custom" ? (
          <input type="hidden" name="userLimit" value={effectiveUsers} />
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_530px] lg:items-end">
          <div>
            {!hideBackToSubscription ? (
              <Link
                href="/dashboard/settings/subscription"
                className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 transition hover:text-blue-700"
              >
                <ArrowLeft size={18} />
                Back to Subscription
              </Link>
            ) : null}
            <h1
              className={`${hideBackToSubscription ? "" : "mt-5 "}text-4xl font-black tracking-tight text-slate-950 sm:text-5xl dark:text-white`}
            >
              {heading}
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-500 sm:text-lg">
              {subtitle}
            </p>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-slate-500">Billing term</p>
            <div className="grid w-full grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm sm:grid-cols-4 dark:border-slate-700 dark:bg-slate-900">
              {subscriptionTerms.map((term) => {
                const active = termMonths === term.months;
                return (
                  <button
                    key={term.months}
                    type="button"
                    onClick={() => setTermMonths(term.months)}
                    aria-pressed={active}
                    className={`flex min-h-[68px] w-full flex-col items-center justify-center rounded-xl border px-2 py-2.5 text-center transition ${
                      active
                        ? "border-blue-500 bg-blue-50 text-blue-700 shadow-[0_1px_2px_rgba(37,99,235,0.08)] dark:border-blue-500 dark:bg-blue-950/30 dark:text-blue-300"
                        : "border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-800"
                    }`}
                  >
                    <span className="text-sm font-extrabold leading-5 sm:text-base">
                      {term.label}
                    </span>
                    <span className="mt-1 flex min-h-[20px] items-center justify-center">
                      {term.discountPercent > 0 ? (
                        <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-extrabold leading-4 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                          -{term.discountPercent}%
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {!canPurchase ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            Only the business owner can purchase or change the subscription plan.
          </div>
        ) : null}

        {onboarding ? (
          <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-blue-900 dark:bg-blue-950/20">
            <div>
              <p className="text-sm font-extrabold text-slate-950 dark:text-white">
                Standard plans and the 7-day free trial include 1 branch.
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                Your business is already created. Paid checkout does not change your business ID, products, store URL, or settings.
              </p>
              {trialUnavailable ? (
                <p className="mt-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
                  The free trial is not available for this account. You can continue with any paid plan below.
                </p>
              ) : subscriptionStatus === "trialing" ? (
                <p className="mt-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  Your 7-day free trial is already active.
                </p>
              ) : null}
            </div>
            {subscriptionStatus === "trialing" ? (
              <Link
                href="/dashboard"
                className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-300 bg-white px-5 py-3 text-sm font-extrabold text-blue-700 transition hover:bg-blue-50 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-300"
              >
                Continue to dashboard
                <ArrowRight size={18} />
              </Link>
            ) : (
              <button
                type="submit"
                formAction={continueFreeTrial}
                disabled={!canPurchase || trialUnavailable}
                className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-300 bg-white px-5 py-3 text-sm font-extrabold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-300"
              >
                Continue with 7-day free trial
                <ArrowRight size={18} />
              </button>
            )}
          </div>
        ) : null}

        <div className="mt-7 grid gap-5 md:grid-cols-2 2xl:grid-cols-4">
          {(Object.keys(subscriptionPlans) as SubscriptionPlanKey[]).map((planKey) => (
            <PlanCard
              key={planKey}
              planKey={planKey}
              selected={selectedPlan === planKey}
              current={currentPlanKey === planKey}
              disabled={
                flowMode === "upgrade" &&
                currentPaidPlan !== null &&
                planRank[planKey] < planRank[currentPaidPlan]
              }
              termMonths={termMonths}
              onSelect={() => planKey === "custom" ? setCustomDialogOpen(true) : setSelectedPlan(planKey)}
            />
          ))}
        </div>

        {selectedPlan === "custom" && (
          <section className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-violet-200 bg-violet-50 p-5 text-slate-900 dark:border-violet-800 dark:bg-violet-950/20 dark:text-slate-100">
            <div>
              <h2 className="font-bold">Your Custom Plan</h2>
              <p className="mt-1 text-sm">{effectiveUsers} {effectiveUsers === 1 ? "user" : "users"} × $5 + {customBranches} {customBranches === 1 ? "branch" : "branches"} × $20 = <strong>${price.monthlyPrice.toFixed(2)}/month</strong></p>
            </div>
            <button type="button" onClick={() => setCustomDialogOpen(true)} className="rounded-xl border border-violet-300 px-4 py-2 font-semibold text-violet-700 dark:text-violet-300">Edit users and branches</button>
          </section>
        )}
        {customDialogOpen && (
          <CustomPlanDialog
            users={effectiveUsers}
            branches={customBranches}
            months={termMonths}
            minimumUsers={minimumCustomUsers}
            minimumBranches={minimumCustomBranches}
            onClose={() => setCustomDialogOpen(false)}
            onApply={(users, branches, months) => {
              setCustomUsers(users);
              setCustomBranches(branches);
              setTermMonths(months);
              setSelectedPlan("custom");
              setCustomDialogOpen(false);
            }}
          />
        )}
        {selectedPlan !== "custom" && activeBranchCount > 1 && <p role="alert" className="mt-4 text-red-600">You have {activeBranchCount} active branches. Choose Custom Plan or deactivate unused branches before checkout.</p>}
        <section className="mt-5 rounded-2xl border border-blue-200 bg-blue-50/80 px-5 py-4 dark:border-blue-900 dark:bg-blue-950/20">
          <div className="flex items-start gap-3">
            <Info size={22} className="mt-0.5 shrink-0 text-blue-600" />
            <div>
              <p className="font-bold text-blue-950 dark:text-blue-200">
                Choose ABA KHQR or Manual payment after selecting a plan.
              </p>
              <p className="mt-1 text-sm leading-6 text-blue-800/80 dark:text-blue-300/80">
                The selected term shows its discounted monthly rate and full billed total before checkout. After choosing a payment method, upload payment proof for TENH verification. Active-plan upgrades keep the existing remaining-value credit rules.
              </p>
            </div>
          </div>
        </section>

        <section className="sticky bottom-3 z-30 mt-5 rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-[0_-12px_40px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:p-5 dark:border-slate-700 dark:bg-slate-900/95">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-sm font-semibold text-slate-500">Selected:</span>
                <span className="text-lg font-black text-slate-950 dark:text-white">
                  {selected.name} · {selectedTerm?.label ?? `${termMonths} months`}
                </span>
              </div>

              {isPlanDowngrade || isCustomSeatDowngrade ? (
                <div className="mt-2 flex items-start gap-2 text-sm font-medium text-red-600 dark:text-red-300">
                  <AlertTriangle size={17} className="mt-0.5 shrink-0" />
                  <span>
                    Active subscriptions cannot downgrade mid-term. Keep the current plan, choose a higher plan, or wait until expiry to reactivate on a smaller plan.
                  </span>
                </div>
              ) : isSeatDowngrade ? (
                <div className="mt-2 flex items-start gap-2 text-sm font-medium text-orange-600 dark:text-orange-300">
                  <AlertTriangle size={17} className="mt-0.5 shrink-0" />
                  <span>
                    This plan has fewer seats than your current team ({activeSeatCount} active). Disable unused staff accounts or choose enough seats before checkout.
                  </span>
                </div>
              ) : selectionCoveredByCredit ? (
                <div className="mt-2 flex items-start gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
                  <AlertTriangle size={17} className="mt-0.5 shrink-0" />
                  <span>
                    Your remaining paid value already covers this selection. Choose a longer term or higher plan so a new paid cycle can be created safely.
                  </span>
                </div>
              ) : flowMode === "upgrade" && estimatedRemainingCredit > 0 ? (
                <p className="mt-2 text-sm font-semibold text-blue-600 dark:text-blue-300">
                  Estimated current-plan credit: ${estimatedRemainingCredit.toFixed(2)}. The server recalculates the exact credit when you create the order.
                </p>
              ) : price && price.discountAmount > 0 ? (
                <p className="mt-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  You save ${price.discountAmount.toFixed(2)} with the {selectedTerm?.label} term.
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-8 border-slate-200 lg:border-l lg:px-8 dark:border-slate-700">
              {price ? (
                <>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Per month</p>
                    <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                      ${(price.total / termMonths).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Subtotal</p>
                    <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                      ${price.subtotal.toFixed(2)}
                    </p>
                  </div>
                  {flowMode === "upgrade" && estimatedRemainingCredit > 0 ? (
                    <div>
                      <p className="text-xs font-semibold text-slate-500">Est. credit</p>
                      <p className="mt-1 text-lg font-bold text-blue-600">
                        -${creditApplied.toFixed(2)}
                      </p>
                    </div>
                  ) : null}
                  <div>
                    <p className="text-xs font-semibold text-slate-500">{flowMode === "upgrade" ? "Est. pay once" : "Pay once"}</p>
                    <p className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
                      ${(estimatedPayOnce ?? price.total).toFixed(2)}
                    </p>
                  </div>
                </>
              ) : (
                <div>
                  <p className="text-xs font-semibold text-slate-500">Price</p>
                  <p className="mt-1 text-xl font-black text-slate-950 dark:text-white">
                    Manual quote
                  </p>
                </div>
              )}
            </div>

            <PurchaseButton
              disabled={
                !canPurchase || isSeatDowngrade || (selectedPlan !== "custom" && activeBranchCount > 1) ||
                isPlanDowngrade ||
                isCustomSeatDowngrade ||
                selectionCoveredByCredit
              }
              custom={false}
              flowMode={flowMode}
            />
          </div>
        </section>
      </form>
    </main>
  );
}

function PlanCard({
  planKey,
  selected,
  current,
  disabled,
  termMonths,
  onSelect,
}: {
  planKey: SubscriptionPlanKey;
  selected: boolean;
  current: boolean;
  disabled: boolean;
  termMonths: SubscriptionTermMonths;
  onSelect: () => void;
}) {
  const plan = subscriptionPlans[planKey];
  const meta = visualMeta[planKey];
  const Icon = meta.icon;
  const features = meta.features;
  const termPrice =
    planKey === "custom"
      ? null
      : calculateSubscriptionPrice(planKey, termMonths);
  const effectiveMonthly = termPrice
    ? Number((termPrice.total / termMonths).toFixed(2))
    : null;
  const selectedTerm = subscriptionTerms.find((term) => term.months === termMonths);

  return (
    <article
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-pressed={selected}
      aria-disabled={disabled}
      onClick={() => { if (!disabled) onSelect(); }}
      onKeyDown={(event) => {
        if (!disabled && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`group flex min-h-[530px] flex-col rounded-3xl border bg-white p-6 shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-slate-900 ${disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer"} ${
        selected
          ? "border-blue-500 ring-1 ring-blue-500"
          : "border-slate-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg dark:border-slate-700"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
          <Icon size={27} />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {meta.badge ? (
            <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${meta.badgeClass}`}>
              {meta.badge}
            </span>
          ) : null}
          {current ? (
            <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-extrabold text-white dark:bg-white dark:text-slate-900">
              Current
            </span>
          ) : null}
        </div>
      </div>

      <h2 className="mt-5 text-2xl font-black tracking-tight text-slate-950 dark:text-white">
        {plan.name}
      </h2>
      <p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">{plan.description}</p>

      <div className="mt-5">
        {plan.monthlyPrice === null || !termPrice || effectiveMonthly === null ? (
          <p className="text-xl font-black text-slate-950 dark:text-white">Choose users & branches</p>
        ) : (
          <>
            <div className="flex items-end gap-2">
              <p className="text-4xl font-black tracking-tight text-slate-950 dark:text-white">
                ${effectiveMonthly.toFixed(2)}
                <span className="ml-1 text-base font-semibold text-slate-500">/ month</span>
              </p>
              {termPrice.discountPercent > 0 ? (
                <span className="mb-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-extrabold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                  Save {termPrice.discountPercent}%
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              ${termPrice.total.toFixed(2)} billed {termMonths === 1 ? "monthly" : termMonths === 12 ? "yearly" : `every ${termMonths} months`}
            </p>
            {termPrice.discountPercent > 0 ? (
              <p className="mt-1 text-xs text-slate-400">
                Regular ${plan.monthlyPrice.toFixed(2)}/month · {selectedTerm?.label}
              </p>
            ) : null}
          </>
        )}
      </div>

      <div className="my-5 border-t border-slate-200 dark:border-slate-700" />

      <div className="space-y-3.5">
        {features.map(({ icon: FeatureIcon, label }) => (
          <div key={label} className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
            <FeatureIcon size={17} className="mt-0.5 shrink-0 text-slate-700 dark:text-slate-300" />
            <span>{label}</span>
          </div>
        ))}
      </div>


      <button
        type="button"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          if (!disabled) onSelect();
        }}
        className={`mt-auto flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3.5 text-sm font-extrabold transition ${
          selected
            ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"
            : "border-slate-200 bg-slate-50 text-blue-600 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-950 dark:text-blue-300"
        }`}
      >
        {selected ? <CircleDot size={21} /> : <Circle size={21} />}
        {disabled ? "Available after expiry" : planKey === "custom" ? "Customize plan" : "Select plan"}
      </button>
    </article>
  );
}

function PurchaseButton({
  disabled,
  custom,
  flowMode,
}: {
  disabled: boolean;
  custom: boolean;
  flowMode: "choose" | "upgrade" | "reactivate";
}) {
  const { pending } = useFormStatus();
  const label = custom
    ? "Request quote"
    : flowMode === "upgrade"
      ? "Continue to upgrade"
      : flowMode === "reactivate"
        ? "Continue to reactivate"
        : "Continue to pay";

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex min-h-14 min-w-56 items-center justify-center gap-3 rounded-2xl bg-blue-600 px-7 py-4 text-base font-extrabold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? <Loader2 size={19} className="animate-spin" /> : null}
      {pending ? "Please wait…" : label}
      {!pending ? <ArrowRight size={20} /> : null}
    </button>
  );
}
