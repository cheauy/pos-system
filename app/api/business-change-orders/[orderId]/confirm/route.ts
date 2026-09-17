import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const configuredSecret = process.env.TENH_POS_CHANGE_PAYMENT_SECRET;

  if (!configuredSecret) {
    return NextResponse.json(
      { error: "Business-change payment confirmation is not configured." },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization") ?? "";

  if (authorization !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { orderId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    paymentReference?: string;
    paymentProvider?: string;
  };

  const paymentReference = body.paymentReference?.trim();
  const paymentProvider = body.paymentProvider?.trim() || "external";

  if (!paymentReference || paymentReference.length > 120) {
    return NextResponse.json(
      { error: "A valid payment reference is required." },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin.rpc(
    "complete_business_change_order",
    {
      p_order_id: orderId,
      p_payment_reference: paymentReference,
      p_payment_provider: paymentProvider,
    },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return NextResponse.json({ ok: true, result: data });
}
