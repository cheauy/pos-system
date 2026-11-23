import type { NextRequest } from "next/server";

import {
  authenticateBusinessApiKey,
  loadExternalProductCatalog,
} from "@/lib/integrations/catalog-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateBusinessApiKey(request, "products:read");
  if (!auth.ok) {
    return Response.json(
      { ok: false, error: auth.error },
      { status: auth.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { id } = await params;
  const cleanId = id?.trim();
  if (!cleanId) {
    return Response.json(
      { ok: false, error: "Product identifier is required." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const catalog = await loadExternalProductCatalog(auth.business, {
      entityId: cleanId,
      limit: 1,
    });

    const product = catalog.products[0] ?? null;
    if (!product) {
      return Response.json(
        { ok: false, error: "Product not found." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    return Response.json(
      {
        ok: true,
        business: {
          id: auth.business.id,
          name: auth.business.name,
          slug: auth.business.slug,
          currency: catalog.currency,
        },
        product,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Unable to load product.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
