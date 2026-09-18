import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  getAdminUrl,
  getAppUrl,
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
    return getAppUrl("/login");
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
    return getAppUrl("/no-business");
  }

  // The admin application is centralized. The membership's business_id UUID,
  // not the public store slug, remains the tenant identity for authorization.
  return getAppUrl("/dashboard");
}
