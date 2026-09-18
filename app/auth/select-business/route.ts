import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import {
  SELECTED_BUSINESS_COOKIE,
  getAppUrl,
  isValidTenantSlug,
  normalizeTenantSlug,
} from "@/lib/tenancy/domain";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  return value.replace(/\\/g, "");
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.redirect(getAppUrl("/login"));
  }

  const rawSlug = request.nextUrl.searchParams.get("slug") ?? "";
  const slug = normalizeTenantSlug(rawSlug);
  const nextPath = safeNextPath(request.nextUrl.searchParams.get("next"));

  if (!isValidTenantSlug(slug) || slug !== rawSlug.trim().toLowerCase()) {
    return NextResponse.redirect(getAppUrl("/auth/continue"));
  }

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id")
    .ilike("slug", slug)
    .maybeSingle();

  if (businessError || !business) {
    return NextResponse.redirect(getAppUrl("/auth/continue"));
  }

  const { data: membership, error: membershipError } = await supabase
    .from("business_members")
    .select("business_id")
    .eq("business_id", business.id)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (membershipError || !membership) {
    return NextResponse.redirect(getAppUrl("/auth/continue"));
  }

  const response = NextResponse.redirect(getAppUrl(nextPath));

  // Host-only app cookie. It stores the permanent UUID, not the public slug,
  // and is only a business-selection hint. Every data request still verifies
  // membership and scopes queries by business_id.
  response.cookies.set(SELECTED_BUSINESS_COOKIE, business.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
