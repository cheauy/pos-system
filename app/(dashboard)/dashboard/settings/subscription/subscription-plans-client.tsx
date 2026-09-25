"use client";

import Link from "next/link";
import { useActionState, useMemo, useRef, useState } from "react";
import { flushSync, useFormStatus } from "react-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Circle,
  CircleDot,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Store,
  UserRound,
  UsersRound,
  X,
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
import { promotionDiscount, promotionPrice, type Promotion } from "@/lib/subscriptions/promotions";
import RenewalSelectionDialog, {
  type RenewalBranchOption,
  type RenewalMemberOption,
} from "./renewal-selection-dialog";
import { continueFreeTrial, submitSubscriptionSelection } from "./actions";

type Props = {
  promotions?: Promotion[];
  pricePreviewAt: number;
  businessId: string;
  businessName: string;
  currentPlanKey: string | null;
  currentUserLimit: number | null;
  currentMonthlyPrice: number | null;
  currentTermMonths: number | null;
  activeSeatCount: number;
  currentBranchLimit?: number;
  activeBranchCount?: number;
  canPurchase: boolean;
  flowMode: "choose" | "upgrade" | "reactivate";
  onboarding: boolean;
  subscriptionStatus: string | null;
  trialUnavailable: boolean;
  activeMembers: RenewalMemberOption[];
  activeBranches: RenewalBranchOption[];
  currentExpiresAt: string | null;
  remainingAccessDays: number;
};

type FeatureRow = {
  icon: typeof UserRound;
  label: string;
};

function normalizeCustomCount(
  value: number | null | undefined,
  min: number,
  max: number,
  fallback: number,
) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(numeric)));
}

function normalizeSubscriptionTerm(value: number | null | undefined): SubscriptionTermMonths {
  return value === 3 || value === 6 || value === 12 ? value : 1;
}

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
      { icon: UserRound, label: "Choose your user limit" },
      { icon: Store, label: "Choose your branch limit" },
      { icon: ShieldCheck, label: "Role-based staff access" },
      { icon: RefreshCw, label: "2 free URL changes / month" },
      { icon: RefreshCw, label: "2 free Business Mode switches / month" },
    ],
  },
};


