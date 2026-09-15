import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Clock3,
  MapPin,
  Phone,
  ShoppingBag,
  Store,
} from "lucide-react";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  StorefrontCatalogCategory,
  StorefrontCatalogOptionGroup,
  StorefrontCatalogProduct,
} from "@/lib/storefront/catalog-types";
import {
  formatBusinessType,
  type StorefrontSettings,
} from "@/lib/storefront/types";
import {
  getRootUrl,
  normalizeTenantSlug,
} from "@/lib/tenancy/domain";
import StorefrontShop from "./storefront-shop";

type StorefrontPageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    table?: string;
  }>;
};

type CategoryRow = {
  id: string;
  name: string;
};

type ProductRow = {
  id: string;
  category_id: string | null;
  name: string;
  sku: string | null;
  size: string | null;
  color: string | null;
  image_url: string | null;
  description: string | null;
  selling_price: number;
  stock_quantity: number;
  product_type: string | null;
  variant_group_id: string | null;
};

type GroupRow = {
  id: string;
  product_id: string;
  name: string;
  selection_type: "single" | "multiple";
  is_required: boolean;
  min_selections: number;
  max_selections: number;
  sort_order: number;
};

type OptionRow = {
  id: string;
  product_id: string;
  group_id: string;
  name: string;
  price_adjustment: number;
  is_default: boolean;
  sort_order: number;
};

