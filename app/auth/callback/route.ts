import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getRootUrl } from "@/lib/tenancy/domain";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const authError = request.nextUrl.searchParams.get("error");

  if (authError || !code) {
    return NextResponse.redirect(
      getRootUrl("/login?error=oauth_failed"),
    );
  }

  const supabase = await createClient();
  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(
      getRootUrl("/login?error=oauth_failed"),
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(
      getRootUrl("/login?error=oauth_failed"),
    );
  }

  const { data: profile, error: profileError } =
    await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", user.id)
      .maybeSingle();

  if (profileError || !profile || profile.is_active !== true) {
    await supabase.auth.signOut();

    return NextResponse.redirect(
      getRootUrl("/login?error=oauth_account_not_found"),
    );
  }

  return NextResponse.redirect(
    getRootUrl("/auth/continue"),
  );
}