export default function SubscriptionPlansClient({
  promotions = [],
  pricePreviewAt,
  businessId,
  businessName,
  currentPlanKey,
  currentUserLimit,
  currentMonthlyPrice,
  currentTermMonths,
  activeSeatCount, currentBranchLimit = 1, activeBranchCount = 1,
  canPurchase,
  flowMode,
  onboarding,
  subscriptionStatus,
  trialUnavailable,
  activeMembers,
  activeBranches,
  currentExpiresAt,
  remainingAccessDays,
}: Props) {
  const [submission, submitPlan] = useActionState(submitSubscriptionSelection, { error: null });
  const formRef = useRef<HTMLFormElement>(null);
  const smallerPlanDialog = useRef<HTMLDialogElement>(null);
  const smallerPlanConfirmed = useRef(false);
  const initialPlan: SubscriptionPlanKey =
    currentPlanKey && isSubscriptionPlanKey(currentPlanKey) ? currentPlanKey : "solo";

  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlanKey>(initialPlan);
  type UpgradeTermMonths = 0 | SubscriptionTermMonths;
  const normalizedCurrentTerm = normalizeSubscriptionTerm(currentTermMonths);
  const [termMonths, setTermMonths] = useState<UpgradeTermMonths>(
    flowMode === "reactivate" ? normalizedCurrentTerm : 1,
  );
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [customUpgradeMode, setCustomUpgradeMode] = useState(false);
  const [customUsers, setCustomUsers] = useState(() =>
    normalizeCustomCount(currentUserLimit ?? activeSeatCount, 1, 500, 1),
  );
  const [customBranches, setCustomBranches] = useState(() =>
    normalizeCustomCount(currentBranchLimit, 1, 100, 1),
  );
  const [keepDialogOpen, setKeepDialogOpen] = useState(false);
  const [selectionCustomized, setSelectionCustomized] = useState(false);
  const [keepMemberIds, setKeepMemberIds] = useState<string[]>([]);
  const [keepBranchIds, setKeepBranchIds] = useState<string[]>([]);
  const [selectionMade, setSelectionMade] = useState(flowMode !== "upgrade");
  const [downgradePlan, setDowngradePlan] = useState<SubscriptionPlanKey | null>(null);
  // Keep UI state safe before it reaches the strict pricing helpers. The
  // pricing helpers and server validation remain intentionally strict.
  const effectiveUsers = normalizeCustomCount(customUsers, 1, 500, 1);
  const effectiveBranches = normalizeCustomCount(customBranches, 1, 100, 1);

  const selected = subscriptionPlans[selectedPlan];
  // A Custom Plan upgrade may intentionally use 0 to mean "keep the current
  // duration". Price previews still need a real term, so use 1 month only as
  // the preview basis; the submitted order keeps the original 0 value.
  const pricingTerm: SubscriptionTermMonths = termMonths === 0 ? 1 : normalizeSubscriptionTerm(termMonths);
  const selectedTermLabel = termMonths === 0
    ? "Keep current"
    : termMonths === 12
      ? "1 year"
      : termMonths === 1
        ? "1 month"
        : `${termMonths} months`;
  const price = useMemo(() => {
    const base=selectedPlan === "custom" ? calculateCustomSubscriptionPrice(effectiveUsers, effectiveBranches, pricingTerm) : calculateSubscriptionPrice(selectedPlan, pricingTerm);
    return promotionPrice(base,promotions,selectedPlan,pricingTerm);
  }, [selectedPlan, pricingTerm, effectiveUsers, effectiveBranches, promotions]);

  const selectedSeatLimit = selectedPlan === "custom" ? effectiveUsers : selected.userLimit ?? 1;
  const selectedBranchLimit = selectedPlan === "custom" ? effectiveBranches : selected.branchLimit;
  const currentSeats = normalizeCustomCount(currentUserLimit ?? activeSeatCount, 1, 500, 1);
  const currentBranches = normalizeCustomCount(currentBranchLimit, 1, 100, 1);
  const hasExcessUsage =
    activeSeatCount > selectedSeatLimit || activeBranchCount > selectedBranchLimit;
  const isImmediateExpansion =
    flowMode === "upgrade" &&
    !hasExcessUsage &&
    selectedSeatLimit >= currentSeats &&
    selectedBranchLimit >= currentBranches &&
    (selectedSeatLimit > currentSeats || selectedBranchLimit > currentBranches);
  const appliesAtTermEnd = flowMode === "upgrade" && !isImmediateExpansion;
  // Immediate capacity upgrades pay only the price difference for the remaining
  // current paid time, plus the newly selected duration at the target rate.
  // This avoids charging the existing paid allowance twice.
  const remainingPaidSeconds = currentExpiresAt
    ? Math.max(0, Math.floor((new Date(currentExpiresAt).getTime() - pricePreviewAt) / 1000))
    : 0;
  const currentMonthly = Math.max(0, Number(currentMonthlyPrice ?? 0));
  const capacityUpgradeProration =
    price && isImmediateExpansion
      ? Number((Math.max(0, price.monthlyPrice - currentMonthly) * remainingPaidSeconds / (30 * 24 * 60 * 60)).toFixed(2))
      : 0;
  const extensionTotal = termMonths === 0 ? 0 : price.total;
  const estimatedPayOnce = price
    ? Number((extensionTotal + capacityUpgradeProration).toFixed(2))
    : null;
  const selectionCoveredByCredit = false;

  const heading =
    flowMode === "upgrade"
      ? "Upgrade Subscription"
      : flowMode === "reactivate"
        ? "Reactivate Subscription"
        : "Choose Subscription";
  const subtitle =
    flowMode === "upgrade"
      ? `Upgrade users or branches for ${businessName}. Choose a billing term before continuing to payment.`
      : flowMode === "reactivate"
        ? `Reactivate ${businessName} with a paid plan. Reactivation starts a new paid cycle and never starts another free trial.`
        : `Choose a plan and billing term for ${businessName}. Payment is made once upfront for the selected term.`;
  const paymentUnderReview = Boolean(
    submission.error && /payment.*under review/i.test(submission.error),
  );

  function actionForPlan(planKey: SubscriptionPlanKey): "upgrade" | "downgrade" | "select" | "customize" {
    if (flowMode === "reactivate") return "select";
    if (flowMode !== "upgrade") return planKey === "custom" ? "customize" : "select";
    if (currentPlanKey === planKey) {
      if (planKey === "custom") return "customize";
      // The exact current plan + exact current billing term is not an upgrade.
      // Choosing 3/6/12 months while currently on another term is a paid
      // term change, so expose the normal Upgrade action. The server still
      // schedules same-capacity term changes at the current paid expiry.
      return termMonths === normalizedCurrentTerm ? "select" : "upgrade";
    }
    if (planKey === "custom") return "customize";
    const targetUsers = subscriptionPlans[planKey].userLimit ?? currentSeats;
    const targetBranches = subscriptionPlans[planKey].branchLimit;
    if (
      targetUsers < currentSeats ||
      targetBranches < currentBranches ||
      targetUsers < activeSeatCount ||
      targetBranches < activeBranchCount
    ) return "downgrade";
    if (targetUsers > currentSeats || targetBranches > currentBranches) return "upgrade";
    return "select";
  }

  const downgradeTarget = downgradePlan ? subscriptionPlans[downgradePlan] : null;
  const downgradeTargetUsers = downgradeTarget?.userLimit ?? currentSeats;
  const downgradeTargetBranches = downgradeTarget?.branchLimit ?? currentBranches;
  const excessDowngradeUsers = downgradeTarget ? Math.max(0, activeSeatCount - downgradeTargetUsers) : 0;
  const excessDowngradeBranches = downgradeTarget ? Math.max(0, activeBranchCount - downgradeTargetBranches) : 0;
  const selectedAction = actionForPlan(selectedPlan);
  const isSelectedDowngrade = flowMode === "upgrade" && selectedAction === "downgrade";

  return (
    <main className="mx-auto w-full max-w-[1600px] pb-6">
      <form ref={formRef} action={submitPlan} onSubmit={(event) => {
        if (selectedSeatLimit < currentSeats || selectedBranchLimit < currentBranches || hasExcessUsage) {
          if (!smallerPlanConfirmed.current) {
            event.preventDefault();
            smallerPlanDialog.current?.showModal();
            return;
          }
        }
        smallerPlanConfirmed.current = false;
      }}>
        <dialog ref={smallerPlanDialog} aria-labelledby="smaller-plan-title" className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-950/60 dark:bg-slate-900 dark:text-white">
          <h2 id="smaller-plan-title" className="text-lg font-extrabold">Continue with a smaller plan?</h2>
          <p className="mt-3 text-sm">Previous subscription: {currentSeats} users · {currentBranches} branches.</p>
          <p className="mt-1 text-sm font-bold">Selected: {selectedSeatLimit} users · {selectedBranchLimit} branches.</p>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">When the paid plan takes effect, {selectionCustomized ? "users and branches outside your keep-active selection" : "the newest excess users and branches"} will be disabled. Owner and Main Branch stay protected. Nothing is deleted, and you can change the selection later within your plan limits.</p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => smallerPlanDialog.current?.close()} className="rounded-xl border px-4 py-2 text-sm font-bold">Go back</button>
            <button type="button" onClick={() => {
              smallerPlanConfirmed.current = true;
              smallerPlanDialog.current?.close();
              formRef.current?.requestSubmit();
            }} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">I’m okay with that</button>
          </div>
        </dialog>
        <input type="hidden" name="expectedBusinessId" value={businessId} />
        {paymentUnderReview ? (
          <aside
            role="status"
            aria-live="polite"
            className="fixed right-4 top-4 z-[80] w-[min(390px,calc(100vw-2rem))] rounded-2xl border border-amber-200 bg-white p-4 shadow-xl shadow-slate-950/10 dark:border-amber-800/70 dark:bg-slate-900"
          >
            <p className="text-sm font-extrabold text-slate-950 dark:text-white">
              Status: Payment Under Review
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Our team is verifying your payment details.
            </p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              <span className="font-semibold">Taking longer than expected?</span>{" "}
              <a
                href="https://t.me/tenhchat_support_bot"
                target="_blank"
                rel="noreferrer"
                className="font-bold text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Contact Support
              </a>
            </p>
          </aside>
        ) : submission.error ? (
          <div role="alert" className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {submission.error}
          </div>
        ) : null}
        <input
          type="hidden"
          name="expiredAction"
          value={subscriptionStatus === "expired" ? (flowMode === "reactivate" ? "reactivate" : "change") : ""}
        />
        <input type="hidden" name="branchLimit" value={selectedPlan === "custom" ? effectiveBranches : 1} />
        {selectionCustomized ? keepMemberIds.map((id) => <input key={`keep-member-${id}`} type="hidden" name="keepMemberId" value={id} />) : null}
        {selectionCustomized ? keepBranchIds.map((id) => <input key={`keep-branch-${id}`} type="hidden" name="keepBranchId" value={id} />) : null}
        <input type="hidden" name="plan" value={selectedPlan} />
        <input type="hidden" name="termMonths" value={termMonths} />
        {selectedPlan === "custom" ? (
          <input type="hidden" name="userLimit" value={effectiveUsers} />
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_530px] lg:items-end">
          <div>
            <Link
              href="/dashboard/settings/subscription"
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-800 dark:hover:bg-blue-950/30 dark:hover:text-blue-300"
            >
              <ArrowLeft size={17} />
              Back to Subscription
            </Link>
            <h1
              className="mt-5 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl dark:text-white"
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
                  const discount=promotionDiscount(promotions,selectedPlan,term.months);
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
                        {term.months === 12 ? "1 year" : term.months === 1 ? "1 month" : `${term.months} months`}
                      </span>
                      <span className="mt-1 flex min-h-[20px] items-center justify-center">
                        {discount > 0 ? (
                          <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-extrabold leading-4 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                            -{discount}%
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

        {flowMode === "reactivate" ? (
          <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/20">
            <p className="text-sm font-extrabold text-slate-950 dark:text-white">
              Reactivate your latest subscription only
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Your plan and capacity stay the same: {currentSeats} {currentSeats === 1 ? "user" : "users"} · {currentBranches} {currentBranches === 1 ? "branch" : "branches"}. Choose the new billing term, then continue to payment.
            </p>
            <Link
              href="/dashboard/settings/subscription?view=plans&expired=change"
              className="mt-3 inline-flex text-sm font-extrabold text-blue-700 hover:text-blue-800 dark:text-blue-300"
            >
              Choose a different plan instead
            </Link>
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

        <div className={`mt-7 grid gap-5 ${flowMode === "reactivate" ? "max-w-xl" : "md:grid-cols-2 2xl:grid-cols-4"}`}>
          {(flowMode === "reactivate"
            ? [initialPlan]
            : (Object.keys(subscriptionPlans) as SubscriptionPlanKey[])
          ).map((planKey) => {
            const action = actionForPlan(planKey);
            return (
              <PlanCard
              promotions={promotions}
              key={planKey}
              planKey={planKey}
              selected={selectedPlan === planKey}
              current={
                currentPlanKey === planKey &&
                (planKey === "custom" || termMonths === normalizedCurrentTerm)
              }
              disabled={false}
              termMonths={pricingTerm}
              action={action}
              onSelect={() => {
                if (flowMode === "reactivate") {
                  setSelectedPlan(initialPlan);
                  return;
                }
                if (action === "downgrade") {
                  setSelectionCustomized(false);
                  setKeepMemberIds([]);
                  setKeepBranchIds([]);
                  setSelectedPlan(planKey);
                  setSelectionMade(true);
                  return;
                }
                setSelectionCustomized(false);
                setKeepMemberIds([]);
                setKeepBranchIds([]);
                if (planKey === "custom") {
                  setCustomUpgradeMode(flowMode === "upgrade");
                  setCustomUsers(Math.max(currentSeats, effectiveUsers));
                  setCustomBranches(Math.max(currentBranches, effectiveBranches));
                  setCustomDialogOpen(true);
                  return;
                }
                setSelectedPlan(planKey);
                setSelectionMade(true);
              }}
              onUpgrade={flowMode === "upgrade" && currentPlanKey === planKey && planKey !== "custom" ? () => {
                flushSync(() => {
                  setCustomUsers(currentSeats);
                  setCustomBranches(currentBranches);
                  setCustomUpgradeMode(true);
                  setSelectedPlan("custom");
                  setSelectionCustomized(false);
                  setKeepMemberIds([]);
                  setKeepBranchIds([]);
                  setCustomDialogOpen(true);
                });
              } : undefined}
              onDowngrade={action === "downgrade" ? () => {
                setSelectedPlan(planKey);
                setSelectionMade(true);
                setDowngradePlan(planKey);
              } : undefined}
              />
            );
          })}
        </div>
        {customDialogOpen && (
          <CustomPlanDialog
            pricePreviewAt={pricePreviewAt}
            promotions={promotions}
            users={effectiveUsers}
            branches={effectiveBranches}
            months={customUpgradeMode ? termMonths : pricingTerm}
            minimumUsers={customUpgradeMode ? Math.max(currentSeats, activeSeatCount) : 1}
            minimumBranches={customUpgradeMode ? Math.max(currentBranches, activeBranchCount) : 1}
            mode={customUpgradeMode ? "upgrade" : "build"}
            currentMonthlyPrice={currentMonthly}
            currentExpiresAt={currentExpiresAt}
            remainingAccessDays={remainingAccessDays}
            onClose={() => setCustomDialogOpen(false)}
            disabled={!canPurchase}
            onApply={(users, branches, months) => {
              // Normalize dialog values before committing them. This prevents a
              // transient/invalid UI value from crashing the strict price
              // calculator, while server-side pricing validation stays unchanged.
              const safeUsers = normalizeCustomCount(users, 1, 500, currentSeats);
              const safeBranches = normalizeCustomCount(branches, 1, 100, currentBranches);
              const safeMonths: UpgradeTermMonths =
                customUpgradeMode && months === 0 ? 0 : normalizeSubscriptionTerm(months);
              flushSync(() => {
                setCustomUsers(safeUsers);
                setCustomBranches(safeBranches);
                setTermMonths(safeMonths);
                setSelectedPlan("custom");
                setSelectionCustomized(false);
                setKeepMemberIds([]);
                setKeepBranchIds([]);
                setCustomDialogOpen(false);
                setSelectionMade(true);
              });

              if (!canPurchase) return;
              formRef.current?.requestSubmit();
            }}
          />
        )}
        {keepDialogOpen ? (
          <RenewalSelectionDialog
            members={activeMembers}
            branches={activeBranches}
            userLimit={selectedSeatLimit}
            branchLimit={selectedBranchLimit}
            initialMemberIds={selectionCustomized ? keepMemberIds : undefined}
            initialBranchIds={selectionCustomized ? keepBranchIds : undefined}
            onClose={() => setKeepDialogOpen(false)}
            onApply={(memberIds, branchIds) => {
              setKeepMemberIds(memberIds);
              setKeepBranchIds(branchIds);
              setSelectionCustomized(true);
              setKeepDialogOpen(false);
            }}
          />
        ) : null}

        {downgradePlan && downgradeTarget ? (
          <DowngradeNoticeDialog
            planName={downgradeTarget.name}
            currentUsers={activeSeatCount}
            currentBranches={activeBranchCount}
            targetUsers={downgradeTargetUsers}
            targetBranches={downgradeTargetBranches}
            excessUsers={excessDowngradeUsers}
            excessBranches={excessDowngradeBranches}
            currentExpiresAt={currentExpiresAt}
            onClose={() => setDowngradePlan(null)}
          />
        ) : null}

        {flowMode !== "upgrade" || selectionMade ? (
        <section className="sticky bottom-3 z-30 mt-5 rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-[0_-12px_40px_rgba(15,23,42,0.10)] backdrop-blur-xl sm:p-5 dark:border-slate-700 dark:bg-slate-900/95">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-sm font-semibold text-slate-500">Selected:</span>
                <span className="text-lg font-black text-slate-950 dark:text-white">
                  {isSelectedDowngrade
                    ? `${selected.name} · Downgrade after expiry`
                    : `${selected.name} · ${selectedTermLabel}`}
                </span>
              </div>

              {isSelectedDowngrade ? (
                <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/20 dark:text-amber-200">
                  <p className="font-extrabold">No payment is due for a downgrade now.</p>
                  <p className="mt-1 leading-6">
                    Your current plan stays active until expiry. If the new plan has lower limits, TENH POS protects the Owner and Main Branch and disables the newest excess users or branches.
                  </p>
                </div>
              ) : appliesAtTermEnd ? (
                <div className="mt-2 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                  <p className="font-extrabold">Current paid access stays unchanged until {currentExpiresAt ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Phnom_Penh" }).format(new Date(currentExpiresAt)) : "the current term ends"}.</p>
                  <p className="mt-1 leading-6">
                    At that time, this plan becomes active. Excess users and branches are disabled, never deleted. Owner and Main Branch stay protected.
                  </p>
                  {hasExcessUsage ? (
                    <button type="button" onClick={() => setKeepDialogOpen(true)} className="mt-3 rounded-xl border border-blue-300 bg-white px-4 py-2 text-xs font-extrabold text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-300">
                      {selectionCustomized ? "Change selection" : "Select Which to Keep Active"}
                    </button>
                  ) : null}
                  {hasExcessUsage && !selectionCustomized ? <p className="mt-2 text-xs text-blue-700/80 dark:text-blue-300/80">If you skip selection, TENH POS keeps the oldest allowed users and branches after the protected Owner/Main Branch, so the newest excess records are disabled automatically.</p> : null}
                </div>
              ) : subscriptionStatus === "trialing" && remainingAccessDays > 0 ? (
                <p className="mt-2 text-sm font-semibold text-blue-600 dark:text-blue-300">
                  Your remaining {remainingAccessDays} trial {remainingAccessDays === 1 ? "day" : "days"} will be added to the paid subscription expiry after approval.
                </p>
              ) : flowMode === "upgrade" && !appliesAtTermEnd && remainingAccessDays > 0 ? (
                <div className="mt-2 text-sm font-semibold text-blue-600 dark:text-blue-300">
                  <p>
                    {termMonths === 0
                      ? `Your remaining ${remainingAccessDays} paid ${remainingAccessDays === 1 ? "day" : "days"} stay protected. No new duration is added.`
                      : `Your remaining ${remainingAccessDays} paid ${remainingAccessDays === 1 ? "day" : "days"} stay protected. Your selected ${selectedTermLabel} term is added after the current paid expiry.`}
                  </p>
                  {capacityUpgradeProration > 0 ? (
                    <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                      Added capacity for the remaining paid time: ${capacityUpgradeProration.toFixed(2)}
                    </p>
                  ) : null}
                </div>
              ) : price && price.discountAmount > 0 ? (
                <p className="mt-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  You save ${price.discountAmount.toFixed(2)} with the {selectedTermLabel} term.
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-8 border-slate-200 lg:border-l lg:px-8 dark:border-slate-700">
              {isSelectedDowngrade ? (
                <div>
                  <p className="text-xs font-semibold text-slate-500">Due today</p>
                  <p className="mt-1 text-2xl font-black text-slate-950 dark:text-white">$0.00</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">Pay after expiry</p>
                </div>
              ) : price ? (
                flowMode === "upgrade" ? (
                  <>
                    {capacityUpgradeProration > 0 ? (
                      <div>
                        <p className="text-xs font-semibold text-slate-500">Added capacity</p>
                        <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">${capacityUpgradeProration.toFixed(2)}</p>
                      </div>
                    ) : null}
                    <div>
                      <p className="text-xs font-semibold text-slate-500">Due today</p>
                      <p className="mt-1 text-2xl font-black text-slate-950 dark:text-white">${(estimatedPayOnce ?? 0).toFixed(2)}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-xs font-semibold text-slate-500">Per month</p>
                      <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">${(price.total / pricingTerm).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500">Subtotal</p>
                      <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">${price.subtotal.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500">Pay once</p>
                      <p className="mt-1 text-2xl font-black text-slate-950 dark:text-white">${price.total.toFixed(2)}</p>
                    </div>
                  </>
                )
              ) : (
                <div>
                  <p className="text-xs font-semibold text-slate-500">Price</p>
                  <p className="mt-1 text-xl font-black text-slate-950 dark:text-white">
                    Manual quote
                  </p>
                </div>
              )}
            </div>

            {isSelectedDowngrade ? (
              <button
                type="button"
                disabled={!canPurchase}
                onClick={() => setDowngradePlan(selectedPlan)}
                className="inline-flex min-h-14 min-w-56 items-center justify-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-7 py-4 text-base font-extrabold text-amber-900 transition hover:border-amber-400 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
              >
                Downgrade
                <ArrowRight size={20} />
              </button>
            ) : (
              <PurchaseButton
                disabled={!canPurchase || selectionCoveredByCredit}
                flowMode={flowMode}
              />
            )}
          </div>
        </section>
        ) : null}
      </form>
    </main>
  );
}

function PlanCard({
  promotions,
  planKey,
  selected,
  current,
  disabled,
  termMonths,
  onSelect,
  onUpgrade,
  onDowngrade,
  action,
}: {
  promotions: Promotion[];
  planKey: SubscriptionPlanKey;
  selected: boolean;
  current: boolean;
  disabled: boolean;
  termMonths: SubscriptionTermMonths;
  onSelect: () => void;
  onUpgrade?: () => void;
  onDowngrade?: () => void;
  action: "upgrade" | "downgrade" | "select" | "customize";
}) {
  const plan = subscriptionPlans[planKey];
  const meta = visualMeta[planKey];
  const Icon = meta.icon;
  const features = meta.features;
  const termPrice =
    planKey === "custom"
      ? null
      : promotionPrice(calculateSubscriptionPrice(planKey, termMonths),promotions,planKey,termMonths);
  const effectiveMonthly = termPrice
    ? Number((termPrice.total / termMonths).toFixed(2))
    : null;
  const selectedTerm = subscriptionTerms.find((term) => term.months === termMonths);
  const currentStandard = current && planKey !== "custom";

  return (
    <article
      role={currentStandard ? undefined : "button"}
      tabIndex={disabled || currentStandard ? -1 : 0}
      aria-pressed={currentStandard ? undefined : selected}
      aria-disabled={disabled || currentStandard}
      onClick={() => { if (!disabled && !currentStandard) onSelect(); }}
      onKeyDown={(event) => {
        if (!disabled && !currentStandard && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`group flex min-h-[530px] flex-col rounded-3xl border bg-white p-6 shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-slate-900 ${disabled ? "cursor-not-allowed opacity-55" : currentStandard ? "cursor-default" : "cursor-pointer"} ${
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


      {!currentStandard ? (
        <button
          type="button"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            if (disabled) return;
            if (action === "downgrade" && onDowngrade) onDowngrade();
            else if (current && onUpgrade) onUpgrade();
            else onSelect();
          }}
          className={`mt-auto flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3.5 text-sm font-extrabold transition ${
            action === "upgrade"
              ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
              : action === "downgrade"
                ? "border-amber-300 bg-amber-50 text-amber-800 hover:border-amber-400 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                : selected
                ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"
                : "border-slate-200 bg-slate-50 text-blue-600 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-950 dark:text-blue-300"
          }`}
        >
          {action === "upgrade" ? <ArrowRight size={21} /> : selected ? <CircleDot size={21} /> : <Circle size={21} />}
          {action === "upgrade" ? "Upgrade" : action === "downgrade" ? "Downgrade" : action === "customize" ? "Customize plan" : "Select plan"}
        </button>
      ) : null}
    </article>
  );
}

function DowngradeNoticeDialog({
  planName,
  currentUsers,
  currentBranches,
  targetUsers,
  targetBranches,
  excessUsers,
  excessBranches,
  currentExpiresAt,
  onClose,
}: {
  planName: string;
  currentUsers: number;
  currentBranches: number;
  targetUsers: number;
  targetBranches: number;
  excessUsers: number;
  excessBranches: number;
  currentExpiresAt: string | null;
  onClose: () => void;
}) {
  const expiryLabel = currentExpiresAt
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "Asia/Phnom_Penh",
      }).format(new Date(currentExpiresAt))
    : "the end of your current subscription";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="downgrade-title"
        className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-7 dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            <AlertTriangle size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-amber-700 dark:text-amber-300">
                  Safe downgrade
                </p>
                <h2 id="downgrade-title" className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white">
                  Downgrade to {planName} after expiry
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close downgrade notice"
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X size={20} />
              </button>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
              No payment is created now and your current paid access stays unchanged until {expiryLabel}.
            </p>

            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/70 dark:bg-amber-950/20">
              <p className="text-sm font-extrabold text-slate-950 dark:text-white">
                Current usage: {currentUsers} users · {currentBranches} branches
              </p>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                {planName} allows up to {targetUsers} {targetUsers === 1 ? "user" : "users"} and {targetBranches} {targetBranches === 1 ? "branch" : "branches"}.
              </p>
              {excessUsers > 0 || excessBranches > 0 ? (
                <p className="mt-3 text-sm font-semibold leading-6 text-amber-900 dark:text-amber-200">
                  After expiry, Owner and Main Branch stay protected. The newest excess {excessUsers > 0 ? `${excessUsers} ${excessUsers === 1 ? "user" : "users"}` : ""}{excessUsers > 0 && excessBranches > 0 ? " and " : ""}{excessBranches > 0 ? `${excessBranches} ${excessBranches === 1 ? "branch" : "branches"}` : ""} are disabled first. Nothing is deleted.
                </p>
              ) : (
                <p className="mt-3 text-sm font-semibold leading-6 text-amber-900 dark:text-amber-200">
                  Your current active users and branches already fit within this plan, so no records need to be disabled.
                </p>
              )}
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
              When your current plan expires, choose a lower plan and pay for the new term. Your current plan stays active until then.
            </p>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="min-h-12 rounded-xl bg-slate-950 px-5 py-3 text-sm font-extrabold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              >
                I understand
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function PurchaseButton({
  disabled,
  flowMode,
}: {
  disabled: boolean;
  flowMode: "choose" | "upgrade" | "reactivate";
}) {
  const { pending } = useFormStatus();
  const label = flowMode === "upgrade"
    ? "Continue to payment"
    : flowMode === "reactivate"
      ? "Continue to reactivate"
      : "Continue to payment";

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
