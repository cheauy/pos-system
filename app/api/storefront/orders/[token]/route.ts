import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getTenantSlugFromHost } from "@/lib/tenancy/domain";

type RouteProps = {
  params: Promise<{
    token: string;
  }>;
};

export async function GET(
  request: NextRequest,
  { params }: RouteProps,
) {
  const { token } = await params;

  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(`
      business_id,
      order_number,
      online_status,
      fulfillment_type,
      discount,
      coupon_code,
      loyalty_points_earned,
      total,
      created_at,
      table_name,
      delivery_zone_name,
      requested_for,
      payment_method,
      payment_status,
      payment_reference
    `)
    .eq("public_order_token", token)
    .in("order_source", ["online", "qr"])
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { success: false, message: "Order not found." },
      { status: 404 },
    );
  }

  const { business_id, ...publicOrder } = data;

  const hostTenant = getTenantSlugFromHost(
    request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
  );

  if (hostTenant) {
    const { data: hostBusiness, error: hostBusinessError } = await supabaseAdmin
      .from("businesses")
      .select("id")
      .ilike("slug", hostTenant)
      .maybeSingle();

    if (
      hostBusinessError ||
      !hostBusiness ||
      hostBusiness.id !== business_id
    ) {
      return NextResponse.json(
        { success: false, message: "Order not found." },
        { status: 404 },
      );
    }
  }

  const { data: storefront } = await supabaseAdmin
    .from("business_storefronts")
    .select("currency")
    .eq("business_id", business_id)
    .maybeSingle();

  return NextResponse.json({
    success: true,
    order: {
      ...publicOrder,
      currency: storefront?.currency ?? "USD",
    },
  });
}
