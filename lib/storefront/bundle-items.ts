import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import type { StorefrontCatalogProduct } from "./catalog-types";

// The public storefront uses the shared product catalog and its shared bundle recipe.
// Components need not be sold individually online. Expose display fields only.
export async function storefrontBundleItems(businessId: string, bundleIds: string[]) {
  const output = new Map<string, NonNullable<StorefrontCatalogProduct["bundleItems"]>>();
  if (!bundleIds.length) return output;
  const recipes = await readAllRows<{ id: string; bundle_product_id: string; component_product_id: string; quantity: number }>(
    (from, to) => supabaseAdmin.from("bundle_items").select("id,bundle_product_id,component_product_id,quantity")
      .eq("business_id", businessId).in("bundle_product_id", bundleIds).order("created_at").order("id").range(from, to),
  );
  if (recipes.error) throw new Error("Unable to load included bundle items.");
  const ids = [...new Set((recipes.data ?? []).map(item => item.component_product_id))];
  if (!ids.length) return output;
  const components = await readAllRows<{ id: string; name: string; size: string | null; color: string | null; image_url: string | null; variant_image_url: string | null }>(
    (from, to) => supabaseAdmin.from("products").select("id,name,size,color,image_url,variant_image_url")
      .eq("business_id", businessId).in("id", ids).order("id").range(from, to),
  );
  if (components.error) throw new Error("Unable to load included item photos.");
  const byId = new Map((components.data ?? []).map(item => [item.id, item]));
  for (const recipe of recipes.data ?? []) {
    const item = byId.get(recipe.component_product_id);
    if (!item) continue;
    const rows = output.get(recipe.bundle_product_id) ?? [];
    rows.push({ id: recipe.id, name: item.name, imageUrl: item.variant_image_url || item.image_url || null,
      size: item.size, color: item.color, quantity: Number(recipe.quantity) });
    output.set(recipe.bundle_product_id, rows);
  }
  return output;
}
