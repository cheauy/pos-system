import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const getCurrentProfile = cache(async () => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(`
      id,
      full_name,
      email,
      role,
      business_id,
      is_active,
      businesses (
        id,
        name,
        status,
        business_product_settings (
          standard_enabled,
          variant_enabled,
          configurable_enabled,
          bundle_enabled,
          default_product_type
        )
      )
    `)
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    redirect("/login");
  }

  if (!profile.is_active) {
    redirect("/account-disabled");
  }

  return profile;
});