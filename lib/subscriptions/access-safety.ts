import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export type SubscriptionSafetySnapshot = {
  subscription_status: string | null;
  subscription_expires_at: string | null;
  trial_expires_at: string | null;
};

function dateIsPast(value: string | null | undefined) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time <= Date.now();
}

export function subscriptionIsEffectivelyExpired(
  snapshot: SubscriptionSafetySnapshot,
) {
  if (snapshot.subscription_status === "expired") return true;

  const effectiveExpiry =
    snapshot.subscription_status === "trialing"
      ? snapshot.trial_expires_at ?? snapshot.subscription_expires_at
      : snapshot.subscription_expires_at;

  return dateIsPast(effectiveExpiry);
}

export function subscriptionLocksWorkspace(
  snapshot: SubscriptionSafetySnapshot,
) {
  return (
    subscriptionIsEffectivelyExpired(snapshot) ||
    snapshot.subscription_status === "trial_pending" ||
    snapshot.subscription_status === "trial_blocked"
  );
}

export async function loadSubscriptionSafetySnapshot(
  businessId: string,
): Promise<SubscriptionSafetySnapshot> {
  // Apply an already-paid scheduled renewal before deciding that access is
  // expired. A missing RPC is tolerated during staged deployments, but all
  // other failures stop the request so TENH never guesses subscription state.
  const { error: renewalError } = await supabaseAdmin.rpc(
    "tenh_apply_due_subscription_renewals",
    { p_business_id: businessId },
  );

  if (
    renewalError &&
    renewalError.code !== "PGRST202" &&
    renewalError.code !== "42883"
  ) {
    throw new Error(
      `Unable to verify scheduled subscription renewal: ${renewalError.message}`,
    );
  }

  const { data, error } = await supabaseAdmin
    .from("businesses")
    .select("subscription_status,subscription_expires_at,trial_expires_at")
    .eq("id", businessId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      error?.message ?? "Unable to verify the business subscription.",
    );
  }

  return data as SubscriptionSafetySnapshot;
}

export async function assertSubscriptionCapacityChangeAllowed(
  businessId: string,
) {
  const snapshot = await loadSubscriptionSafetySnapshot(businessId);

  if (subscriptionIsEffectivelyExpired(snapshot)) {
    throw new Error(
      "Subscription expired. Reactivate the subscription before creating or enabling users or branches.",
    );
  }

  if (
    snapshot.subscription_status === "trial_pending" ||
    snapshot.subscription_status === "trial_blocked"
  ) {
    throw new Error(
      "Choose or activate a subscription before creating or enabling users or branches.",
    );
  }
}
