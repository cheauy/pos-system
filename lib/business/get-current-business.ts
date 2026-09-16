import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getRootUrl } from "@/lib/tenancy/domain";
import { getRequestTenantSlug } from "@/lib/tenancy/request-tenant";
import type {
  BusinessRole,
  CurrentBusiness,
  ProductMode,
} from "./types";

type BusinessMember = {
  business_id: string;
  role: BusinessRole;
};

type Business = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  product_mode: ProductMode;
  subscription_expires_at: string | null;
};

async function loadBusiness(
  businessId: string,
) {
  const supabase = await createClient();

  const {
    data,
    error,
  } = await supabase
    .from("businesses")
    .select(`
      id,
      name,
      slug,
      is_active,
      product_mode,
      subscription_expires_at
    `)
    .eq("id", businessId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load business: ${error.message}`,
    );
  }

  return (data ?? null) as Business | null;
}

export async function getCurrentBusiness(): Promise<CurrentBusiness> {
  const supabase = await createClient();
  const tenantSlug = await getRequestTenantSlug();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(getRootUrl("/login"));
  }

  let member: BusinessMember | null = null;
  let business: Business | null = null;

  if (tenantSlug) {
    const {
      data: businessData,
      error: businessError,
    } = await supabase
      .from("businesses")
      .select(`
        id,
        name,
        slug,
        is_active,
        product_mode,
        subscription_expires_at
      `)
      .eq("slug", tenantSlug)
      .maybeSingle();

    if (businessError) {
      throw new Error(
        `Unable to load tenant business: ${businessError.message}`,
      );
    }

    business = (businessData ?? null) as Business | null;

    if (!business) {
      redirect(getRootUrl("/no-business"));
    }

    const {
      data: memberData,
      error: memberError,
    } = await supabase
      .from("business_members")
      .select(`
        business_id,
        role
      `)
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
      // The user is signed in, but not a member of the requested tenant.
      // Continue routing them to a business they actually belong to.
      redirect(getRootUrl("/auth/continue"));
    }
  } else {
    const {
      data: memberData,
      error: memberError,
    } = await supabase
      .from("business_members")
      .select(`
        business_id,
        role
      `)
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

    if (!member) {
      redirect(getRootUrl("/no-business"));
    }

    business = await loadBusiness(member.business_id);

    if (!business) {
      redirect(getRootUrl("/no-business"));
    }
  }

  const subscriptionExpired =
    business.subscription_expires_at !== null &&
    new Date(
      business.subscription_expires_at,
    ).getTime() <= Date.now();

  if (subscriptionExpired) {
    const now = new Date();
    const expiry = business.subscription_expires_at
      ? new Date(business.subscription_expires_at)
      : now;
    const disabledAt = Number.isNaN(expiry.getTime()) ? now : expiry;
    const releaseAt = new Date(disabledAt);
    releaseAt.setUTCDate(releaseAt.getUTCDate() + 60);

    await supabase
      .from("businesses")
      .update({
        is_active: false,
        disabled_at: disabledAt.toISOString(),
        disabled_reason: "subscription_expired",
        scheduled_deletion_at: releaseAt.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", business.id)
      .eq("is_active", true);

    redirect("/business-disabled");
  }

  if (!business.is_active) {
    redirect("/business-disabled");
  }

  return {
    id: business.id,
    name: business.name,
    slug: business.slug,
    role: member.role,
    productMode: business.product_mode,
    product_mode: business.product_mode,
  };
}
