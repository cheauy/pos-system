import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export type BusinessChangeEntitlements = {
  planKey: string;
  urlFreeLimit: number;
  modeFreeLimit: number;
  urlFreeUsed: number;
  modeFreeUsed: number;
  urlFreeRemaining: number;
  modeFreeRemaining: number;
  urlCredits: number;
  modeCredits: number;
};

export async function getBusinessChangeEntitlements(
  businessId: string,
): Promise<BusinessChangeEntitlements> {
  const { data: business, error } = await supabaseAdmin
    .from("businesses")
    .select(
      "subscription_plan_key,subscription_status,free_url_changes_per_month,free_business_mode_changes_per_month",
    )
    .eq("id", businessId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load subscription entitlements: ${error.message}`);
  }

  const activeEntitlements =
    business?.subscription_status === "active" &&
    (business?.subscription_plan_key === "growth" || business?.subscription_plan_key === "custom");

  const urlFreeLimit = activeEntitlements
    ? Number(business?.free_url_changes_per_month ?? 0)
    : 0;
  const modeFreeLimit = activeEntitlements
    ? Number(business?.free_business_mode_changes_per_month ?? 0)
    : 0;

  // Monthly allowances reset at midnight in TENH POS's business timezone
  // (Asia/Phnom_Penh, UTC+7), not at 07:00 local time.
  const now = new Date();
  const phnomPenhNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const startOfMonth = new Date(
    Date.UTC(
      phnomPenhNow.getUTCFullYear(),
      phnomPenhNow.getUTCMonth(),
      1,
      0,
      0,
      0,
      0,
    ) -
      7 * 60 * 60 * 1000,
  );

  const { data: orders, error: ordersError } = await supabaseAdmin
    .from("business_change_orders")
    .select("included_url_change,included_business_mode_change,used_url_credit,used_mode_credit,status")
    .eq("business_id", businessId)
    .eq("credit_purchase", false)
    .gte("created_at", startOfMonth.toISOString())
    .in("status", ["pending_payment", "payment_submitted", "paid", "applied"]);

  if (ordersError) {
    throw new Error(`Unable to load monthly change allowance: ${ordersError.message}`);
  }

  const urlFreeUsed = (orders ?? []).filter((order) => order.included_url_change && !order.used_url_credit).length;
  const modeFreeUsed = (orders ?? []).filter((order) => order.included_business_mode_change && !order.used_mode_credit).length;
  const {data:credits,error:creditsError}=await supabaseAdmin.from("business_change_credits").select("url_remaining,mode_remaining").eq("business_id",businessId).or("url_remaining.gt.0,mode_remaining.gt.0");
  if(creditsError)throw new Error("Unable to load purchased change credits.");
  const urlCredits=(credits??[]).reduce((sum,row)=>sum+row.url_remaining,0);
  const modeCredits=(credits??[]).reduce((sum,row)=>sum+row.mode_remaining,0);

  return {
    planKey: business?.subscription_plan_key ?? "legacy",
    urlFreeLimit,
    modeFreeLimit,
    urlFreeUsed,
    modeFreeUsed,
    urlFreeRemaining: Math.max(0, urlFreeLimit - urlFreeUsed),
    modeFreeRemaining: Math.max(0, modeFreeLimit - modeFreeUsed),
    urlCredits,
    modeCredits,
  };
}
