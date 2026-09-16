import { NextRequest, NextResponse } from "next/server";

import { getAccountDestination } from "@/lib/auth/get-account-destination";
import { createClient } from "@/lib/supabase/server";
import { getRootUrl } from "@/lib/tenancy/domain";

const allowedProviders = new Set(["google", "facebook"]);

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const provider = request.nextUrl.searchParams.get("provider") ?? "social";

  if (!code) {
    return NextResponse.redirect(
      getRootUrl("/dashboard/settings/security?link_error=missing_code"),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      getRootUrl("/dashboard/settings/security?link_error=oauth_failed"),
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(getRootUrl("/login"));
  }

  const destination = await getAccountDestination(user.id);

  // If MFA is required, complete it before returning to security settings.
  if (destination.includes("/auth/mfa")) {
    return NextResponse.redirect(destination);
  }

  try {
    const url = new URL(destination, getRootUrl("/"));
    if (url.pathname.startsWith("/dashboard")) {
      url.pathname = "/dashboard/settings/security";
      if (allowedProviders.has(provider)) {
        url.searchParams.set("linked", provider);
      }
      return NextResponse.redirect(url);
    }
  } catch {
    // Fall back to the normal account destination below.
  }

  return NextResponse.redirect(destination);
}
