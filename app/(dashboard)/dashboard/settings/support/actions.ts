"use server";
import { revalidatePath } from "next/cache";
import { getCurrentBusiness } from "@/lib/business/get-current-business";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function submitCustomerBugReport(form: FormData) {
  const business = await getCurrentBusiness();
  const client = await createClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return { ok: false, message: "Please sign in again." };
  const membership = await supabaseAdmin.from("business_members").select("id").eq("business_id", business.id).eq("user_id", user.id).eq("is_active", true).maybeSingle();
  if (membership.error || !membership.data) return { ok: false, message: "Your workspace access is unavailable." };
  const text = (key: string) => { const value = form.get(key); return typeof value === "string" ? value.trim() : ""; };
  const title = text("title"), description = text("description"), priority = text("priority") || "normal";
  const pagePath = text("pagePath").split(/[?#]/)[0];
  if (title.length < 3 || title.length > 160 || description.length < 10 || description.length > 6000 || !["low", "normal", "urgent"].includes(priority) || pagePath.length > 500 || (pagePath && !/^\/(?!\/)/.test(pagePath))) {
    return { ok: false, message: "Enter a title, describe the problem, and use a page path starting with /." };
  }
  // Resolve ownership on the server; posted business/user/status fields are ignored.
  const { error } = await supabaseAdmin.from("platform_support_reports").insert({ business_id: business.id, created_by: user.id, title, description, priority, page_path: pagePath, status: "open" });
  if (error) return { ok: false, message: "Unable to send your report. Your details have been kept; please try again." };
  try { revalidatePath("/dashboard/settings/support"); revalidatePath("/super-admin/support"); } catch { console.error("Customer bug report saved; page refresh failed."); }
  return { ok: true, message: "Report sent to Support. You can track its status below." };
}
