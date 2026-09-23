import { NextResponse } from "next/server";

import {
  verifyAndConfirmSubscriptionPaywayPayment,
  verifyPaywayCallbackSignature,
} from "@/lib/payway/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const signature = request.headers.get("x-payway-hmac-sha512");
  if (!verifyPaywayCallbackSignature(payload, signature)) {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  const tranId = typeof payload.tran_id === "string" ? payload.tran_id : "";
  if (!tranId) {
    return NextResponse.json({ ok: false, error: "Missing transaction ID" }, { status: 400 });
  }

  try {
    const result = await verifyAndConfirmSubscriptionPaywayPayment({ tranId });
    return NextResponse.json({ ok: true, state: result.state });
  } catch (error) {
    // A valid ABA callback can be retried safely; never convert an uncertain
    // verification into an approved subscription.
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Verification failed" },
      { status: 503 },
    );
  }
}
