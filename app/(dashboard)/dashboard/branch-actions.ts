"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { branchCookie, getBranchContext } from "@/lib/branches/context";
import { assertBranchOperation } from "@/lib/subscriptions/branch-limits";
import { isBranchId, validSwitchOrigin, type BranchSwitchOrigin } from "@/lib/branches/switch-model";

export async function switchOperatingBranch(branchId: string, origin: BranchSwitchOrigin) {
  try {
    if (!isBranchId(branchId) || !validSwitchOrigin(origin)) throw new Error("Refresh the workspace before switching branches.");
    const context = await getBranchContext();
    if (context.business.id !== origin.businessId || context.userId !== origin.userId) throw new Error("Your active business or account changed. Reload the workspace.");
    if (context.branchId !== origin.branchId && context.branchId !== branchId) throw new Error("The workspace branch changed in another tab. Reload before switching again.");
    if (!context.branches.some(b=>b.id === branchId)) throw new Error("Choose an active branch in this business.");
    await assertBranchOperation(context.business.id, branchId);
    (await cookies()).set(branchCookie(context.business.id, context.userId), branchId, {
      httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV === "production",path:"/",maxAge:60*60*24*365,
    });
    // Cookie has been set. A cache error must not encourage a conflicting retry.
    try {revalidatePath("/dashboard", "layout");} catch { /* Full document navigation below fetches current context. */ }
    return { success:true as const, branchId, businessId:context.business.id, userId:context.userId };
  } catch (error) {
    return { success:false as const, message:error instanceof Error?error.message:"Unable to switch branch. Reload before retrying." };
  }
}
export async function getOperatingBranchStatus(businessId: string, userId: string) {
  try {
    const context=await getBranchContext();
    if (context.business.id!==businessId || context.userId!==userId) throw new Error('Your active business or account changed. Reload the workspace.');
    return {success:true as const,branchId:context.branchId};
  } catch(error) { return {success:false as const,message:error instanceof Error?error.message:'Unable to verify the workspace branch.'}; }
}