export default async function StorefrontPage({
  params,
  searchParams,
}: StorefrontPageProps) {
  const { slug: rawSlug } = await params;
  const { table: tableTokenRaw } = await searchParams;
  const slug = normalizeTenantSlug(rawSlug);

  if (!slug) notFound();

  const { data: business, error: businessError } =
    await supabaseAdmin
      .from("businesses")
      .select(`
        id,
        name,
        slug,
        is_active,
        product_mode,
        subscription_expires_at
      `)
      .eq("slug", slug)
      .maybeSingle();

  if (businessError) {
    throw new Error(
      `Unable to load online store: ${businessError.message}`,
    );
  }

  if (!business) notFound();

  const expiryTime = business.subscription_expires_at
    ? new Date(business.subscription_expires_at).getTime()
    : null;

  const subscriptionExpired =
    expiryTime !== null &&
    !Number.isNaN(expiryTime) &&
    expiryTime <= Date.now();

  if (!business.is_active || subscriptionExpired) {
    return (
      <UnavailableStore
        businessName={business.name}
        message="Online ordering is paused because this business account is inactive or its subscription has expired."
      />
    );
  }

  const { data: storefrontData, error: storefrontError } =
    await supabaseAdmin
      .from("business_storefronts")
      .select(`
        business_id,
        business_type,
        is_published,
        accept_online_orders,
        template_key,
        display_name,
        description,
        logo_url,
        banner_url,
        primary_color,
        phone,
        address,
        currency,
        allow_pickup,
        allow_delivery,
        allow_dine_in,
        minimum_order,
        delivery_fee,
        checkout_message,
        estimated_minutes,
        created_at,
        updated_at
      `)
      .eq("business_id", business.id)
      .maybeSingle();

  if (storefrontError) {
    throw new Error(
      `Unable to load storefront settings: ${storefrontError.message}`,
    );
  }

  const storefront = storefrontData as StorefrontSettings | null;

  if (!storefront?.is_published) {
    return (
      <UnavailableStore
        businessName={business.name}
        message="This online store has not been published yet."
      />
    );
  }

  const [categoryResult, productResult] = await Promise.all([
    supabaseAdmin
      .from("categories")
      .select("id, name")
      .eq("business_id", business.id)
      .eq("is_online", true)
      .order("online_sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabaseAdmin
      .from("products")
      .select(`
        id,
        category_id,
        name,
        sku,
        size,
        color,
        image_url,
        description,
        selling_price,
        stock_quantity,
        product_type,
        variant_group_id
      `)
      .eq("business_id", business.id)
      .eq("is_active", true)
      .eq("is_online", true)
      .order("online_sort_order", { ascending: true })
      .order("created_at", { ascending: false }),
  ]);

  if (categoryResult.error) {
    throw new Error(
      `Unable to load store categories: ${categoryResult.error.message}`,
    );
  }

  if (productResult.error) {
    throw new Error(
      `Unable to load store products: ${productResult.error.message}`,
    );
  }

  const categories = (categoryResult.data ?? []) as CategoryRow[];
  const categoryIds = new Set(categories.map((category) => category.id));
  const productRows = ((productResult.data ?? []) as ProductRow[]).filter(
    (product) => !product.category_id || categoryIds.has(product.category_id),
  );

  const configurableProductIds = productRows
    .filter((product) => product.product_type === "configurable")
    .map((product) => product.id);

  const optionGroupsByProduct = new Map<string, StorefrontCatalogOptionGroup[]>();

  if (configurableProductIds.length > 0) {
    const [groupResult, optionResult] = await Promise.all([
      supabaseAdmin
        .from("product_option_groups")
        .select(`
          id,
          product_id,
          name,
          selection_type,
          is_required,
          min_selections,
          max_selections,
          sort_order
        `)
        .eq("business_id", business.id)
        .in("product_id", configurableProductIds)
        .order("sort_order", { ascending: true }),
      supabaseAdmin
        .from("product_options")
        .select(`
          id,
          product_id,
          group_id,
          name,
          price_adjustment,
          is_default,
          sort_order
        `)
        .eq("business_id", business.id)
        .in("product_id", configurableProductIds)
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
    ]);

    if (groupResult.error) {
      throw new Error(`Unable to load product options: ${groupResult.error.message}`);
    }
    if (optionResult.error) {
      throw new Error(`Unable to load product options: ${optionResult.error.message}`);
    }

    const groups = (groupResult.data ?? []) as GroupRow[];
    const options = (optionResult.data ?? []) as OptionRow[];

    for (const group of groups) {
      const list = optionGroupsByProduct.get(group.product_id) ?? [];
      list.push({
        id: group.id,
        name: group.name,
        selectionType: group.selection_type,
        isRequired: group.is_required,
        minSelections: Number(group.min_selections),
        maxSelections: Number(group.max_selections),
        options: options
          .filter((option) => option.group_id === group.id)
          .map((option) => ({
            id: option.id,
            name: option.name,
            priceAdjustment: Number(option.price_adjustment),
            isDefault: option.is_default,
          })),
      });
      optionGroupsByProduct.set(group.product_id, list);
    }
  }

  const catalogProducts = buildCatalog(
    productRows,
    optionGroupsByProduct,
  );

  const tableToken = await validateTableToken({
    businessId: business.id,
    token: tableTokenRaw ?? null,
  });

  const displayName =
    storefront.display_name?.trim() || business.name;
  const primaryColor =
    storefront.primary_color || "#2563EB";

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            {storefront.logo_url ? (
              <img
                src={storefront.logo_url}
                alt={`${displayName} logo`}
                className="h-12 w-12 rounded-2xl border border-slate-200 object-cover"
              />
            ) : (
              <div
                className="flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-sm"
                style={{ backgroundColor: primaryColor }}
              >
                <Store size={22} />
              </div>
            )}

            <div className="min-w-0">
              <p className="truncate font-bold text-slate-950">
                {displayName}
              </p>
              <p className="text-xs text-slate-500">
                {formatBusinessType(storefront.business_type)}
              </p>
            </div>
          </div>

          <Link
            href={getRootUrl("/login")}
            className="shrink-0 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Owner sign in
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-slate-200 bg-white">
        {storefront.banner_url ? (
          <div className="absolute inset-0">
            <img
              src={storefront.banner_url}
              alt=""
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-slate-950/55" />
          </div>
        ) : (
          <div
            className="absolute inset-0 opacity-95"
            style={{
              background: `linear-gradient(135deg, ${primaryColor}, #0f172a)`,
            }}
          />
        )}

        <div className="relative mx-auto max-w-7xl px-4 py-14 text-white sm:px-6 sm:py-20 lg:px-8">
          <span className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur-sm">
            {tableToken
              ? "Table QR ordering"
              : storefront.accept_online_orders
                ? "Online ordering enabled"
                : "Browse online"}
          </span>

          <h1 className="mt-5 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            {displayName}
          </h1>

          {storefront.description && (
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/85">
              {storefront.description}
            </p>
          )}

          <div className="mt-7 flex flex-wrap gap-x-5 gap-y-3 text-sm text-white/90">
            {storefront.phone && (
              <span className="inline-flex items-center gap-2">
                <Phone size={16} /> {storefront.phone}
              </span>
            )}
            {storefront.address && (
              <span className="inline-flex items-center gap-2">
                <MapPin size={16} /> {storefront.address}
              </span>
            )}
            {storefront.estimated_minutes && (
              <span className="inline-flex items-center gap-2">
                <Clock3 size={16} /> About {storefront.estimated_minutes} min
              </span>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8 pb-28 sm:px-6 lg:px-8">
        <StorefrontShop
          slug={slug}
          categories={categories as StorefrontCatalogCategory[]}
          products={catalogProducts}
          tableToken={tableToken}
          settings={{
            currency: storefront.currency,
            primaryColor,
            orderingEnabled:
              storefront.accept_online_orders &&
              (storefront.allow_pickup ||
                storefront.allow_delivery ||
                (storefront.allow_dine_in && Boolean(tableToken))),
            allowPickup: storefront.allow_pickup,
            allowDelivery: storefront.allow_delivery,
            allowDineIn: storefront.allow_dine_in,
            minimumOrder: Number(storefront.minimum_order ?? 0),
            deliveryFee: Number(storefront.delivery_fee ?? 0),
            checkoutMessage: storefront.checkout_message,
          }}
        />
      </div>

      <footer className="border-t border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
        Powered by TENH POS
      </footer>
    </main>
  );
}

function buildCatalog(
  rows: ProductRow[],
  optionGroupsByProduct: Map<string, StorefrontCatalogOptionGroup[]>,
): StorefrontCatalogProduct[] {
  const grouped = new Map<string, ProductRow[]>();

  for (const row of rows) {
    const key =
      row.product_type === "variant" && row.variant_group_id
        ? `variant:${row.variant_group_id}`
        : `product:${row.id}`;
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }

  return [...grouped.entries()].map(([key, groupRows]) => {
    const first = groupRows[0];
    const productType = normalizeProductType(first.product_type);
    const variants = groupRows.map((row) => ({
      id: row.id,
      sku: row.sku,
      size: row.size,
      color: row.color,
      sellingPrice: Number(row.selling_price),
      stockQuantity: Number(row.stock_quantity),
    }));

    return {
      key,
      categoryId: first.category_id,
      name: first.name,
      imageUrl:
        groupRows.find((row) => row.image_url)?.image_url ?? null,
      description: first.description,
      productType,
      priceFrom: Math.min(
        ...variants.map((variant) => variant.sellingPrice),
      ),
      totalStock: variants.reduce(
        (sum, variant) => sum + variant.stockQuantity,
        0,
      ),
      variants,
      optionGroups:
        productType === "configurable"
          ? optionGroupsByProduct.get(first.id) ?? []
          : [],
    };
  });
}

function normalizeProductType(value: string | null) {
  if (
    value === "variant" ||
    value === "configurable" ||
    value === "bundle"
  ) {
    return value;
  }
  return "standard" as const;
}

async function validateTableToken({
  businessId,
  token,
}: {
  businessId: string;
  token: string | null;
}) {
  if (!token) return null;

  const { data, error } = await supabaseAdmin
    .from("business_tables")
    .select("public_token")
    .eq("business_id", businessId)
    .eq("public_token", token)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return null;
  return data.public_token as string;
}

function UnavailableStore({
  businessName,
  message,
}: {
  businessName: string;
  message: string;
}) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
              <Store size={21} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">
                TENH POS Store
              </p>
              <h1 className="font-bold text-slate-950">{businessName}</h1>
            </div>
          </div>

          <Link
            href={getRootUrl("/login")}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
          >
            Owner sign in
          </Link>
        </header>

        <section className="mt-16 rounded-3xl border border-amber-200 bg-amber-50 p-10 text-center">
          <ShoppingBag size={40} className="mx-auto text-amber-500" />
          <p className="mt-5 text-lg font-bold text-amber-950">
            Store temporarily unavailable
          </p>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-amber-800">
            {message}
          </p>
        </section>
      </div>
    </main>
  );
}
