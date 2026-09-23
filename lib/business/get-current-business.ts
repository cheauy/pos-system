import "server-only";
import { needsTeamPasswordSetup } from "@/lib/users/setup-state";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  SELECTED_BUSINESS_COOKIE,
  getAppUrl,
} from "@/lib/tenancy/domain";
import { getRequestTenantSlug } from "@/lib/tenancy/request-tenant";
import type {
  BusinessRole,
  CurrentBusiness,
  ProductMode,
} from "./types";

export type SubscriptionStatus =
  | "trial_pending"
  | "trialing"
  | "active"
  | "expired"
  | "trial_blocked";

export type CurrentBusinessAccess = CurrentBusiness & {
  subscriptionStatus: SubscriptionStatus;
  subscriptionLocked: boolean;
  subscriptionStartedAt: string | null;
  subscriptionExpiresAt: string | null;
  trialStartedAt: string | null;
  trialExpiresAt: string | null;
  expiredAt: string | null;
  deletionScheduledAt: string | null;
  trialBlockReason: string | null;
};

type BusinessMember = {
  business_id: string;
  role: BusinessRole;
};

type Business = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  disabled_reason: string | null;
  product_mode: ProductMode;
  subscription_months: number | null;
  subscription_started_at: string | null;
  subscription_expires_at: string | null;
  subscription_status: SubscriptionStatus | null;
  trial_started_at: string | null;
  trial_expires_at: string | null;
  expired_at: string | null;
  deletion_scheduled_at: string | null;
  trial_block_reason: string | null;
};

const BUSINESS_SELECT = `
  id,
  name,
  slug,
  is_active,
  disabled_reason,
  product_mode,
  subscription_months,
  subscription_started_at,
  subscription_expires_at,
  subscription_status,
  trial_started_at,
  trial_expires_at,
  expired_at,
  deletion_scheduled_at,
  trial_block_reason
`;

