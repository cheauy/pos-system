import "server-only";
import { needsTeamPasswordSetup } from "@/lib/users/setup-state";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  loadSubscriptionSafetySnapshot,
  subscriptionIsEffectivelyExpired,
} from "@/lib/subscriptions/access-safety";
import { createClient } from "@/lib/supabase/server";
import {
  getAdminUrl,
  getAppUrl,
  getTenantDashboardUrl,
} from "@/lib/tenancy/domain";

function accountName(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}) {
  const metadata = user.user_metadata ?? {};
  for (const candidate of [
    metadata.full_name,
    metadata.name,
    metadata.user_name,
    metadata.preferred_username,
  ]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim().slice(0, 100);
    }
  }

  return user.email?.split("@")[0]?.slice(0, 100) || "Tenh POS User";
}

async function ensureProfile(userId: string) {
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("profiles")
    .select("id,role,is_active")
    .eq("id", userId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Unable to check account profile: ${lookupError.message}`);
  }

  if (existing) return existing;

  const { data: authRecord, error: authError } =
    await supabaseAdmin.auth.admin.getUserById(userId);

  if (authError || !authRecord.user?.email) {
    throw new Error(
      `Unable to load account details: ${
        authError?.message ?? "email address is unavailable"
      }`,
    );
  }

  const { data: created, error: createError } = await supabaseAdmin
    .from("profiles")
    .insert({
      id: userId,
      full_name: accountName(authRecord.user),
      email: authRecord.user.email.toLowerCase(),
      role: "owner",
      is_active: true,
    })
    .select("id,role,is_active")
    .single();

  if (createError || !created) {
    throw new Error(
      `Unable to create account profile: ${
        createError?.message ?? "profile was not returned"
      }`,
    );
  }

  return created;
}

function memberAccessReason(reason: string | null | undefined) {
  switch (reason) {
    case "removed_by_owner":
      return "access_removed";
    case "subscription_seat_limit":
      return "seat_limit";
    case "manually_disabled":
      return "access_disabled";
    default:
      return "access_unavailable";
  }
}

export async function getAccountDestination(
  userId: string,
): Promise<string> {
  const supabase = await createClient();
  if (await needsTeamPasswordSetup(userId)) return getAppUrl("/team-setup");
  const profile = await ensureProfile(userId);

  if (profile.is_active !== true) {
    return getAppUrl("/login?error=account_inactive");
  }

  if (profile.role === "super_admin") {
    return getAdminUrl("/super-admin/businesses");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("business_members")
    .select("business_id,role")
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
    const { data: inactiveMembership, error: inactiveError } = await supabaseAdmin
      .from("business_members")
      .select("disabled_reason")
      .eq("user_id", userId)
      .eq("is_active", false)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (inactiveError) {
      throw new Error(`Unable to check previous business access: ${inactiveError.message}`);
    }

    if (inactiveMembership) {
      return getAppUrl(
        `/business-disabled?reason=${encodeURIComponent(
          memberAccessReason(inactiveMembership.disabled_reason),
        )}`,
      );
    }

    // New owner accounts use account-first onboarding. Staff accounts with no
    // remaining membership were removed from, or lost, their business.
    return profile.role === "owner"
      ? getAppUrl("/get-started")
      : getAppUrl("/business-disabled?reason=business_unavailable");
  }

  const subscription = await loadSubscriptionSafetySnapshot(
    membership.business_id,
  );
  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("slug,is_active,disabled_reason")
    .eq("id", membership.business_id)
    .maybeSingle();

  if (businessError) {
    throw new Error(
      `Unable to load business destination: ${businessError.message}`,
    );
  }

  if (!business?.slug) {
    return getAppUrl("/business-disabled?reason=business_unavailable");
  }

  if (!business.is_active && business.disabled_reason !== "subscription_expired") {
    return getAppUrl("/business-disabled?reason=business_disabled");
  }

  if (subscriptionIsEffectivelyExpired(subscription)) {
    return membership.role === "owner"
      ? getTenantDashboardUrl(
          business.slug,
          "/dashboard/settings/subscription?locked=1",
        )
      : getAppUrl("/business-disabled?reason=subscription_expired");
  }

  return getTenantDashboardUrl(business.slug, "/dashboard");
}
