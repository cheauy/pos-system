import "server-only";

import { promotionalPrice, type Campaign } from "@/lib/promotions/pricing";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import { getTenantSlugFromHost, normalizeTenantSlug } from "@/lib/tenancy/domain";
import {
  extractApiKeyFromHeaders,
  hashApiKey,
  isPlausibleApiKey,
} from "./security";

export type AuthenticatedApiBusiness = {
  apiKeyId: string;
  apiKeyName: string;
  scopes: string[];
  business: {
    id: string;
    name: string;
    slug: string;
    productMode: string;
  };
};

export type ApiAuthResult =
  | ({ ok: true } & AuthenticatedApiBusiness)
  | { ok: false; status: number; error: string };

export type ExternalProductVariant = {
  id: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  size: string | null;
  color: string | null;
  price: number;
  sale_price: number | null;
  stock: number;
  in_stock: boolean;
  image_url: string | null;
};

export type ExternalCatalogProduct = {
  id: string;
  product_id: string;
  variant_group_id: string | null;
  sku: string;
  barcode: string | null;
  name: string;
  category: string;
  category_id: string | null;
  product_type: "standard" | "variant" | "configurable" | "bundle";
  price: number;
  sale_price: number | null;
  currency: string;
  stock: number;
  stock_quantity: number;
  in_stock: boolean;
  is_online: boolean;
  image_url: string | null;
  images: string[];
  description: string;
  variants: ExternalProductVariant[];
  variant_items: ExternalProductVariant[];
  created_at: string;
  updated_at: string;
};

type DbProductRow = {
  id: string;
  category_id: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  size: string | null;
  color: string | null;
  image_url: string | null;
  image_urls: string[] | null;
  variant_image_url: string | null;
  description: string | null;
  selling_price: number;
  stock_quantity: number;
  is_active: boolean;
  is_online: boolean;
  product_type: string | null;
  variant_group_id: string | null;
  created_at: string;
  updated_at: string | null;
};

type DbCategoryRow = {
  id: string;
  name: string;
  branch_ids: string[] | null;
};

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeProductType(
  value: string | null,
): "standard" | "variant" | "configurable" | "bundle" {
  if (value === "variant" || value === "configurable" || value === "bundle") {
    return value;
  }
  return "standard";
}

function formatVariantLabel(row: {
  size: string | null;
  color: string | null;
  sku: string | null;
}): string {
  const parts = [row.color?.trim(), row.size?.trim()].filter(Boolean);
  if (parts.length > 0) return parts.join(" / ");
  return row.sku?.trim() || "Standard";
}

