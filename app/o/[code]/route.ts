import { NextResponse } from "next/server";

import { isOrderCode } from "@/lib/orders/order-qr";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getRootUrl, getSubdomainUrl, getTenantDashboardUrl } from "@/lib/tenancy/domain";

// Web fallback for order QR links. With the app installed, iOS/Android open the
// app instead (see /.well-known). Staff of the order's business go to the order;
// everyone else only learns the store and lands on its storefront.
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!isOrderCode(code)) return NextResponse.redirect(getRootUrl("/"));

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id,business_id,businesses(slug)")
    .eq("order_code", code)
    .is("archived_at", null)
    .maybeSingle();
  const business = Array.isArray(order?.businesses) ? order?.businesses[0] : order?.businesses;
  const slug = (business as { slug?: string } | null | undefined)?.slug;
  if (!order || !slug) return NextResponse.redirect(getRootUrl("/"));

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: member } = await supabaseAdmin.from("business_members").select("id")
        .eq("business_id", order.business_id).eq("user_id", user.id).eq("is_active", true).maybeSingle();
      if (member) return NextResponse.redirect(getTenantDashboardUrl(slug, `/dashboard/orders/${order.id}`));
    }
  } catch { /* No session or auth unavailable: treat as a customer. */ }

  return NextResponse.redirect(getSubdomainUrl(slug, "/"));
}
