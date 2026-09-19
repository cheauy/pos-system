import { PAYMENT_PROOF_BUCKET, validateCheckoutContact } from "@/lib/storefront/checkout-validation";
import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  getTenantSlugFromHost,
  normalizeTenantSlug,
} from "@/lib/tenancy/domain";

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
  let uploadedPath: string | null = null;
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

    const multipart = request.headers.get("content-type")?.includes("multipart/form-data");
    if (Number(request.headers.get("content-length") || 0) > 6 * 1024 * 1024) return NextResponse.json({ success: false, message: "Payment proof must not exceed 5 MB." }, { status: 413 });
    const form = multipart ? await request.formData() : null;
    const body = (form ? JSON.parse(String(form.get("checkout") || "{}")) : await request.json()) as CheckoutBody;
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
    let paymentReference: string | null = null;
    const deliveryZoneId = cleanText(body.deliveryZoneId, 80);
    const requestedFor = cleanText(body.requestedFor, 80);
    const couponCode = cleanText(body.couponCode, 30);

    const contactError = validateCheckoutContact(guestName, guestPhone, fulfillmentType, guestAddress);
    if (contactError) return NextResponse.json({ success: false, message: contactError }, { status: 400 });

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

    if (paymentMethod === "khqr") {
      const file = form?.get("paymentProof");
      if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024) return NextResponse.json({ success: false, message: "Upload payment proof (up to 5 MB) to continue." }, { status: 400 });
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg" : bytes.slice(0,8).join(",") === "137,80,78,71,13,10,26,10" ? "image/png" : new TextDecoder().decode(bytes.slice(0,4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8,12)) === "WEBP" ? "image/webp" : null;
      if (!mime || mime !== file.type) return NextResponse.json({ success: false, message: "Upload a valid JPG, PNG or WebP payment image." }, { status: 400 });
      const { data: business } = await supabaseAdmin.from("businesses").select("id").eq("slug", slug).eq("is_active", true).maybeSingle();
      if (!business) return NextResponse.json({ success: false, message: "Store not found." }, { status: 404 });
      const { data: store } = await supabaseAdmin.from("business_storefronts").select("is_published,accept_online_orders,accept_khqr").eq("business_id", business.id).maybeSingle();
      if (!store?.is_published || !store.accept_online_orders || !store.accept_khqr) return NextResponse.json({ success: false, message: "KHQR ordering is unavailable." }, { status: 400 });
      const { data: bucket } = await supabaseAdmin.storage.getBucket(PAYMENT_PROOF_BUCKET);
      if (!bucket) {
        const { error: bucketError } = await supabaseAdmin.storage.createBucket(PAYMENT_PROOF_BUCKET, { public: false, fileSizeLimit: 5 * 1024 * 1024, allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] });
        if (bucketError && !/already exists/i.test(bucketError.message)) throw new Error("Unable to prepare payment-proof storage.");
      } else if (bucket.public) throw new Error("Payment-proof storage must be private.");
      const path = `${business.id}/${crypto.randomUUID()}.${mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp"}`;
      const { error: uploadError } = await supabaseAdmin.storage.from(PAYMENT_PROOF_BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
      if (uploadError) throw new Error("Unable to upload payment proof. Please try again.");
      uploadedPath = path;
      paymentReference = `proof:${path}`;
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
      if (uploadedPath) { await supabaseAdmin.storage.from(PAYMENT_PROOF_BUCKET).remove([uploadedPath]); uploadedPath = null; }
      console.error("place_online_order error", error);

      return NextResponse.json(
        {
          success: false,
          message: error.message,
        },
        { status: 400 },
      );
    }

    uploadedPath = null;
    return NextResponse.json({
      success: true,
      order: data,
    });
  } catch (error) {
    if (uploadedPath) await supabaseAdmin.storage.from(PAYMENT_PROOF_BUCKET).remove([uploadedPath]);
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
