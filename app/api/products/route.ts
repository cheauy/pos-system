import type { NextRequest } from "next/server";
import { GET as getProductsV1 } from "@/app/api/v1/products/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return getProductsV1(request);
}
