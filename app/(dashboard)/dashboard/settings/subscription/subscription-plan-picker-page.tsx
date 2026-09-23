import { getBranchEntitlement } from "@/lib/subscriptions/branch-limits";
import { getCurrentBusinessForSubscription } from "@/lib/business/get-current-business";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isSubscriptionPlanKey } from "@/lib/subscriptions/plans";
import type {
  RenewalBranchOption,
  RenewalMemberOption,
} from "./renewal-selection-dialog";
import SubscriptionPlansClient from "./subscription-plans-client";

type SubscriptionRow = {
  subscription_plan_key: string | null;
  subscription_status: string | null;
  subscription_user_limit: number | null;
  subscription_months: number | null;
  subscription_started_at: string | null;
  subscription_expires_at: string | null;
  subscription_cycle_value: number | string | null;
  subscription_monthly_price: number | string | null;
  trial_expires_at: string | null;
};

type MemberRow = {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  is_active: boolean;
  disabled_reason: string | null;
  team_password_required: boolean | null;
  team_name: string | null;
};

export default async function SubscriptionPlanPickerPage({
  searchParams,
  businessOverride,
}: {
  searchParams?: Promise<{ onboarding?: string; trial?: string; expired?: string }>;
  businessOverride?: Awaited<ReturnType<typeof getCurrentBusinessForSubscription>>;
}) {
  const query = searchParams ? await searchParams : {};
  const requestedOnboarding = query.onboarding === "1";
  const business = businessOverride ?? await getCurrentBusinessForSubscription({
    startTrial: false,
  });

  const [
    { data: subscription, error: subscriptionError },
    { data: members, error: membersError },
    { data: activeBranches, error: branchesError },
  ] = await Promise.all([
    supabaseAdmin
      .from("businesses")
      .select(
        "subscription_plan_key,subscription_status,subscription_user_limit,subscription_months,subscription_started_at,subscription_expires_at,subscription_cycle_value,subscription_monthly_price,trial_expires_at",
      )
      .eq("id", business.id)
      .maybeSingle(),
    supabaseAdmin
      .from("business_members")
      .select("id,user_id,role,created_at,is_active,disabled_reason,team_password_required,team_name")
      .eq("business_id", business.id)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("business_locations")
      .select("id,name,is_default,is_active,created_at,plan_disable_pending")
      .eq("business_id", business.id)
      .eq("is_active", true)
      .eq("plan_disable_pending", false)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true }),
  ]);

  if (subscriptionError) throw new Error(`Unable to load subscription: ${subscriptionError.message}`);
  if (membersError) throw new Error(`Unable to load team usage: ${membersError.message}`);
  if (branchesError) throw new Error(`Unable to load branch usage: ${branchesError.message}`);

  const seatRows = ((members ?? []) as MemberRow[]).filter(
    (member) =>
      member.disabled_reason !== "removed_by_owner" &&
      (member.is_active ||
        (Boolean(member.team_password_required) && member.disabled_reason === "password_setup")),
  );
  const userIds = [...new Set(seatRows.map((member) => member.user_id))];
  const profileNames = new Map<string, { name: string; email: string }>();
  if (userIds.length) {
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id,full_name,email")
      .in("id", userIds);
    if (profileError) throw new Error(`Unable to load team names: ${profileError.message}`);
    for (const profile of profiles ?? []) {
      profileNames.set(profile.id, {
        name: profile.full_name || "Team member",
        email: profile.email || "",
      });
    }
  }

  const memberOptions: RenewalMemberOption[] = seatRows.map((member) => {
    const profile = profileNames.get(member.user_id);
    return {
      id: member.id,
      name: member.team_name?.trim() || profile?.name || "Team member",
      email: profile?.email || "",
      role: member.role,
      createdAt: member.created_at,
    };
  });
  const branchOptions: RenewalBranchOption[] = (activeBranches ?? []).map((branch) => ({
    id: branch.id,
    name: branch.name,
    isDefault: Boolean(branch.is_default),
    createdAt: branch.created_at,
  }));

  const branches = await getBranchEntitlement(business.id);
  const current = (subscription ?? null) as SubscriptionRow | null;
  const status = business.subscriptionStatus;
  const onboarding = requestedOnboarding || status === "trial_pending" || status === "trial_blocked";
  const currentPlanKey = current?.subscription_plan_key ?? (status === "trialing" ? "trial" : "legacy");
  const paidCurrentPlan = isSubscriptionPlanKey(currentPlanKey) ? currentPlanKey : null;
  const flowMode: "choose" | "upgrade" | "reactivate" =
    status === "active" && paidCurrentPlan
        ? "upgrade"
        : "choose";

  const accessExpiresAt =
    status === "trialing"
      ? current?.trial_expires_at ?? null
      : current?.subscription_expires_at ?? null;
  const remainingAccessDays = accessExpiresAt
    ? Math.max(0, Math.ceil((new Date(accessExpiresAt).getTime() - Date.now()) / 86_400_000))
    : 0;

  return (
    <SubscriptionPlansClient
      businessId={business.id}
      businessName={business.name}
      currentPlanKey={currentPlanKey}
      currentBranchLimit={status === "expired" ? branches.configuredLimit : branches.limit}
      activeBranchCount={branchOptions.length}
      currentUserLimit={current?.subscription_user_limit ?? null}
      currentMonthlyPrice={current?.subscription_monthly_price === null || current?.subscription_monthly_price === undefined ? null : Number(current.subscription_monthly_price)}
      currentTermMonths={current?.subscription_months ?? null}
      activeSeatCount={memberOptions.length}
      activeMembers={memberOptions}
      activeBranches={branchOptions}
      currentExpiresAt={accessExpiresAt}
      remainingAccessDays={remainingAccessDays}
      canPurchase={business.role === "owner"}
      flowMode={flowMode}
      onboarding={onboarding}
      subscriptionStatus={status}
      trialUnavailable={query.trial === "unavailable" || status === "trial_blocked"}
    />
  );
}
