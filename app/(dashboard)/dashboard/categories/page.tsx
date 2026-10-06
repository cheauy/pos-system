import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { readAllRows } from "@/lib/supabase/read-all-rows";
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
  branch_ids: string[] | null;
};

type ProductCategoryRow = {
  id: string;
  category_id: string | null;
};

export default async function CategoriesPage() {
  const [supabase, business] = await Promise.all([createClient(), requirePermission("categories.manage")]);

  const [categoryResult, totals, branches] = await Promise.all([
    supabase
      .from("categories")
      .select(
        "id, name, description, is_online, online_sort_order, created_at, branch_ids",
      )
      .eq("business_id", business.id)
      .order("online_sort_order", { ascending: true })
      .order("name", { ascending: true }),
    // Counted in the database; one small payload instead of every product row.
    supabase.rpc("tenh_category_product_totals", { p_business: business.id }),
    supabase.from("business_locations").select("id,name").eq("business_id",business.id).eq("is_active",true).order("name"),
  ]);

  if(branches.error) throw new Error("Unable to load category branches.");
  const categoryRows = (categoryResult.data ?? []) as CategoryRow[];
  const counts = new Map<string, number>();
  let totalProducts = 0;
  let productError: string | null = null;
  if (!totals.error && totals.data) {
    const data = totals.data as { total: number; counts: Record<string, number> };
    totalProducts = Number(data.total ?? 0);
    for (const [id, n] of Object.entries(data.counts ?? {})) counts.set(id, Number(n));
  } else {
    // Fallback until the aggregate migration is applied: page through every product row.
    const productResult = await readAllRows<ProductCategoryRow>((from, to) => supabase
      .from("products")
      .select("id, category_id")
      .eq("business_id", business.id)
      .order("id")
      .range(from, to));
    productError = productResult.error?.message ?? null;
    const productRows = (productResult.data ?? []) as ProductCategoryRow[];
    totalProducts = productRows.length;
    for (const product of productRows) {
      if (!product.category_id) continue;
      counts.set(product.category_id, (counts.get(product.category_id) ?? 0) + 1);
    }
  }

  const categories: CategoryViewModel[] = categoryRows.map((category) => ({
    id: category.id,
    branchIds: category.branch_ids,
    name: category.name,
    description: category.description,
    isOnline: Boolean(category.is_online),
    index: Number(category.online_sort_order ?? 0),
    productCount: counts.get(category.id) ?? 0,
    createdAt: category.created_at,
  }));

  const errorMessage =
    categoryResult.error?.message ?? productError;

  return (
    <CategoriesClient
      categories={categories}
      branches={branches.data ?? []}
      totalProducts={totalProducts}
      loadError={errorMessage}
    />
  );
}
