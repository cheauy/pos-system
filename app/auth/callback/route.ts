import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getRootUrl } from "@/lib/tenancy/domain";

function getOAuthFullName(user: {
  user_metadata?: Record<string, unknown>;
  email?: string | null;
}) {
  const metadata = user.user_metadata ?? {};
  const candidates = [
    metadata.full_name,
    metadata.name,
    metadata.user_name,
    metadata.preferred_username,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim().slice(0, 100);
    }
  }

  return user.email?.split("@")[0]?.slice(0, 100) || "Tenh POS User";
}

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

  if (!user.email) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      getRootUrl("/login?error=oauth_email_required"),
    );
  }

  const { data: profile, error: profileError } =
    await supabaseAdmin
      .from("profiles")
      .select("id, is_active")
      .eq("id", user.id)
      .maybeSingle();

  if (profileError) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      getRootUrl("/login?error=oauth_failed"),
    );
  }

  if (profile && profile.is_active !== true) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      getRootUrl("/login?error=account_inactive"),
    );
  }

  // First-time Google/Facebook login creates only the TENH account profile.
  // Business/store creation is intentionally deferred to /get-started.
  if (!profile) {
    const { error: createProfileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: user.id,
        full_name: getOAuthFullName(user),
        email: user.email.toLowerCase(),
        role: "owner",
        is_active: true,
      });

    if (createProfileError) {
      await supabase.auth.signOut();
      return NextResponse.redirect(
        getRootUrl("/login?error=oauth_failed"),
      );
    }
  }

  // One server-side destination check handles both cases safely:
  // existing business -> <slug>.tenh-pos.com/dashboard
  // no business       -> tenh-pos.com/get-started
  return NextResponse.redirect(getRootUrl("/auth/continue"));
}
