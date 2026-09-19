import type { StorefrontCatalogProduct } from "./catalog-types";

export type CartItem = {
  key: string;
  productId: string;
  name: string;
  variantLabel: string | null;
  optionIds: string[];
  optionLabels: string[];
  unitPrice: number;
  quantity: number;
  maxStock: number;
  imageUrl: string | null;
};

/** Rebuild saved carts from the current public catalog, never saved prices or stock. */
export function restoreCart(saved: unknown, products: StorefrontCatalogProduct[]): CartItem[] {
  if (!Array.isArray(saved)) return [];
  const result = new Map<string, CartItem>();
  const usedStock = new Map<string, number>();
  for (const entry of saved) {
    if (!entry || typeof entry !== "object" || !Number.isInteger(entry.quantity) || entry.quantity <= 0) continue;
    const product = products.find(product => product.variants.some(variant => variant.id === entry.productId));
    const variant = product?.variants.find(variant => variant.id === entry.productId);
    if (!product || !variant || variant.stockQuantity <= 0) continue;
    if (!Array.isArray(entry.optionIds) || !entry.optionIds.every((id: unknown) => typeof id === "string")) continue;
    const ids = [...new Set<string>(entry.optionIds)].sort();
    const options = product.optionGroups.flatMap(group => group.options).filter(option => ids.includes(option.id));
    if (options.length !== ids.length) continue;
    if (product.optionGroups.some(group => {
      const count = group.options.filter(option => ids.includes(option.id)).length;
      const minimum = Math.max(group.isRequired ? 1 : 0, group.minSelections);
      return count < minimum || (group.selectionType === "single" && count > 1) ||
        (group.maxSelections > 0 && count > group.maxSelections);
    })) continue;
    const key = `${variant.id}:${ids.join(",")}`;
    const existing = result.get(key);
    const quantity = Math.min(entry.quantity, 999 - (existing?.quantity ?? 0), variant.stockQuantity - (usedStock.get(variant.id) ?? 0));
    if (quantity <= 0) continue;
    result.set(key, {
      key, productId: variant.id, name: product.name,
      variantLabel: [variant.color, variant.size].filter(Boolean).join(" / ") || null,
      optionIds: ids, optionLabels: options.map(option => option.name),
      unitPrice: Math.max(0, variant.sellingPrice + options.reduce((sum, option) => sum + option.priceAdjustment, 0)),
      quantity: (existing?.quantity ?? 0) + quantity, maxStock: variant.stockQuantity,
      imageUrl: variant.imageUrl ?? product.imageUrl,
    });
    usedStock.set(variant.id, (usedStock.get(variant.id) ?? 0) + quantity);
  }
  return [...result.values()];
}
