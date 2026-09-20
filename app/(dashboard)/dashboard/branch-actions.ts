"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { branchCookie, getBranchContext } from "@/lib/branches/context";
import { assertBranchOperation } from "@/lib/subscriptions/branch-limits";

export async function switchOperatingBranch(branchId: string) {
  try {
    const context = await getBranchContext();
    await assertBranchOperation(context.business.id, branchId);
    (await cookies()).set(branchCookie(context.business.id, context.userId), branchId, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/",
    });
    revalidatePath("/dashboard", "layout");
    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: error instanceof Error ? error.message : "Unable to switch branch." };
  }
}