export async function authenticateBusinessApiKey(
  request: Request,
  requiredScope = "products:read",
): Promise<ApiAuthResult> {
  const rawKey = extractApiKeyFromHeaders(request.headers);
  if (!rawKey) {
    return {
      ok: false,
      status: 401,
      error: "Missing API key. Provide Authorization: Bearer <api_key> or x-api-key header.",
    };
  }

  if (!isPlausibleApiKey(rawKey)) {
    return {
      ok: false,
      status: 401,
      error: "Invalid API key.",
    };
  }

  const keyHash = hashApiKey(rawKey);
  const { data: keyRow, error: keyError } = await supabaseAdmin
    .from("business_api_keys")
    .select("id, business_id, name, scopes, is_active, revoked_at, last_used_at")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (keyError) {
    if (keyError.code === "42P01" || keyError.code === "PGRST205") {
      return {
        ok: false,
        status: 503,
        error: "API key service is not initialized yet.",
      };
    }
    return {
      ok: false,
      status: 503,
      error: "Unable to verify API key right now.",
    };
  }

  if (!keyRow || !keyRow.is_active || keyRow.revoked_at) {
    return {
      ok: false,
      status: 401,
      error: "Invalid or revoked API key.",
    };
  }

  const scopes = Array.isArray(keyRow.scopes) ? keyRow.scopes.map(String) : [];
  if (!scopes.includes(requiredScope) && !scopes.includes("*")) {
    return {
      ok: false,
      status: 403,
      error: `API key is missing required scope: ${requiredScope}.`,
    };
  }

  const { data: business, error: businessError } = await supabaseAdmin
    .from("businesses")
    .select(
      "id, name, slug, is_active, product_mode, subscription_status, subscription_expires_at",
    )
    .eq("id", keyRow.business_id)
    .maybeSingle();

  if (businessError || !business) {
    return {
      ok: false,
      status: 403,
      error: "Business workspace not found.",
    };
  }

  const expiryMs = business.subscription_expires_at
    ? Date.parse(business.subscription_expires_at)
    : Number.NaN;
  const expired =
    !business.is_active ||
    business.subscription_status === "expired" ||
    business.subscription_status === "trial_blocked" ||
    business.subscription_status === "trial_pending" ||
    (Number.isFinite(expiryMs) && expiryMs <= Date.now());

  if (expired) {
    return {
      ok: false,
      status: 403,
      error: "This business workspace is inactive or its subscription has expired.",
    };
  }

  const headerSlug = request.headers.get("x-tenant-slug")?.trim() || null;
  const hostHeader =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const requestTenantSlug = headerSlug || getTenantSlugFromHost(hostHeader);

  if (
    requestTenantSlug &&
    normalizeTenantSlug(requestTenantSlug) !== normalizeTenantSlug(business.slug)
  ) {
    return {
      ok: false,
      status: 403,
      error: "API key does not belong to this store domain.",
    };
  }

  const lastUsedMs = keyRow.last_used_at ? Date.parse(keyRow.last_used_at) : 0;
  if (!Number.isFinite(lastUsedMs) || Date.now() - lastUsedMs > 5 * 60_000) {
    void supabaseAdmin
      .from("business_api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", keyRow.id)
      .then(() => undefined, () => undefined);
  }

  return {
    ok: true,
    apiKeyId: keyRow.id,
    apiKeyName: keyRow.name,
    scopes,
    business: {
      id: business.id,
      name: business.name,
      slug: business.slug,
      productMode: business.product_mode ?? "standard",
    },
  };
}

