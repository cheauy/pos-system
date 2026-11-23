import type { NextRequest } from "next/server";

import {
  authenticateBusinessApiKey,
  loadExternalProductCatalog,
} from "@/lib/integrations/catalog-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authenticateBusinessApiKey(request, "products:read");
  if (!auth.ok) {
    return Response.json(
      { ok: false, error: auth.error },
      { status: auth.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  const sp = request.nextUrl.searchParams;
  const page = Math.max(1, Number.parseInt(sp.get("page") ?? "1", 10) || 1);
  const limit = Math.max(
    1,
    Math.min(Number.parseInt(sp.get("limit") ?? "200", 10) || 200, 500),
  );
  const onlineOnly =
    sp.get("online_only") === "true" || sp.get("online_only") === "1";
  const search = sp.get("search") ?? sp.get("q") ?? null;
  const categoryId = sp.get("category_id") ?? null;
  const branchId = sp.get("branch_id") ?? null;
  const updatedSince = sp.get("updated_since") ?? null;

  try {
    const catalog = await loadExternalProductCatalog(auth.business, {
      onlineOnly,
      search,
      categoryId,
      branchId,
      updatedSince,
      page,
      limit,
    });

    return Response.json(
      {
        ok: true,
        business: {
          id: auth.business.id,
          name: auth.business.name,
          slug: auth.business.slug,
          currency: catalog.currency,
        },
        count: catalog.products.length,
        total: catalog.total,
        page: catalog.page,
        limit: catalog.limit,
        synced_at: new Date().toISOString(),
        products: catalog.products,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load product catalog.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
