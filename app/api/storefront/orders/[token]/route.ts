import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/admin";

type RouteProps = {
  params: Promise<{
    token: string;
  }>;
};

export async function GET(
  _request: Request,
  { params }: RouteProps,
) {
  const { token } = await params;

  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(`
      order_number,
      online_status,
      fulfillment_type,
      total,
      created_at,
      table_name
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

  return NextResponse.json({
    success: true,
    order: data,
  });
}
