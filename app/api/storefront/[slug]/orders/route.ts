import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeTenantSlug } from "@/lib/tenancy/domain";

type RouteProps = {
  params: Promise<{
    slug: string;
  }>;
};

type CheckoutItem = {
  productId: string;
  quantity: number;
  optionIds?: string[];
};

type CheckoutBody = {
  items?: CheckoutItem[];
  fulfillmentType?: string;
  guestName?: string;
  guestPhone?: string;
  guestAddress?: string | null;
  customerNote?: string | null;
  tableToken?: string | null;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  deliveryZoneId?: string | null;
  requestedFor?: string | null;
  couponCode?: string | null;
};

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean ? clean.slice(0, maxLength) : null;
}

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

    const body = (await request.json()) as CheckoutBody;
    const items = Array.isArray(body.items) ? body.items : [];

    if (items.length === 0) {
      return NextResponse.json(
        { success: false, message: "Your cart is empty." },
        { status: 400 },
      );
    }

    const normalizedItems = items.map((item) => ({
      productId:
        typeof item.productId === "string"
          ? item.productId.trim()
          : "",
      quantity: Number(item.quantity),
      optionIds: Array.isArray(item.optionIds)
        ? item.optionIds.filter(
            (value): value is string =>
              typeof value === "string" && value.length > 0,
          )
        : [],
    }));

    const validItems = normalizedItems.every(
      (item) =>
        item.productId.length > 0 &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0 &&
        item.quantity <= 999,
    );

    if (!validItems) {
      return NextResponse.json(
        {
          success: false,
          message: "The cart contains invalid product data.",
        },
        { status: 400 },
      );
    }

    const fulfillmentType = cleanText(
      body.fulfillmentType,
      20,
    );
    const guestName = cleanText(body.guestName, 120);
    const guestPhone = cleanText(body.guestPhone, 60);
    const guestAddress = cleanText(body.guestAddress, 500);
    const customerNote = cleanText(body.customerNote, 1000);
    const tableToken = cleanText(body.tableToken, 80);
    const paymentMethod = cleanText(body.paymentMethod, 20) ?? "cod";
    const paymentReference = cleanText(body.paymentReference, 120);
    const deliveryZoneId = cleanText(body.deliveryZoneId, 80);
    const requestedFor = cleanText(body.requestedFor, 80);
    const couponCode = cleanText(body.couponCode, 30);

    if (!fulfillmentType || !guestName || !guestPhone) {
      return NextResponse.json(
        {
          success: false,
          message: "Name, phone and fulfillment type are required.",
        },
        { status: 400 },
      );
    }

    if (!["cod", "khqr"].includes(paymentMethod)) {
      return NextResponse.json(
        { success: false, message: "Invalid online payment method." },
        { status: 400 },
      );
    }

    if (requestedFor && Number.isNaN(new Date(requestedFor).getTime())) {
      return NextResponse.json(
        { success: false, message: "Invalid scheduled order time." },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin.rpc(
      "place_online_order",
      {
        p_business_slug: slug,
        p_items: normalizedItems,
        p_fulfillment_type: fulfillmentType,
        p_guest_name: guestName,
        p_guest_phone: guestPhone,
        p_guest_address: guestAddress,
        p_customer_note: customerNote,
        p_table_token: tableToken || null,
        p_payment_method: paymentMethod,
        p_payment_reference: paymentReference,
        p_delivery_zone_id: deliveryZoneId || null,
        p_requested_for: requestedFor || null,
        p_coupon_code: couponCode ? couponCode.toUpperCase() : null,
      },
    );

    if (error) {
      console.error("place_online_order error", error);

      return NextResponse.json(
        {
          success: false,
          message: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      order: data,
    });
  } catch (error) {
    console.error("Online checkout failed", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unable to place your order.",
      },
      { status: 500 },
    );
  }
}
