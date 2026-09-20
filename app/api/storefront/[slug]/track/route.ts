import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getTenantSlugFromHost, normalizeTenantSlug } from "@/lib/tenancy/domain";
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  try {
    const slug = normalizeTenantSlug((await params).slug);
    const hostTenant = getTenantSlugFromHost(request.headers.get("x-forwarded-host") ?? request.headers.get("host"));
    if (!slug || (hostTenant && hostTenant !== slug)) return reply({ message: "Order not found." }, 404);
    const body = await request.json();
    const number = typeof body.orderNumber === "string" ? body.orderNumber.trim().toUpperCase() : "";
    if (!/^WEB-[0-9A-F]{10}$/.test(number)) return reply({ message: "Invalid tracking ID." }, 400);
    const { data: business, error: businessError } = await supabaseAdmin.from("businesses").select("id").eq("slug", slug).maybeSingle();
    if (businessError || !business) return reply({ message: "Order not found." }, 404);
    const { data, error } = await supabaseAdmin.from("orders").select("public_order_token").eq("business_id", business.id).eq("order_number", number).in("order_source", ["online", "qr"]).maybeSingle();
    if (error || !data?.public_order_token) return reply({ message: "Order not found." }, 404);
    return reply({ token: data.public_order_token });
  } catch { return reply({ message: "Unable to find order. Try again." }, 400); }
}
