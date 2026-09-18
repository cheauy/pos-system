import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  getTenantSlugFromHost,
  normalizeTenantSlug,
} from "@/lib/tenancy/domain";

type RouteProps = {
  params: Promise<{ slug: string }>;
};

type CouponBody = {
  code?: string;
  subtotal?: number;
};

export async function POST(
  request: NextRequest,
  { params }: RouteProps,
) {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeTenantSlug(rawSlug);

    if (!slug) {
      return NextResponse.json(
        { success: false, message: "Store not found." },
        { status: 404 },
      );
    }

    const requestTenantSlug = getTenantSlugFromHost(
      request.headers.get("x-forwarded-host") ??
        request.headers.get("host"),
    );

    // A public tenant hostname may only operate on its own store slug.
    // The slug locates the business; every database operation still scopes
    // data by the resolved business UUID/business_id.
    if (requestTenantSlug && requestTenantSlug !== slug) {
      return NextResponse.json(
        { success: false, message: "Store not found." },
        { status: 404 },
      );
    }

    const body = (await request.json()) as CouponBody;
    const code =
      typeof body.code === "string"
        ? body.code.trim().toUpperCase().slice(0, 30)
        : "";
    const subtotal = Number(body.subtotal);

    if (!code || !Number.isFinite(subtotal) || subtotal < 0) {
      return NextResponse.json(
        { success: false, message: "Invalid coupon request." },
        { status: 400 },
      );
    }

    const { data: business, error: businessError } = await supabaseAdmin
      .from("businesses")
      .select("id, is_active, subscription_expires_at")
      .eq("slug", slug)
      .maybeSingle();

    if (businessError || !business || !business.is_active) {
      return NextResponse.json(
        { success: false, message: "Store not found." },
        { status: 404 },
      );
    }

    if (
      business.subscription_expires_at &&
      new Date(business.subscription_expires_at).getTime() <= Date.now()
    ) {
      return NextResponse.json(
        { success: false, message: "This store is currently unavailable." },
        { status: 400 },
      );
    }

    const { data: storefront } = await supabaseAdmin
      .from("business_storefronts")
      .select("is_published, accept_online_orders, enable_coupons")
      .eq("business_id", business.id)
      .maybeSingle();

    if (
      !storefront?.is_published ||
      !storefront.accept_online_orders ||
      !storefront.enable_coupons
    ) {
      return NextResponse.json(
        { success: false, message: "Coupons are not available for this store." },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const { data: coupon, error: couponError } = await supabaseAdmin
      .from("business_coupons")
      .select(`
        id,
        code,
        discount_type,
        discount_value,
        minimum_order,
        max_discount,
        starts_at,
        ends_at,
        usage_limit,
        usage_count,
        is_active
      `)
      .eq("business_id", business.id)
      .ilike("code", code)
      .eq("is_active", true)
      .maybeSingle();

    if (couponError || !coupon) {
      return NextResponse.json(
        { success: false, message: "This coupon is invalid or expired." },
        { status: 400 },
      );
    }

    if (
      (coupon.starts_at && coupon.starts_at > now) ||
      (coupon.ends_at && coupon.ends_at < now)
    ) {
      return NextResponse.json(
        { success: false, message: "This coupon is invalid or expired." },
        { status: 400 },
      );
    }

    if (subtotal < Number(coupon.minimum_order ?? 0)) {
      return NextResponse.json(
        {
          success: false,
          message: `This coupon requires a minimum order of ${Number(
            coupon.minimum_order,
          ).toFixed(2)}.`,
        },
        { status: 400 },
      );
    }

    if (
      coupon.usage_limit !== null &&
      Number(coupon.usage_count) >= Number(coupon.usage_limit)
    ) {
      return NextResponse.json(
        { success: false, message: "This coupon has reached its usage limit." },
        { status: 400 },
      );
    }

    let discount =
      coupon.discount_type === "percentage"
        ? (subtotal * Number(coupon.discount_value)) / 100
        : Number(coupon.discount_value);

    if (coupon.max_discount !== null) {
      discount = Math.min(discount, Number(coupon.max_discount));
    }

    discount = Math.max(0, Math.min(subtotal, discount));
    discount = Math.round((discount + Number.EPSILON) * 100) / 100;

    return NextResponse.json({
      success: true,
      coupon: {
        code: coupon.code.toUpperCase(),
        discount,
      },
    });
  } catch (error) {
    console.error("Coupon preview failed", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unable to check this coupon.",
      },
      { status: 500 },
    );
  }
}
