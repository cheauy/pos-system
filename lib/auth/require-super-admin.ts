import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type SuperAdminUser = {
  id: string;
  email: string;
  fullName: string;
};

export async function requireSuperAdmin(): Promise<SuperAdminUser> {
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
    .select(`
      id,
      full_name,
      email,
      role,
      is_active
    `)
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(
      `Unable to check Super Admin access: ${profileError.message}`,
    );
  }

  if (
    !profile ||
    profile.role !== "super_admin" ||
    profile.is_active !== true
  ) {
    redirect("/dashboard");
  }

  return {
    id: user.id,
    email: profile.email ?? user.email ?? "",
    fullName: profile.full_name ?? "Super Admin",
  };
}
