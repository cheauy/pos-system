import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireSuperAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(
      `Unable to load profile: ${profileError.message}`,
    );
  }

  if (!profile) {
    redirect("/login");
  }

  if (
    profile.role !== "super_admin" ||
    profile.is_active !== true
  ) {
    redirect("/dashboard");
  }

  return {
    user,
    profile,
  };
}
