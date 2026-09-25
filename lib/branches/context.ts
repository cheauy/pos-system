import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
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
    db.from("business_members").select("default_location_id,role").eq("business_id", business.id).eq("user_id", user.id).eq("is_active", true).single(),
    db.from("business_locations").select("id,name,is_default,is_active,plan_disable_pending").eq("business_id", business.id).eq("is_active", true).eq("plan_disable_pending", false).order("is_default", { ascending: false }).order("name"),
  ]);
  if (membership.error || locations.error) throw new Error("Unable to load your branch assignment.");
  if (!membership.data) throw new Error("Your workspace access is unavailable.");
  const owner = membership.data.role === 'owner';
  const available = locations.data ?? [];
  const assigned = available.find(b => b.id === membership.data.default_location_id);
  if (!owner && !assigned) throw new Error("Your assigned branch is unavailable. Ask the Owner to assign an active branch.");
  const branches = owner ? available : available.filter(b => b.id === assigned?.id);
  const ownBranchId = assigned?.id ?? branches[0]?.id ?? "";
  const saved = (await cookies()).get(branchCookie(business.id, user.id))?.value;
  const branchId = owner ? branches.find(b => b.id === saved)?.id ?? ownBranchId : ownBranchId;
  return { business, userId: user.id, branches, ownBranchId, branchId };
});

// A fresh workspace always defaults to the operating branch. Explicit report
// comparisons remain view-only and do not alter the operating-branch cookie.
export async function getViewingBranchId(requested?: string) {
  const context=await getBranchContext();
  if (requested === undefined) return context.branchId;
  if (requested === 'all' || requested === '') return context.business.role === 'owner' ? '' : context.branchId;
  if (!/^[0-9a-f-]{36}$/i.test(requested)) throw new Error('Choose a valid branch.');
  if (context.business.role !== 'owner' && requested !== context.branchId) throw new Error('This branch is not assigned to your account.');
  const db=await createClient();
  const {data,error}=await db.from('business_locations').select('id').eq('business_id',context.business.id).eq('id',requested).maybeSingle();
  if(error || !data)throw new Error('Branch does not belong to this business.');
  return data.id as string;
}

export async function assertOperatingBranch(branchId: string) {
  const context = await getBranchContext();
  if (!branchId || context.branchId !== branchId) throw new Error("The operating branch changed. Reload this screen before continuing.");
  return context;
}
