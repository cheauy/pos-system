import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  getAdminUrl,
  getRootUrl,
  getTenantDashboardUrl,
} from "@/lib/tenancy/domain";

export async function getAccountDestination(
  userId: string,
): Promise<string> {
  const supabase = await createClient();

  const {
    data: profile,
    error,
  } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to check account destination: ${error.message}`,
    );
  }

  if (!profile || profile.is_active !== true) {
    return getRootUrl("/login");
  }

  if (profile.role === "super_admin") {
    return getAdminUrl("/super-admin/businesses");
  }

  const {
    data: membership,
    error: membershipError,
  } = await supabase
    .from("business_members")
    .select("business_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw new Error(
      `Unable to load business membership: ${membershipError.message}`,
    );
  }

  if (!membership) {
    return getRootUrl("/no-business");
  }

  const {
    data: business,
    error: businessError,
  } = await supabase
    .from("businesses")
    .select("slug,subscription_expires_at,subscription_status")
    .eq("id", membership.business_id)
    .maybeSingle();

  if (businessError) {
    throw new Error(
      `Unable to load business destination: ${businessError.message}`,
    );
  }

  if (!business?.slug) {
    return getRootUrl("/no-business");
  }

  const expiresAt = business.subscription_expires_at
    ? new Date(business.subscription_expires_at).getTime()
    : Number.NaN;
  const subscriptionLocked =
    business.subscription_status === "trial_blocked" ||
    (business.subscription_status === "expired" &&
      (!Number.isFinite(expiresAt) || expiresAt <= Date.now())) ||
    (Number.isFinite(expiresAt) && expiresAt <= Date.now());

  return getTenantDashboardUrl(
    business.slug,
    subscriptionLocked
      ? "/dashboard/settings/subscription"
      : "/dashboard",
  );
}
