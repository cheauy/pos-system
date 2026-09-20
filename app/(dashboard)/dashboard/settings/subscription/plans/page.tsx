import { getBranchEntitlement } from "@/lib/subscriptions/branch-limits";
import { getCurrentBusinessForSubscription } from "@/lib/business/get-current-business";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  calculateSubscriptionPrice,
  isSubscriptionPlanKey,
  isSubscriptionTermMonths,
} from "@/lib/subscriptions/plans";
import SubscriptionPlansClient from "../subscription-plans-client";

type SubscriptionRow = {
  subscription_plan_key: string | null;
  subscription_status: string | null;
  subscription_user_limit: number | null;
  subscription_months: number | null;
  subscription_started_at: string | null;
  subscription_expires_at: string | null;
  subscription_cycle_value: number | string | null;
};

function remainingValueCredit(
  startValue: string | null,
  endValue: string | null,
  cycleValue: number,
) {
  if (!startValue || !endValue || cycleValue <= 0) return 0;

  const start = new Date(startValue).getTime();
  const end = new Date(endValue).getTime();
  const now = Date.now();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end <= now) {
    return 0;
  }

  const total = end - start;
  const remaining = Math.min(total, Math.max(0, end - now));
  return Number((cycleValue * (remaining / total)).toFixed(2));
}

export default async function SubscriptionPlansPage({
  searchParams,
}: {
  searchParams?: Promise<{ onboarding?: string; trial?: string }>;
}) {
  const query = searchParams ? await searchParams : {};
  const requestedOnboarding = query.onboarding === "1";
  const business = await getCurrentBusinessForSubscription({
    startTrial: false,
  });

  const [
    { data: subscription, error: subscriptionError },
    { count: activeSeatCount, error: seatError },
  ] = await Promise.all([
    supabaseAdmin
      .from("businesses")
      .select(
        "subscription_plan_key,subscription_status,subscription_user_limit,subscription_months,subscription_started_at,subscription_expires_at,subscription_cycle_value",
      )
      .eq("id", business.id)
      .maybeSingle(),
    supabaseAdmin
      .from("business_members")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("is_active", true),
  ]);

  if (subscriptionError) {
    throw new Error(`Unable to load subscription: ${subscriptionError.message}`);
  }

  if (seatError) {
    throw new Error(`Unable to load team usage: ${seatError.message}`);
  }

  const branches = await getBranchEntitlement(business.id);
  const current = (subscription ?? null) as SubscriptionRow | null;
  const status = current?.subscription_status ?? business.subscriptionStatus;
  const onboarding =
    requestedOnboarding ||
    status === "trial_pending" ||
    status === "trial_blocked";
  const currentPlanKey =
    current?.subscription_plan_key ?? (status === "trialing" ? "trial" : "legacy");

  const paidCurrentPlan = isSubscriptionPlanKey(currentPlanKey)
    ? currentPlanKey
    : null;

  const flowMode: "choose" | "upgrade" | "reactivate" =
    status === "expired"
      ? "reactivate"
      : status === "active" && paidCurrentPlan
        ? "upgrade"
        : "choose";

  let cycleValue = Number(current?.subscription_cycle_value ?? 0);

  if (
    flowMode === "upgrade" &&
    cycleValue <= 0 &&
    paidCurrentPlan &&
    paidCurrentPlan !== "custom" &&
    isSubscriptionTermMonths(Number(current?.subscription_months))
  ) {
    cycleValue = calculateSubscriptionPrice(
      paidCurrentPlan,
      Number(current?.subscription_months) as 1 | 3 | 6 | 12,
    ).total;
  }

  const estimatedRemainingCredit =
    flowMode === "upgrade"
      ? remainingValueCredit(
          current?.subscription_started_at ?? null,
          current?.subscription_expires_at ?? null,
          cycleValue,
        )
      : 0;

  return (
    <SubscriptionPlansClient
      businessName={business.name}
      currentPlanKey={currentPlanKey}
      currentBranchLimit={branches.limit}
      activeBranchCount={branches.used}
      currentUserLimit={current?.subscription_user_limit ?? null}
      activeSeatCount={activeSeatCount ?? 1}
      canPurchase={business.role === "owner"}
      flowMode={flowMode}
      estimatedRemainingCredit={estimatedRemainingCredit}
      onboarding={onboarding}
      subscriptionStatus={status}
      trialUnavailable={query.trial === "unavailable" || status === "trial_blocked"}
    />
  );
}
