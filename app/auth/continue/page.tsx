import { redirect } from "next/navigation";

import { getAccountDestination } from "@/lib/auth/get-account-destination";
import { createClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/tenancy/domain";

export default async function ContinueAfterLoginPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(getAppUrl("/login"));
  }

  const destination =
    await getAccountDestination(user.id);

  redirect(destination);
}
