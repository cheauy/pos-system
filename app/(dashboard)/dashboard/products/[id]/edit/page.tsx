import { businessHasPermission } from "@/lib/auth/effective-permissions";
import { getBranchContext } from "@/lib/branches/context";
import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentBusinessMode } from "@/lib/business/get-current-business-mode";
import { createClient } from "@/lib/supabase/branch-server";

import EditProductClient from "./edit-product-client";

type EditProductPageProps = {
  params: Promise<{ id: string }>;
};

type Category = {
  id: string;
  name: string;
};

type ProductRow = {
  id: string;
  category_id: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  image_url: string | null;
  image_urls: string[];
  variant_image_url: string | null;
  description: string | null;
  size: string | null;
  color: string | null;
  product_type: string | null;
  variant_group_id: string | null;
  cost_price: number;
  selling_price: number;
  stock_quantity: number;
  low_stock_quantity: number;
  is_active: boolean;
  is_online: boolean;
  updated_at: string;
};

export default async function EditProductPage({ params }: EditProductPageProps) {
  const { id } = await params;
  const business = await requirePermission("products.update");
  const [context, canCreateVariants, canDisable, canAdjustStock] = await Promise.all([getBranchContext(), businessHasPermission(business, "products.create"), businessHasPermission(business, "products.disable"), businessHasPermission(business, "products.stock_adjust")]);
  const supabase = await createClient();
  const currentMode = await getCurrentBusinessMode({
    businessId: business.id,
    productMode: business.productMode,
  });

  const [{ data: productData, error: productError }, { data: categoryData, error: categoryError }] =
    await Promise.all([
      supabase
        .from("branch_products")
        .select(`
          id,
          category_id,
          name,
          sku,
          barcode,
          image_url,
        image_urls,
          variant_image_url,
          description,
          size,
          color,
          product_type,
          variant_group_id,
          cost_price,
          selling_price,
          stock_quantity,
          low_stock_quantity,
          is_active,
          is_online,
          updated_at
        `)
        .eq("id", id)
        .eq("business_id", business.id)
        .maybeSingle(),
      supabase
        .from("categories")
        .select("id, name")
        .eq("business_id", business.id)
        .order("name", { ascending: true }),
    ]);

  if (productError) {
    throw new Error(`Unable to load product: ${productError.message}`);
  }
  if (!productData) notFound();
  if (categoryError) {
    throw new Error(`Unable to load categories: ${categoryError.message}`);
  }

  const representative = productData as ProductRow;
  let rows: ProductRow[] = [representative];

  if (representative.product_type === "variant" && representative.variant_group_id) {
    const { data: groupData, error: groupError } = await supabase
      .from("branch_products")
      .select(`
        id,
        category_id,
        name,
        sku,
        barcode,
        image_url,
        image_urls,
        variant_image_url,
        description,
        size,
        color,
        product_type,
        variant_group_id,
        cost_price,
        selling_price,
        stock_quantity,
        low_stock_quantity,
        is_active,
        is_online,
        updated_at
      `)
      .eq("business_id", business.id)
      .eq("variant_group_id", representative.variant_group_id)
      .order("color", { ascending: true })
      .order("size", { ascending: true });

    if (groupError) {
      throw new Error(`Unable to load product variants: ${groupError.message}`);
    }
    rows = (groupData ?? []) as ProductRow[];
  }

  const variants = rows.map((row) => ({
    id: row.id,
    size: row.size ?? "",
    color: row.color ?? "",
    sku: row.sku ?? "",
    barcode: row.barcode ?? "",
    costPrice: String(row.cost_price ?? 0),
    sellingPrice: String(row.selling_price ?? 0),
    stockQuantity: String(row.stock_quantity ?? 0),
    lowStockQuantity: String(row.low_stock_quantity ?? 5),
    isActive: Boolean(row.is_active),
    isOnline: Boolean(row.is_online),
    imageUrl: row.variant_image_url ?? row.image_url,
    variantImageUrl: row.variant_image_url,
    imageSlot: null,
    expectedUpdatedAt: row.updated_at,
  }));

  return (
    <EditProductClient
      branchId={context.branchId}
      canCreateVariants={canCreateVariants}
      canDisable={canDisable}
      canAdjustStock={canAdjustStock}
      product={{
        id: representative.id,
        name: representative.name,
        categoryId: representative.category_id,
        description: representative.description ?? "",
        barcode: representative.barcode ?? representative.sku ?? "",
        galleryUrls: representative.image_urls ?? [],
        imageUrl: representative.image_url ?? rows.find((row) => row.image_url)?.image_url ?? null,
        images: Array.from(
          new Set(
            rows
              .flatMap((row) => [row.image_url, row.variant_image_url, ...(row.image_urls ?? [])])
              .filter((value): value is string => Boolean(value)),
          ),
        ),
        productType: representative.product_type ?? "standard",
        variantGroupId: representative.variant_group_id,
        isActive: rows.some((row) => row.is_active),
        isOnline: rows.some((row) => row.is_online),
      }}
      categories={(categoryData ?? []) as Category[]}
      initialVariants={variants}
      businessType={currentMode.value}
    />
  );
}
