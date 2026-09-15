import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
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
    await supabaseAdmin
      .from("profiles")
      .select("is_active")
      .eq("id", user.id)
      .maybeSingle();

  if (profileError) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      getRootUrl("/login?error=oauth_failed"),
    );
  }

  // A Google/Facebook login may be the user's very first TENH account
  // creation. Create only the account profile here; business setup happens
  // after /auth/continue sends users without membership to /get-started.
  if (!profile) {
    const email = user.email?.trim().toLowerCase();

    if (!email) {
      await supabase.auth.signOut();
      return NextResponse.redirect(
        getRootUrl("/login?error=oauth_email_required"),
      );
    }

    const metadata = user.user_metadata ?? {};
    const fullName = String(
      metadata.full_name ?? metadata.name ?? email.split("@")[0] ?? "Tenh POS Owner",
    ).trim();

    const { error: createProfileError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: user.id,
          full_name: fullName || "Tenh POS Owner",
          email,
          role: "owner",
          is_active: true,
        },
        { onConflict: "id" },
      );

    if (createProfileError) {
      await supabase.auth.signOut();
      return NextResponse.redirect(
        getRootUrl("/login?error=oauth_failed"),
      );
    }
  } else if (profile.is_active !== true) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      getRootUrl("/login?error=account_inactive"),
    );
  }

  return NextResponse.redirect(
    getRootUrl("/auth/continue"),
  );
}
