import { storefrontTheme } from "@/lib/storefront/theme";
import { StorefrontLanguage } from "./storefront-language";
import { bestsellerKeys } from "@/lib/storefront/bestsellers";
import { isNewArrival } from "@/lib/storefront/profile";
import { notFound } from "next/navigation";
import {
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
import StorefrontContact from "./storefront-contact";
import { supportsDineIn } from "@/lib/storefront/profile";
import "./storefront.css";

type StorefrontPageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    table?: string;
  }>;
};

type CategoryRow = {
  branch_ids: string[] | null;
  id: string;
  name: string;
};

type ProductRow = {
  created_at: string;
  id: string;
  category_id: string | null;
  name: string;
  sku: string | null;
  size: string | null;
  color: string | null;
  image_url: string | null;
  variant_image_url: string | null;
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

type DeliveryZoneRow = {
  id: string;
  name: string;
  fee: number;
  minimum_order: number;
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
    // eslint-disable-next-line react-hooks/purity -- Server-side subscription access is evaluated at request time.
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
        fulfillment_location_id,
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
        social_links,
        allow_pickup,
        allow_delivery,
        allow_dine_in,
        minimum_order,
        delivery_fee,
        checkout_message,
        accept_cod,
        accept_khqr,
        khqr_image_url,
        khqr_account_name,
        khqr_instructions,
        allow_scheduled_orders,
        min_schedule_lead_minutes,
        max_schedule_days,
        enable_coupons,
        loyalty_enabled,
        loyalty_spend_per_point,
        loyalty_minimum_order,
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

  const [categoryResult, productResult, zoneResult] = await Promise.all([
    supabaseAdmin
      .from("categories")
      .select("id, name, branch_ids")
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
        variant_image_url,
        description,
        selling_price,
        stock_quantity,
        product_type,
        variant_group_id,
        created_at
      `)
      .eq("business_id", business.id)
      .eq("is_active", true)
      .eq("is_online", true)
      .order("online_sort_order", { ascending: true })
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("business_delivery_zones")
      .select("id, name, fee, minimum_order")
      .eq("business_id", business.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
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

  if (zoneResult.error) {
    throw new Error(
      `Unable to load delivery zones: ${zoneResult.error.message}`,
    );
  }

  const deliveryZones = (zoneResult.data ?? []) as DeliveryZoneRow[];

  let categories = (categoryResult.data ?? []) as CategoryRow[];
  const categoryIds = new Set(categories.map((category) => category.id));
  let productRows = ((productResult.data ?? []) as ProductRow[]).filter(
    (product) => !product.category_id || categoryIds.has(product.category_id),
  );

  const { data: inventoryBranches, error: inventoryBranchError } = await supabaseAdmin.from("business_locations").select("id,is_default,is_active").eq("business_id", business.id);
  if (inventoryBranchError) throw new Error("Unable to load fulfillment branch.");
  const fulfillmentBranch = inventoryBranches?.find(branch => branch.id === storefrontData?.fulfillment_location_id && branch.is_active)
    ?? (!storefrontData?.fulfillment_location_id ? inventoryBranches?.find(branch => branch.is_default && branch.is_active) : undefined);
  if (!fulfillmentBranch) { productRows=[]; categories=[]; }
  else {
    categories=categories.filter(c=>c.branch_ids===null || c.branch_ids.includes(fulfillmentBranch.id));
    const visibleCategories=new Set(categories.map(c=>c.id));
    const {data: branchStock,error:branchStockError}=await supabaseAdmin.from("product_location_stock").select("product_id,quantity").eq("business_id",business.id).eq("location_id",fulfillmentBranch.id);
    if(branchStockError) throw new Error("Unable to load fulfillment stock.");
    const stockByProduct=new Map((branchStock ?? []).map(r=>[r.product_id,Number(r.quantity)]));
    productRows=productRows.filter(p=>stockByProduct.has(p.id) && (!p.category_id || visibleCategories.has(p.category_id))).map(p=>({...p,stock_quantity:Math.min(p.stock_quantity,stockByProduct.get(p.id) ?? 0)}));
  }
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
    storefront.social_links?.profile?.newArrivals,
  ).map(product => ({ ...product, preorderVariantIds: product.variants.filter(variant => storefront.social_links?.profile?.featuredProductIds?.includes(variant.id)).map(variant => variant.id), isFeatured: product.variants.some(variant => storefront.social_links?.profile?.featuredProductIds?.includes(variant.id)) }));

  const soldQuantities = new Map<string, number>();
  const since = new Date(); since.setDate(since.getDate() - 30);
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin.from("order_items")
      .select("id, product_id, quantity, orders!inner(business_id,status,created_at)")
      .eq("orders.business_id", business.id).eq("orders.status", "completed")
      .gte("orders.created_at", since.toISOString()).order("id").range(offset, offset + 999);
    if (error) { soldQuantities.clear(); break; }
    for (const row of data ?? []) if (row.product_id) soldQuantities.set(row.product_id, (soldQuantities.get(row.product_id) ?? 0) + Number(row.quantity || 0));
    if (!data || data.length < 1000) break;
  }
  const bestsellers = bestsellerKeys(catalogProducts, soldQuantities);

  const tableToken = supportsDineIn(storefront.business_type) ? await validateTableToken({
    businessId: business.id,
    token: tableTokenRaw ?? null,
  }) : null;

  const displayName =
    storefront.display_name?.trim() || business.name;
  const primaryColor =
    storefront.primary_color || "#2563EB";

  return (
    <StorefrontLanguage><main className="public-store" id="store-home" style={storefrontTheme(primaryColor)}>
      <div className="store-shell">
        <StorefrontShop
          brand={{
            locationUrl: storefront.social_links?.profile?.locationUrl, address: storefront.address, newArrivalsEnabled: storefront.social_links?.profile?.newArrivals?.enabled !== false, name: displayName, businessType: storefront.business_type, businessTypeLabel: formatBusinessType(storefront.business_type), logoUrl: storefront.logo_url, bannerUrl: storefront.banner_url, description: storefront.description, ownerUrl: getRootUrl("/login"), orderingEnabled: storefront.accept_online_orders, allowDelivery: storefront.allow_delivery, allowPickup: storefront.allow_pickup }}
          slug={slug}
          categories={categories as StorefrontCatalogCategory[]}
          products={catalogProducts.map(product => ({ ...product, isBestseller: bestsellers.has(product.key) }))}
          tableToken={tableToken}
          settings={{
            businessType: storefront.business_type,
            currency: storefront.currency,
            primaryColor,
            orderingEnabled:
              storefront.accept_online_orders &&
              (storefront.accept_cod || (storefront.accept_khqr && Boolean(storefront.khqr_image_url))) &&
              (storefront.allow_pickup ||
                storefront.allow_delivery ||
                (storefront.allow_dine_in && Boolean(tableToken))),
            allowPickup: storefront.allow_pickup,
            allowDelivery: storefront.allow_delivery,
            allowDineIn: supportsDineIn(storefront.business_type) && storefront.allow_dine_in,
            minimumOrder: Number(storefront.minimum_order ?? 0),
            deliveryFee: Number(storefront.delivery_fee ?? 0),
            checkoutMessage: storefront.checkout_message,
            acceptCod: storefront.accept_cod,
            acceptKhqr: storefront.accept_khqr,
            khqrImageUrl: storefront.khqr_image_url,
            khqrAccountName: storefront.khqr_account_name,
            khqrInstructions: storefront.khqr_instructions,
            allowScheduledOrders: storefront.allow_scheduled_orders,
            minScheduleLeadMinutes: Number(storefront.min_schedule_lead_minutes ?? 30),
            maxScheduleDays: Number(storefront.max_schedule_days ?? 7),
            couponsEnabled: storefront.enable_coupons,
            loyaltyEnabled: storefront.loyalty_enabled,
            loyaltySpendPerPoint: Number(storefront.loyalty_spend_per_point ?? 1),
            loyaltyMinimumOrder: Number(storefront.loyalty_minimum_order ?? 0),
            deliveryZones: deliveryZones.map((zone) => ({
              id: zone.id,
              name: zone.name,
              fee: Number(zone.fee),
              minimumOrder: Number(zone.minimum_order),
            })),
          }}
        />
        <StorefrontContact name={displayName} settings={storefront} />
      </div>
    </main></StorefrontLanguage>
  );
}



function buildCatalog(
  rows: ProductRow[],
  optionGroupsByProduct: Map<string, StorefrontCatalogOptionGroup[]>,
  newArrivals: import("@/lib/storefront/profile").StoreProfile["newArrivals"],
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
      imageUrl: row.variant_image_url,
      sellingPrice: Number(row.selling_price),
      stockQuantity: Number(row.stock_quantity),
    }));

    return {
      key,
      isNewArrival: isNewArrival(groupRows.map(row => row.created_at).filter(Boolean).sort()[0], newArrivals),
      categoryId: first.category_id,
      name: first.name,
      imageUrl:
        groupRows.find((row) => row.image_url)?.image_url ??
        groupRows.find((row) => row.variant_image_url)?.variant_image_url ??
        null,
      images: [...new Set(groupRows.flatMap(row => [row.image_url, row.variant_image_url]).filter((url): url is string => Boolean(url)))],
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
