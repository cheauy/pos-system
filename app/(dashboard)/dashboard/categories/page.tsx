import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import CategoriesClient, {
  type CategoryViewModel,
} from "./categories-client";

type CategoryRow = {
  id: string;
  name: string;
  description: string | null;
  is_online: boolean;
  online_sort_order: number | null;
  created_at: string;
};

type ProductCategoryRow = {
  id: string;
  category_id: string | null;
};

export default async function CategoriesPage() {
  const supabase = await createClient();
  const business = await requirePermission("categories.manage");

  const [categoryResult, productResult] = await Promise.all([
    supabase
      .from("categories")
      .select(
        "id, name, description, is_online, online_sort_order, created_at",
      )
      .eq("business_id", business.id)
      .order("online_sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("products")
      .select("id, category_id")
      .eq("business_id", business.id),
  ]);

  const categoryRows = (categoryResult.data ?? []) as CategoryRow[];
  const productRows = (productResult.data ?? []) as ProductCategoryRow[];

  const counts = new Map<string, number>();
  for (const product of productRows) {
    if (!product.category_id) continue;
    counts.set(
      product.category_id,
      (counts.get(product.category_id) ?? 0) + 1,
    );
  }

  const categories: CategoryViewModel[] = categoryRows.map((category) => ({
    id: category.id,
    name: category.name,
    description: category.description,
    isOnline: Boolean(category.is_online),
    index: Number(category.online_sort_order ?? 0),
    productCount: counts.get(category.id) ?? 0,
    createdAt: category.created_at,
  }));

  const errorMessage =
    categoryResult.error?.message ?? productResult.error?.message ?? null;

  return (
    <CategoriesClient
      categories={categories}
      totalProducts={productRows.length}
      loadError={errorMessage}
    />
  );
}
