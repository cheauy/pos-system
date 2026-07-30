import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function getAccountDestination(
  userId: string,
): Promise<string> {
  const supabase = await createClient();

  const {
    data: profile,
    error,
  } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to check account destination: ${error.message}`,
    );
  }

  return profile?.role=="super_admin"
    ? "/super-admin/businesses"
    : "/dashboard";
}