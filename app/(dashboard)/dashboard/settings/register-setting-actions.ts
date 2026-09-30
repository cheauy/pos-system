"use server";
import {revalidatePath} from "next/cache";
import {requirePermission} from "@/lib/auth/require-permission";
import {assertOperatingBranch} from "@/lib/branches/context";
import {createClient} from "@/lib/supabase/branch-server";

export async function saveRegisterRequirement(businessId:string,branchId:string,required:boolean) {
  const business=await requirePermission("pos.access");
  if(business.id!==businessId||business.role!=="owner")throw new Error("Only the owner can change this setting.");
  if(typeof required!=="boolean")throw new Error("Choose whether a register is required.");
  await assertOperatingBranch(branchId);
  const db=await createClient();
  const {error}=await db.from("branch_pos_settings").update({require_open_register:required}).eq("business_id",business.id).eq("location_id",branchId).select("location_id").single();
  if(error)throw new Error("Unable to save the register setting. Refresh and try again.");
  revalidatePath("/dashboard/settings");revalidatePath("/dashboard/pos");
}