export async function loadExternalProductCatalog(
  business: { id: string; name: string; slug: string },
  options: {
    onlineOnly?: boolean;
    branchId?: string | null;
    categoryId?: string | null;
    search?: string | null;
    updatedSince?: string | null;
    entityId?: string | null;
    page?: number;
    limit?: number;
  } = {},
): Promise<{
  currency: string;
  products: ExternalCatalogProduct[];
  total: number;
  page: number;
  limit: number;
}> {
  const [storefrontRes, branchesRes, categoriesRes, campaignsRes] = await Promise.all([
    supabaseAdmin
      .from("business_storefronts")
      .select("currency")
      .eq("business_id", business.id)
      .maybeSingle(),
    supabaseAdmin
      .from("business_locations")
      .select("id")
      .eq("business_id", business.id)
      .eq("is_active", true)
      .eq("plan_disable_pending", false),
    supabaseAdmin
      .from("categories")
      .select("id, name, branch_ids")
      .eq("business_id", business.id),
    supabaseAdmin
      .from("business_coupons")
      .select("*")
      .eq("business_id", business.id)
      .eq("is_automatic", true)
      .eq("is_active", true),
  ]);

  if (branchesRes.error) {
    throw new Error(`Unable to load active branches: ${branchesRes.error.message}`);
  }
  if (categoriesRes.error) {
    throw new Error(`Unable to load categories: ${categoriesRes.error.message}`);
  }

  const currency = storefrontRes.data?.currency?.trim() || "USD";
  const allActiveBranchIds = (branchesRes.data ?? []).map((b) => b.id);
  const requestedBranchId = options.branchId?.trim() || null;
  const activeBranchIds = requestedBranchId
    ? allActiveBranchIds.filter((id) => id === requestedBranchId)
    : allActiveBranchIds;

  const categories = (categoriesRes.data ?? []) as DbCategoryRow[];
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const campaigns = ((campaignsRes.data ?? []) as Campaign[]).filter(
    (c) => c.apply_online || c.apply_pos,
  );

  const isUuid = (v: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

  const productFetch = await readAllRows<DbProductRow>((from, to) => {
    let q = supabaseAdmin
      .from("products")
      .select(
        `
        id,
        category_id,
        name,
        sku,
        barcode,
        size,
        color,
        image_url,
        image_urls,
        variant_image_url,
        description,
        selling_price,
        stock_quantity,
        is_active,
        is_online,
        product_type,
        variant_group_id,
        created_at,
        updated_at
      `,
      )
      .eq("business_id", business.id)
      .eq("is_active", true);

    if (options.onlineOnly) {
      q = q.eq("is_online", true);
    }
    if (options.categoryId && isUuid(options.categoryId)) {
      q = q.eq("category_id", options.categoryId);
    }
    if (options.entityId) {
      const target = options.entityId.trim();
      if (isUuid(target)) {
        q = q.or(`id.eq.${target},variant_group_id.eq.${target}`);
      } else {
        q = q.eq("sku", target);
      }
    }

    return q
      .order("online_sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to);
  });

  if (productFetch.error) {
    throw new Error(`Unable to load products: ${productFetch.error.message}`);
  }

  const rawRows = productFetch.data ?? [];
  if (rawRows.length === 0) {
    return {
      currency,
      products: [],
      total: 0,
      page: Math.max(1, options.page ?? 1),
      limit: Math.max(1, Math.min(options.limit ?? 200, 500)),
    };
  }

  const stockByProduct = new Map<string, number>();
  const seenInBranchStock = new Set<string>();

  if (activeBranchIds.length > 0) {
    const stockFetch = await readAllRows<{
      product_id: string;
      location_id: string;
      quantity: number;
    }>((from, to) =>
      supabaseAdmin
        .from("product_location_stock")
        .select("product_id, location_id, quantity")
        .eq("business_id", business.id)
        .in("location_id", activeBranchIds)
        .order("product_id")
        .order("location_id")
        .range(from, to),
    );

    if (stockFetch.error) {
      throw new Error(`Unable to load branch stock: ${stockFetch.error.message}`);
    }

    const rowById = new Map(rawRows.map((r) => [r.id, r]));
    for (const s of stockFetch.data ?? []) {
      const prod = rowById.get(s.product_id);
      if (!prod) continue;
      const cat = prod.category_id ? categoryMap.get(prod.category_id) : null;
      if (
        prod.category_id &&
        cat &&
        cat.branch_ids !== null &&
        !cat.branch_ids.includes(s.location_id)
      ) {
        continue;
      }
      seenInBranchStock.add(s.product_id);
      const nextQty =
        (stockByProduct.get(s.product_id) ?? 0) + Math.max(0, Number(s.quantity || 0));
      stockByProduct.set(s.product_id, nextQty);
    }
  }

  const visibleRows = rawRows.filter((row) => {
    if (requestedBranchId) {
      return seenInBranchStock.has(row.id);
    }
    if (allActiveBranchIds.length > 0 && seenInBranchStock.size > 0) {
      return seenInBranchStock.has(row.id);
    }
    return true;
  });

  const grouped = new Map<string, DbProductRow[]>();
  for (const row of visibleRows) {
    const key =
      row.variant_group_id && (row.product_type === "variant" || row.size || row.color)
        ? row.variant_group_id
        : row.id;
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }

  const nowMs = Date.now();
  const updatedSinceMs = options.updatedSince
    ? Date.parse(options.updatedSince)
    : Number.NaN;
  const searchNeedle = options.search?.trim().toLowerCase() || "";

  const allProducts: ExternalCatalogProduct[] = [];

  for (const [familyId, groupRows] of grouped.entries()) {
    const first = groupRows[0];
    const cat = first.category_id ? categoryMap.get(first.category_id) : null;
    const categoryName = cat?.name?.trim() || "General";
    const productType = normalizeProductType(first.product_type);

    const variantItems: ExternalProductVariant[] = groupRows.map((row) => {
      const regular = roundMoney(Number(row.selling_price || 0));
      const promoOnline = promotionalPrice(row.id, regular, campaigns, "online", nowMs);
      const promoPos = promotionalPrice(row.id, regular, campaigns, "pos", nowMs);
      const bestPromo = Math.min(promoOnline, promoPos);
      const salePrice = bestPromo > 0 && bestPromo < regular ? bestPromo : null;
      const resolvedStock = seenInBranchStock.has(row.id)
        ? stockByProduct.get(row.id) ?? 0
        : Math.max(0, Math.trunc(Number(row.stock_quantity || 0)));

      return {
        id: row.id,
        sku: row.sku,
        barcode: row.barcode,
        name: formatVariantLabel(row),
        size: row.size,
        color: row.color,
        price: regular,
        sale_price: salePrice,
        stock: resolvedStock,
        in_stock: resolvedStock > 0,
        image_url: row.variant_image_url || row.image_url || null,
      };
    });

    const hasDistinctVariants =
      groupRows.length > 1 || Boolean(first.size?.trim() || first.color?.trim());

    const regularPrices = variantItems.map((v) => v.price);
    const baseRegularPrice = regularPrices.length > 0 ? Math.min(...regularPrices) : 0;

    const effectivePrices = variantItems.map((v) =>
      v.sale_price !== null && v.sale_price < v.price ? v.sale_price : v.price,
    );
    const minEffectivePrice =
      effectivePrices.length > 0 ? Math.min(...effectivePrices) : baseRegularPrice;
    const familySalePrice =
      minEffectivePrice > 0 && minEffectivePrice < baseRegularPrice
        ? minEffectivePrice
        : null;

    const totalStock = variantItems.reduce((sum, v) => sum + v.stock, 0);
    const images = Array.from(
      new Set(
        groupRows
          .flatMap((row) => [
            row.image_url,
            ...(Array.isArray(row.image_urls) ? row.image_urls : []),
            row.variant_image_url,
          ])
          .filter((url): url is string => typeof url === "string" && url.length > 0),
      ),
    );

    const primarySku =
      groupRows.find((r) => r.sku?.trim())?.sku?.trim() ||
      groupRows.find((r) => r.barcode?.trim())?.barcode?.trim() ||
      `TP-${familyId.slice(0, 8).toUpperCase()}`;

    const latestUpdatedAt = groupRows
      .map((r) => r.updated_at || r.created_at)
      .filter(Boolean)
      .sort()
      .at(-1) || first.created_at;

    if (
      Number.isFinite(updatedSinceMs) &&
      Date.parse(latestUpdatedAt) < updatedSinceMs
    ) {
      continue;
    }

    const catalogItem: ExternalCatalogProduct = {
      id: familyId,
      product_id: first.id,
      variant_group_id: first.variant_group_id,
      sku: primarySku,
      barcode: first.barcode,
      name: first.name,
      category: categoryName,
      category_id: first.category_id,
      product_type: productType,
      price: baseRegularPrice,
      sale_price: familySalePrice,
      currency,
      stock: totalStock,
      stock_quantity: totalStock,
      in_stock: totalStock > 0,
      is_online: groupRows.some((r) => r.is_online),
      image_url: images[0] ?? null,
      images,
      description: first.description ?? "",
      variants: hasDistinctVariants ? variantItems : [],
      variant_items: variantItems,
      created_at: first.created_at,
      updated_at: latestUpdatedAt,
    };

    if (searchNeedle) {
      const hay = [
        catalogItem.name,
        catalogItem.sku,
        catalogItem.barcode ?? "",
        catalogItem.category,
        catalogItem.description,
        ...variantItems.map((v) => `${v.name} ${v.sku ?? ""} ${v.barcode ?? ""}`),
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(searchNeedle)) {
        continue;
      }
    }

    allProducts.push(catalogItem);
  }

  const limit = Math.max(1, Math.min(Math.trunc(options.limit ?? 200), 500));
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const start = (page - 1) * limit;
  const paged = allProducts.slice(start, start + limit);

  return {
    currency,
    products: paged,
    total: allProducts.length,
    page,
    limit,
  };
}
