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
  items?: { productId: string; quantity: number; optionIds?: string[] }[];
  tableToken?: string | null;
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

    const hostTenant = getTenantSlugFromHost(
      request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
    );

    if (hostTenant && hostTenant !== slug) {
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

    const { data: branchId, error: branchError } = await supabaseAdmin.rpc("tenh_choose_online_branch", { p_business: business.id, p_checkout: { p_items: body.items, p_coupon_code: code, p_table_token: body.tableToken || null } });
    if (branchError || !branchId) return NextResponse.json({ success: false, message: "This coupon cannot be used for the current cart." }, { status: 400 });
    const result=await supabaseAdmin.rpc('tenh_preview_online_coupon',{p_business:business.id,p_branch:branchId,p_code:code,p_items:body.items});
    if(result.error||!result.data)return NextResponse.json({success:false,message:result.error?.message||'This coupon is unavailable.'},{status:400});
    return NextResponse.json({success:true,coupon:{code:result.data.code,discount:Number(result.data.discount)}});
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
