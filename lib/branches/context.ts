import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business/get-current-business";

export const branchCookie = (businessId: string, userId: string) => `tenh-branch-${businessId}-${userId}`;

// The cookie is a preference, never authorization. Resolve it against the signed-in
// membership and this business's active locations on every request.
export const getBranchContext = cache(async () => {
  const business = await getCurrentBusiness();
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error("Please sign in again.");
  const [membership, locations] = await Promise.all([
    db.from("business_members").select("default_location_id").eq("business_id", business.id).eq("user_id", user.id).eq("is_active", true).single(),
    db.from("business_locations").select("id,name,is_default,is_active").eq("business_id", business.id).eq("is_active", true).order("is_default", { ascending: false }).order("name"),
  ]);
  if (membership.error || locations.error) throw new Error("Unable to load your branch assignment.");
  const branches = locations.data ?? [];
  const ownBranchId = branches.find(b => b.id === membership.data.default_location_id)?.id ?? branches[0]?.id ?? "";
  const saved = (await cookies()).get(branchCookie(business.id, user.id))?.value;
  const branchId = branches.find(b => b.id === saved)?.id ?? ownBranchId;
  return { business, userId: user.id, branches, ownBranchId, branchId };
});

// Analytics selections are navigation-only: a fresh document (including reload)
// starts at the staff member's own branch, independently of the operating branch.
export async function getViewingBranchId(requested?: string) {
  const context = await getBranchContext();
  const isClientNavigation = (await headers()).get("rsc") === "1";
  if (!isClientNavigation || requested === undefined) return context.ownBranchId;
  if (requested === "all" || requested === "") return "";
  const db = await createClient();
  const { data, error } = await db.from("business_locations").select("id").eq("business_id", context.business.id).eq("id", requested).maybeSingle();
  if (error || !data) throw new Error("Branch does not belong to this business.");
  return data.id as string;
}

export async function assertOperatingBranch(branchId: string) {
  const context = await getBranchContext();
  if (!branchId || context.branchId !== branchId) throw new Error("The operating branch changed. Reload this screen before continuing.");
  return context;
}
