"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getAppUrl, getRootUrl } from "@/lib/tenancy/domain";

const PENDING_EMAIL_COOKIE = "tenh_pending_signup_email";

export async function resendConfirmationEmail() {
  const cookieStore = await cookies();
  const email = cookieStore.get(PENDING_EMAIL_COOKIE)?.value?.trim();

  if (!email) {
    redirect(getAppUrl("/register/check-email?error=email_missing"));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: getRootUrl("/auth/callback?flow=email-confirmation"),
    },
  });

  if (error) {
    console.error("[resendConfirmationEmail] failed:", error.message);
    redirect(getAppUrl("/register/check-email?error=resend_failed"));
  }

  redirect(getAppUrl("/register/check-email?resent=1"));
}
