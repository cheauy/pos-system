import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Clock3,
  MapPin,
  Package,
  Phone,
  ShoppingBag,
  Store,
} from "lucide-react";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  formatBusinessType,
  type StorefrontSettings,
} from "@/lib/storefront/types";
import {
  getRootUrl,
  normalizeTenantSlug,
} from "@/lib/tenancy/domain";

type StorefrontPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

type Category = {
  id: string;
  name: string;
  is_online: boolean;
  online_sort_order: number;
};

type Product = {
  id: string;
  category_id: string | null;
  name: string;
  sku: string | null;
  image_url: string | null;
  description: string | null;
  selling_price: number;
  stock_quantity: number;
  is_online: boolean;
  is_active: boolean;
  online_sort_order: number;
};

export default async function StorefrontPage({
  params,
}: StorefrontPageProps) {
  const { slug: rawSlug } = await params;
  const slug = normalizeTenantSlug(rawSlug);

  if (!slug) {
    notFound();
  }

  const {
    data: business,
    error: businessError,
  } = await supabaseAdmin
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

  if (!business) {
    notFound();
  }

  const expiryTime =
    business.subscription_expires_at
      ? new Date(
          business.subscription_expires_at,
        ).getTime()
      : null;

  const subscriptionExpired =
    expiryTime !== null &&
    !Number.isNaN(expiryTime) &&
    expiryTime <= Date.now();

  const businessAvailable =
    business.is_active &&
    !subscriptionExpired;

  const {
    data: storefrontData,
    error: storefrontError,
  } = await supabaseAdmin
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

  const storefront =
    (storefrontData ?? null) as StorefrontSettings | null;

  if (!businessAvailable) {
    return (
      <UnavailableStore
        businessName={business.name}
        message="Online ordering is paused because this business account is inactive or its subscription has expired."
      />
    );
  }

  if (!storefront?.is_published) {
    return (
      <UnavailableStore
        businessName={business.name}
        message="This online store has not been published yet."
      />
    );
  }

  const [categoryResult, productResult] =
    await Promise.all([
      supabaseAdmin
        .from("categories")
        .select(`
          id,
          name,
          is_online,
          online_sort_order
        `)
        .eq("business_id", business.id)
        .eq("is_online", true)
        .order("online_sort_order", {
          ascending: true,
        })
        .order("name", {
          ascending: true,
        }),
      supabaseAdmin
        .from("products")
        .select(`
          id,
          category_id,
          name,
          sku,
          image_url,
          description,
          selling_price,
          stock_quantity,
          is_online,
          is_active,
          online_sort_order
        `)
        .eq("business_id", business.id)
        .eq("is_active", true)
        .eq("is_online", true)
        .order("online_sort_order", {
          ascending: true,
        })
        .order("created_at", {
          ascending: false,
        }),
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

  const categories =
    (categoryResult.data ?? []) as Category[];

  const categoryIds = new Set(
    categories.map((category) => category.id),
  );

  const products = (
    (productResult.data ?? []) as Product[]
  ).filter(
    (product) =>
      !product.category_id ||
      categoryIds.has(product.category_id),
  );

  const displayName =
    storefront.display_name?.trim() ||
    business.name;

  const primaryColor =
    storefront.primary_color || "#2563EB";

  const uncategorized = products.filter(
    (product) => !product.category_id,
  );

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
                style={{
                  backgroundColor: primaryColor,
                }}
              >
                <Store size={22} />
              </div>
            )}

            <div className="min-w-0">
              <p className="truncate font-bold text-slate-950">
                {displayName}
              </p>
              <p className="text-xs text-slate-500">
                {formatBusinessType(
                  storefront.business_type,
                )}
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
            {storefront.accept_online_orders
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
                <Phone size={16} />
                {storefront.phone}
              </span>
            )}

            {storefront.address && (
              <span className="inline-flex items-center gap-2">
                <MapPin size={16} />
                {storefront.address}
              </span>
            )}

            {storefront.estimated_minutes && (
              <span className="inline-flex items-center gap-2">
                <Clock3 size={16} />
                About {storefront.estimated_minutes} min
              </span>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap gap-2">
          {categories.map((category) => (
            <a
              key={category.id}
              href={`#category-${category.id}`}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              {category.name}
            </a>
          ))}

          {uncategorized.length > 0 && (
            <a
              href="#category-other"
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              Other
            </a>
          )}
        </div>

        {products.length === 0 ? (
          <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <Package
              size={42}
              className="mx-auto text-slate-300"
            />
            <h2 className="mt-4 text-lg font-bold text-slate-900">
              No products online yet
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              This store is published, but the owner has not made any products visible online.
            </p>
          </section>
        ) : (
          <div className="space-y-12">
            {categories.map((category) => {
              const categoryProducts =
                products.filter(
                  (product) =>
                    product.category_id ===
                    category.id,
                );

              if (categoryProducts.length === 0) {
                return null;
              }

              return (
                <ProductSection
                  key={category.id}
                  id={`category-${category.id}`}
                  title={category.name}
                  products={categoryProducts}
                  currency={storefront.currency}
                  primaryColor={primaryColor}
                  orderingEnabled={
                    storefront.accept_online_orders
                  }
                />
              );
            })}

            {uncategorized.length > 0 && (
              <ProductSection
                id="category-other"
                title="Other"
                products={uncategorized}
                currency={storefront.currency}
                primaryColor={primaryColor}
                orderingEnabled={
                  storefront.accept_online_orders
                }
              />
            )}
          </div>
        )}
      </div>

      <footer className="border-t border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
        Powered by TENH POS
      </footer>
    </main>
  );
}

function ProductSection({
  id,
  title,
  products,
  currency,
  primaryColor,
  orderingEnabled,
}: {
  id: string;
  title: string;
  products: Product[];
  currency: string;
  primaryColor: string;
  orderingEnabled: boolean;
}) {
  return (
    <section id={id} className="scroll-mt-6">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-950">
            {title}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {products.length} item
            {products.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {products.map((product) => (
          <article
            key={product.id}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="aspect-[4/3] w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[4/3] w-full items-center justify-center bg-slate-100 text-slate-300">
                <ShoppingBag size={34} />
              </div>
            )}

            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900">
                    {product.name}
                  </h3>
                  {product.description && (
                    <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500">
                      {product.description}
                    </p>
                  )}
                </div>

                <p
                  className="shrink-0 font-bold"
                  style={{
                    color: primaryColor,
                  }}
                >
                  {formatMoney(
                    product.selling_price,
                    currency,
                  )}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-slate-400">
                  {product.stock_quantity > 0
                    ? "In stock"
                    : "Out of stock"}
                </span>

                {orderingEnabled && (
                  <span
                    className="rounded-full px-3 py-1 text-xs font-semibold text-white"
                    style={{
                      backgroundColor:
                        product.stock_quantity > 0
                          ? primaryColor
                          : "#94A3B8",
                    }}
                  >
                    Ordering soon
                  </span>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function formatMoney(
  value: number,
  currency: string,
) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits:
        currency === "KHR" ? 0 : 2,
      maximumFractionDigits:
        currency === "KHR" ? 0 : 2,
    }).format(Number(value));
  } catch {
    return `${currency} ${Number(value).toFixed(2)}`;
  }
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
              <h1 className="font-bold text-slate-950">
                {businessName}
              </h1>
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
          <ShoppingBag
            size={40}
            className="mx-auto text-amber-500"
          />
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
