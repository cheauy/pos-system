"use server";
import { revalidatePath } from "next/cache";
import { getCurrentBusiness } from "@/lib/business/get-current-business";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { saveSupportReport } from "@/lib/support/save-report";

export async function submitCustomerBugReport(form: FormData) {
  const business = await getCurrentBusiness();
  const client = await createClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return { ok: false, message: "Please sign in again." };
  const membership = await supabaseAdmin.from("business_members").select("id").eq("business_id", business.id).eq("user_id", user.id).eq("is_active", true).maybeSingle();
  if (membership.error || !membership.data) return { ok: false, message: "Your workspace access is unavailable." };
  // Resolve ownership on the server; posted business/user/status fields are ignored.
  const result=await saveSupportReport(form,user.id,business.id);
  if(!result.ok)return result;
  try { revalidatePath("/dashboard/settings/support"); revalidatePath("/super-admin/support"); } catch { console.error("Customer bug report saved; page refresh failed."); }
  return result;
}