async function loadBusiness(businessId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("businesses")
    .select(BUSINESS_SELECT)
    .eq("id", businessId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load business: ${error.message}`,
    );
  }

  return (data ?? null) as Business | null;
}

async function applyDueSubscriptionRenewal(businessId: string) {
  const { data, error } = await supabaseAdmin.rpc(
    "tenh_apply_due_subscription_renewals",
    { p_business_id: businessId },
  );

  if (error) {
    // Staged deploys may briefly run app code before this migration is applied.
    // Ignore only a missing RPC; all other failures must stop the request.
    if (error.code === "PGRST202" || error.code === "42883") return false;
    throw new Error(`Unable to apply the scheduled subscription: ${error.message}`);
  }

  return Number(data ?? 0) > 0;
}

async function loadContext() {
  const supabase = await createClient();
  const tenantSlug = await getRequestTenantSlug();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(getAppUrl("/login"));
  }

  if (await needsTeamPasswordSetup(user.id)) redirect(getAppUrl("/team-setup"));

  let member: BusinessMember | null = null;
  let business: Business | null = null;

  if (tenantSlug) {
    const { data: businessData, error: businessError } =
      await supabase
        .from("businesses")
        .select(BUSINESS_SELECT)
        .eq("slug", tenantSlug)
        .maybeSingle();

    if (businessError) {
      throw new Error(
        `Unable to load tenant business: ${businessError.message}`,
      );
    }

    business = (businessData ?? null) as Business | null;

    if (!business) {
      redirect(getAppUrl("/no-business"));
    }

    if (await applyDueSubscriptionRenewal(business.id)) {
      business = await loadBusiness(business.id);
      if (!business) redirect(getAppUrl("/no-business"));
    }

    const { data: memberData, error: memberError } =
      await supabase
        .from("business_members")
        .select("business_id,role")
        .eq("user_id", user.id)
        .eq("business_id", business.id)
        .eq("is_active", true)
        .maybeSingle();

    if (memberError) {
      throw new Error(
        `Unable to load tenant membership: ${memberError.message}`,
      );
    }

    member = (memberData ?? null) as BusinessMember | null;

    if (!member) {
      const { data: inactiveMember } = await supabaseAdmin
        .from("business_members")
        .select("disabled_reason")
        .eq("user_id", user.id)
        .eq("business_id", business.id)
        .eq("is_active", false)
        .maybeSingle();

      const reason =
        inactiveMember?.disabled_reason === "removed_by_owner"
          ? "access_removed"
          : inactiveMember?.disabled_reason === "subscription_seat_limit"
            ? "seat_limit"
            : "access_disabled";

      redirect(getAppUrl(`/business-disabled?reason=${reason}`));
    }
  } else {
    // app.tenh-pos.com has no tenant slug in its hostname. Keep the selected
    // business as the permanent UUID, then verify membership before using it.
    // This cookie is a locator only and never grants authorization.
    const cookieStore = await cookies();
    const selectedBusinessId =
      cookieStore.get(SELECTED_BUSINESS_COOKIE)?.value?.trim() ?? "";

    if (selectedBusinessId) {
      if (/^[0-9a-f-]{36}$/i.test(selectedBusinessId)) {
        await applyDueSubscriptionRenewal(selectedBusinessId);
      }

      const { data: selectedMember, error: selectedMemberError } =
        await supabase
          .from("business_members")
          .select("business_id,role")
          .eq("user_id", user.id)
          .eq("business_id", selectedBusinessId)
          .eq("is_active", true)
          .maybeSingle();

      if (selectedMemberError) {
        throw new Error(
          `Unable to load selected business membership: ${selectedMemberError.message}`,
        );
      }

      if (selectedMember) {
        const selectedBusiness = await loadBusiness(selectedMember.business_id);

        if (selectedBusiness) {
          member = selectedMember as BusinessMember;
          business = selectedBusiness;
        }
      }
    }

    // Missing/stale selection falls back to TENH's existing first active
    // membership behavior so existing accounts remain backward-compatible.
    if (!member || !business) {
      const { data: memberData, error: memberError } =
        await supabase
          .from("business_members")
          .select("business_id,role")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();

      if (memberError) {
        throw new Error(
          `Unable to load business membership: ${memberError.message}`,
        );
      }

      member = (memberData ?? null) as BusinessMember | null;

      if (member && await applyDueSubscriptionRenewal(member.business_id)) {
        const { data: refreshedMember, error: refreshedMemberError } = await supabase
          .from("business_members")
          .select("business_id,role")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();

        if (refreshedMemberError) {
          throw new Error(`Unable to refresh business membership: ${refreshedMemberError.message}`);
        }

        member = (refreshedMember ?? null) as BusinessMember | null;
      }

      if (!member) {
        const { data: inactiveMember, error: inactiveMemberError } =
          await supabaseAdmin
            .from("business_members")
            .select("disabled_reason")
            .eq("user_id", user.id)
            .eq("is_active", false)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (inactiveMemberError) {
          throw new Error(
            `Unable to check previous business access: ${inactiveMemberError.message}`,
          );
        }

        if (inactiveMember) {
          const reason =
            inactiveMember.disabled_reason === "removed_by_owner"
              ? "access_removed"
              : inactiveMember.disabled_reason === "subscription_seat_limit"
                ? "seat_limit"
                : "access_disabled";

          redirect(getAppUrl(`/business-disabled?reason=${reason}`));
        }

        redirect(getAppUrl("/no-business"));
      }

      business = await loadBusiness(member.business_id);

      if (!business) {
        redirect(getAppUrl("/no-business"));
      }
    }
  }

  if (!member || !business) {
    redirect(getAppUrl("/no-business"));
  }

  return { supabase, user, member, business };
}

async function refreshSubscriptionState(
  business: Business,
  role: BusinessRole,
  options: { startTrial?: boolean } = {},
) {
  const supabase = await createClient();
  let current = business;

  if (
    options.startTrial === true &&
    current.subscription_status === "trial_pending" &&
    role === "owner"
  ) {
    const { error } = await supabase.rpc(
      "ensure_business_trial_started",
      { p_business_id: current.id },
    );

    if (error) {
      throw new Error(
        `Unable to start free trial: ${error.message}`,
      );
    }

    const reloaded = await loadBusiness(current.id);
    if (reloaded) current = reloaded;
  }

  if (await applyDueSubscriptionRenewal(current.id)) {
    const reloaded = await loadBusiness(current.id);
    if (reloaded) current = reloaded;
  }

  const expiryMs = current.subscription_expires_at
    ? new Date(current.subscription_expires_at).getTime()
    : Number.NaN;
  const now = Date.now();

  if (
    Number.isFinite(expiryMs) &&
    expiryMs <= now &&
    current.subscription_status !== "expired"
  ) {
    const expiredAt = current.subscription_expires_at;
    const deletionScheduledAt = new Date(
      expiryMs + 180 * 86_400_000,
    ).toISOString();

    const { error } = await supabaseAdmin
      .from("businesses")
      .update({
        subscription_status: "expired",
        expired_at: current.expired_at ?? expiredAt,
        deletion_scheduled_at: deletionScheduledAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.id);

    if (error) {
      throw new Error(
        `Unable to lock expired subscription: ${error.message}`,
      );
    }

    current = {
      ...current,
      subscription_status: "expired",
      expired_at: current.expired_at ?? expiredAt,
      deletion_scheduled_at: deletionScheduledAt,
    };
  } else if (
    Number.isFinite(expiryMs) &&
    expiryMs > now &&
    current.subscription_status === "expired"
  ) {
    const nextStatus: SubscriptionStatus =
      Number(current.subscription_months ?? 0) > 0
        ? "active"
        : "trialing";

    const { error } = await supabaseAdmin
      .from("businesses")
      .update({
        subscription_status: nextStatus,
        expired_at: null,
        deletion_scheduled_at: null,
        disabled_at: null,
        disabled_reason: null,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.id);

    if (error) {
      throw new Error(
        `Unable to restore subscription access: ${error.message}`,
      );
    }

    current = {
      ...current,
      subscription_status: nextStatus,
      expired_at: null,
      deletion_scheduled_at: null,
      is_active: true,
      disabled_reason: null,
    };
  }

  return current;
}

function toAccess(
  business: Business,
  role: BusinessRole,
): CurrentBusinessAccess {
  const subscriptionStatus =
    business.subscription_status ?? "active";
  const subscriptionLocked =
    subscriptionStatus === "expired" ||
    subscriptionStatus === "trial_pending" ||
    subscriptionStatus === "trial_blocked";

  return {
    id: business.id,
    name: business.name,
    slug: business.slug,
    role,
    productMode: business.product_mode,
    product_mode: business.product_mode,
    subscriptionStatus,
    subscriptionLocked,
    subscriptionStartedAt:
      business.subscription_started_at,
    subscriptionExpiresAt:
      business.subscription_expires_at,
    trialStartedAt: business.trial_started_at,
    trialExpiresAt: business.trial_expires_at,
    expiredAt: business.expired_at,
    deletionScheduledAt:
      business.deletion_scheduled_at,
    trialBlockReason: business.trial_block_reason,
  };
}

export async function getCurrentBusinessForSubscription(
  options: { startTrial?: boolean } = {},
): Promise<CurrentBusinessAccess> {
  const { member, business } = await loadContext();

  const legacySubscriptionExpiry =
    business.disabled_reason === "subscription_expired";

  if (!business.is_active && !legacySubscriptionExpiry) {
    redirect("/business-disabled?reason=business_disabled");
  }

  const current = await refreshSubscriptionState(
    business,
    member.role,
    options,
  );

  return toAccess(current, member.role);
}

export async function getCurrentBusiness(): Promise<CurrentBusiness> {
  const business = await getCurrentBusinessForSubscription({ startTrial: false });

  if (business.subscriptionLocked) {
    redirect("/dashboard/settings/subscription?locked=1");
  }

  return {
    id: business.id,
    name: business.name,
    slug: business.slug,
    role: business.role,
    productMode: business.productMode,
    product_mode: business.product_mode,
  };
}
