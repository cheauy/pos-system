import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function getBranchEntitlement(businessId: string) {
  const [{ data: business, error }, { data: activeBranches, error: branchError }] = await Promise.all([
    supabaseAdmin.from("businesses").select("*").eq("id", businessId).single(),
    supabaseAdmin
      .from("business_locations")
      .select("id,name,is_default,is_active,plan_disable_pending")
      .eq("business_id", businessId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .order("name"),
  ]);

  if (error || branchError) throw new Error("Unable to verify branch subscription limits.");

  const configuredLimit = Math.max(
    1,
    Number(business.subscription_branch_limit) || 1,
  );
  const expiryMs = business.subscription_expires_at
    ? new Date(business.subscription_expires_at).getTime()
    : Number.NaN;
  const expiredByTime = Number.isFinite(expiryMs) && expiryMs <= Date.now();
  const accessLocked =
    business.subscription_status === "expired" ||
    business.subscription_status === "trial_pending" ||
    business.subscription_status === "trial_blocked" ||
    expiredByTime;
  const limit =
    business.subscription_status === "active" && !accessLocked
      ? configuredLimit
      : 1;
  const allActive = activeBranches ?? [];
  const branches = allActive.filter((branch) => !branch.plan_disable_pending);
  const pendingBranches = allActive.filter((branch) => branch.plan_disable_pending);

  return {
    limit,
    configuredLimit,
    accessLocked,
    branches,
    pendingBranches,
    used: branches.length,
    activeUsed: allActive.length,
    ready: "subscription_branch_limit" in business,
  };
}

export async function assertBranchCapacity(businessId: string) {
  const entitlement = await getBranchEntitlement(businessId);
  if (entitlement.accessLocked) {
    throw new Error("Subscription expired or inactive. Reactivate it before creating or enabling branches.");
  }
  if (!entitlement.ready) {
    throw new Error("Apply the branch subscription migration before creating or reactivating branches.");
  }
  // A branch waiting for its open register to close still occupies physical
  // branch capacity. Do not let a new branch bypass the selected plan while it
  // is in that closing-only state.
  if (entitlement.activeUsed >= entitlement.limit) {
    throw new Error(`Your plan allows ${entitlement.limit} active branch(es). Choose a plan with more branches before adding another branch.`);
  }
}

export async function assertBranchOperation(businessId: string, branchId: string) {
  const entitlement = await getBranchEntitlement(businessId);
  if (entitlement.accessLocked) {
    throw new Error("Subscription expired. Reactivate it before switching or using branches.");
  }
  if (!entitlement.branches.some((branch) => branch.id === branchId)) {
    if (entitlement.pendingBranches.some((branch) => branch.id === branchId)) {
      throw new Error("This branch is closing after the plan change. Close its open register before continuing other operations.");
    }
    throw new Error("Choose an active branch in this business.");
  }
  if (entitlement.used > entitlement.limit) {
    throw new Error("Available branches exceed your subscription limit. Review the selected plan before continuing.");
  }
}
