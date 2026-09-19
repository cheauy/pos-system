import type { StorefrontCatalogProduct } from "./catalog-types";
// Rank styles, combining their variants. Require at least five completed-sale units.
export function bestsellerKeys(products: StorefrontCatalogProduct[], quantities: Map<string, number>): Set<string> {
  const ranked = products.map(product => ({ key: product.key, sold: product.variants.reduce((sum, variant) => sum + Math.max(0, quantities.get(variant.id) ?? 0), 0) })).filter(row => row.sold >= 5).sort((a,b) => b.sold - a.sold);
  const count = Math.max(1, Math.ceil(products.length * 0.2));
  const threshold = ranked[Math.min(count, ranked.length) - 1]?.sold ?? Infinity;
  return new Set(ranked.filter(row => row.sold >= threshold).map(row => row.key));
}
