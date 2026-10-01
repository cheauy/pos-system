import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { readAllRows } from "@/lib/supabase/read-all-rows";

// Only load photos for the opened, publicly visible bundle, using its shared recipe.
export async function storefrontBundlePhotos(businessId: string, bundleId: string): Promise<string[]> {
  const recipes = await readAllRows<{ component_product_id: string }>(
    (from, to) => supabaseAdmin.from("bundle_items").select("component_product_id")
      .eq("business_id", businessId).eq("bundle_product_id", bundleId)
      .order("created_at").order("id").range(from, to),
  );
  if (recipes.error) throw new Error("Unable to load included bundle photos.");
  const ids = [...new Set((recipes.data ?? []).map(item => item.component_product_id))];
  if (!ids.length) return [];
  const components = await readAllRows<{ id: string; image_url: string | null; variant_image_url: string | null }>(
    (from, to) => supabaseAdmin.from("products").select("id,image_url,variant_image_url")
      .eq("business_id", businessId).in("id", ids).order("id").range(from, to),
  );
  if (components.error) throw new Error("Unable to load included item photos.");
  const byId = new Map((components.data ?? []).map(item => [item.id, item.variant_image_url || item.image_url]));
  return [...new Set(ids.map(id => byId.get(id)).filter((url): url is string => Boolean(url)))];
}
