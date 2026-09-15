import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getRootUrl } from "@/lib/tenancy/domain";

import GetStartedForm from "./get-started-form";

export default async function GetStartedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(getRootUrl("/login"));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.is_active !== true) {
    redirect(getRootUrl("/login"));
  }

  if (profile.role === "super_admin") {
    redirect(getRootUrl("/auth/continue"));
  }

  const { data: membership } = await supabase
    .from("business_members")
    .select("business_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (membership) {
    redirect(getRootUrl("/auth/continue"));
  }

  return <GetStartedForm accountEmail={user.email ?? ""} />;
}
