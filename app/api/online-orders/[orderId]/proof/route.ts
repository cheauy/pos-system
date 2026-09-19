import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/require-permission";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PAYMENT_PROOF_BUCKET, proofPath } from "@/lib/storefront/checkout-validation";
export async function GET(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const business = await requirePermission("orders.view");
  const { orderId } = await params;
  const { data: order } = await supabaseAdmin.from("orders").select("payment_reference").eq("id", orderId).eq("business_id", business.id).in("order_source", ["online", "qr"]).maybeSingle();
  const path = proofPath(order?.payment_reference);
  if (!path || !path.startsWith(`${business.id}/`)) return NextResponse.json({ error: "Payment proof not found." }, { status: 404 });
  const { data, error } = await supabaseAdmin.storage.from(PAYMENT_PROOF_BUCKET).createSignedUrl(path, 90);
  if (error || !data) return NextResponse.json({ error: "Unable to load payment proof." }, { status: 500 });
  const response = NextResponse.redirect(data.signedUrl, 302);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
