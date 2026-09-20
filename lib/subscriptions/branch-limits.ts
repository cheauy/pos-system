import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function getBranchEntitlement(businessId: string) {
  const [{ data: business, error }, { data: branches, error: branchError }] = await Promise.all([
    supabaseAdmin.from("businesses").select("*").eq("id", businessId).single(),
    supabaseAdmin.from("business_locations").select("id,name,is_default,is_active").eq("business_id", businessId).eq("is_active", true).order("is_default", { ascending: false }).order("name"),
  ]);
  if (error || branchError) throw new Error("Unable to verify branch subscription limits.");
  const limit = business.subscription_status === "active" && business.subscription_plan_key === "custom" ? Math.max(1, Number(business.subscription_branch_limit) || 1) : 1;
  return { limit, branches: branches ?? [], used: branches?.length ?? 0, ready: "subscription_branch_limit" in business };
}
export async function assertBranchCapacity(businessId: string) {
  const entitlement = await getBranchEntitlement(businessId);
  if (!entitlement.ready) throw new Error("Apply the branch subscription migration before creating or reactivating branches.");
  if (entitlement.used >= entitlement.limit) throw new Error(`Your plan allows ${entitlement.limit} active branch(es). Upgrade Custom Plan before adding another branch.`);
}
export async function assertBranchOperation(businessId: string, branchId: string) {
  const entitlement = await getBranchEntitlement(businessId);
  if (!entitlement.branches.some(branch => branch.id === branchId)) throw new Error("Choose an active branch in this business.");
  if (entitlement.used > entitlement.limit) throw new Error("Active branches exceed your subscription. Upgrade the plan or deactivate unused branches before continuing.");
}
