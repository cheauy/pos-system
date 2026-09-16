import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getRootUrl } from "@/lib/tenancy/domain";

const PENDING_EMAIL_COOKIE = "tenh_pending_signup_email";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const authError = request.nextUrl.searchParams.get("error");
  const flow = request.nextUrl.searchParams.get("flow");
  const isEmailConfirmation = flow === "email-confirmation";

  if (authError || !code) {
    return NextResponse.redirect(
      isEmailConfirmation
        ? getRootUrl("/register/check-email?error=invalid")
        : getRootUrl("/login?error=oauth_failed"),
    );
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    console.error("[auth/callback] code exchange failed:", exchangeError.message);
    return NextResponse.redirect(
      isEmailConfirmation
        ? getRootUrl("/register/check-email?error=invalid")
        : getRootUrl("/login?error=oauth_failed"),
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(getRootUrl("/login?error=oauth_failed"));
  }

  if (!user.email) {
    await supabase.auth.signOut();
    return NextResponse.redirect(getRootUrl("/login?error=oauth_email_required"));
  }

  // /auth/continue creates/repairs the lightweight TENH profile and then
  // sends a first-time user to /get-started or an existing member to their
  // business subdomain dashboard.
  const response = NextResponse.redirect(getRootUrl("/auth/continue"));

  if (isEmailConfirmation) {
    response.cookies.delete(PENDING_EMAIL_COOKIE);
  }

  return response;
}
