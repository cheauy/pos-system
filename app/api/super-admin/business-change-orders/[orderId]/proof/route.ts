import { NextResponse } from "next/server";

import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  await requireSuperAdmin();

  const { orderId } = await params;

  const { data: order, error } = await supabaseAdmin
    .from("business_change_orders")
    .select("id,proof_bucket,proof_path")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `Unable to load payment proof: ${error.message}` },
      { status: 500 },
    );
  }

  if (!order?.proof_bucket || !order.proof_path) {
    return NextResponse.json(
      { error: "Payment proof was not found." },
      { status: 404 },
    );
  }

  const { data, error: signedUrlError } = await supabaseAdmin.storage
    .from(order.proof_bucket)
    .createSignedUrl(order.proof_path, 90);

  if (signedUrlError || !data?.signedUrl) {
    return NextResponse.json(
      {
        error:
          signedUrlError?.message || "Unable to create a secure proof link.",
      },
      { status: 500 },
    );
  }

  const response = NextResponse.redirect(data.signedUrl, 302);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
