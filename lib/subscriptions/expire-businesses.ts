import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export async function expireDueBusinesses() {
  // Paid next-plan orders must be applied before the normal expiry sweep. This
  // prevents a business from being locked for subscription expiry at the same
  // instant its already-approved next term should begin.
  const { data: appliedData, error: appliedError } = await supabaseAdmin.rpc(
    "tenh_apply_due_subscription_renewals",
    { p_business_id: null },
  );

  if (appliedError && appliedError.code !== "PGRST202" && appliedError.code !== "42883") {
    throw new Error(`Unable to apply scheduled subscriptions: ${appliedError.message}`);
  }

  const { data, error } = await supabaseAdmin.rpc(
    "expire_due_businesses",
  );

  if (error) {
    throw new Error(
      `Unable to expire businesses: ${error.message}`,
    );
  }

  return {
    appliedRenewalCount: typeof appliedData === "number" ? appliedData : 0,
    expiredCount:
      typeof data === "number" ? data : 0,
  };
}
