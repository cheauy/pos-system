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
    return getRootUrl("/get-started");
  }

  const {
    data: business,
    error: businessError,
  } = await supabase
    .from("businesses")
    .select("slug")
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

  return getTenantDashboardUrl(
    business.slug,
    "/dashboard",
  );
}
