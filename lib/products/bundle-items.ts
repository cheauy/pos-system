export const MAX_BUNDLE_ITEMS = 8;

export function validateBundleItems(items: unknown): string | null {
  if (!Array.isArray(items) || items.length < 2 || items.length > MAX_BUNDLE_ITEMS) return "Choose 2–8 different products.";
  const ids = new Set<string>();
  for (const item of items) {
    if (!item || typeof item.productId !== "string" || !item.productId.trim()) return "Choose a product for each item.";
    if (ids.has(item.productId)) return "Choose each product once; use quantity for more of the same item.";
    ids.add(item.productId);
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) return "Item quantities must be whole numbers from 1 to 999.";
    if (item.optionIds !== undefined && (!Array.isArray(item.optionIds) || item.optionIds.some((id: unknown) => typeof id !== "string"))) return "Choose valid product options.";
  }
  return null;
}
