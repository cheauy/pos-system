export const MAX_STOCK_ADJUSTMENT_ITEMS = 500;
export const STOCK_SELECTION_PREFIX = "tenh-stock-selection:";
export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export type StockMode = "increase" | "decrease" | "set";
export type StockAdjustmentItem = { productId: string; mode: StockMode; quantity: number; expectedQuantity: number };
export function stockAfter(before: number, mode: StockMode, quantity: number) {
  return mode === "set" ? quantity : mode === "increase" ? before + quantity : before - quantity;
}
export function parseStockAdjustmentItems(raw: string): StockAdjustmentItem[] {
  if (raw.length > 160_000) throw new Error("Too many stock adjustment details.");
  let items: unknown;
  try { items = JSON.parse(raw); } catch { throw new Error("Reload the stock adjustment form."); }
  if (!Array.isArray(items) || !items.length || items.length > MAX_STOCK_ADJUSTMENT_ITEMS) throw new Error(`Select 1–${MAX_STOCK_ADJUSTMENT_ITEMS} products or variants.`);
  const seen = new Set<string>();
  return items.map((item): StockAdjustmentItem => {
    if (!item || !isUuid(item.productId) || seen.has(item.productId.toLowerCase())) throw new Error("Select each valid product or variant once.");
    seen.add(item.productId.toLowerCase());
    if (!["increase", "decrease", "set"].includes(item.mode)) throw new Error("Choose a valid adjustment type for every row.");
    if (typeof item.quantity !== "number" || !Number.isSafeInteger(item.quantity) || item.quantity > 2147483647 || item.quantity < (item.mode === "set" ? 0 : 1)
      || typeof item.expectedQuantity !== "number" || !Number.isSafeInteger(item.expectedQuantity) || item.expectedQuantity < 0 || item.expectedQuantity > 2147483647) throw new Error("Enter valid whole-number quantities for every selected row.");
    // Do not validate against a stale preview here: the database checks live stock.
    return { productId: item.productId.toLowerCase(), mode: item.mode, quantity: item.quantity, expectedQuantity: item.expectedQuantity };
  }).sort((a, b) => a.productId.localeCompare(b.productId));
}
/** Small selections use a link; large selections use same-tab storage to avoid URL limits. */
export function stockAdjustmentLink(ids: string[], branchId: string, storage?: Pick<Storage, "setItem">): string {
  const unique = Array.from(new Set(ids));
  if (!isUuid(branchId) || !unique.length || unique.length > MAX_STOCK_ADJUSTMENT_ITEMS || unique.some(id => !isUuid(id))) throw new Error(`Select 1–${MAX_STOCK_ADJUSTMENT_ITEMS} saved variants.`);
  const query = new URLSearchParams({ branch: branchId });
  if (unique.length <= 30) query.set("products", unique.join(","));
  else {
    if (!storage) throw new Error("Allow browser session storage to open a large stock selection.");
    const token = crypto.randomUUID();
    storage.setItem(STOCK_SELECTION_PREFIX + token, JSON.stringify({ branchId, productIds: unique, createdAt: Date.now() }));
    query.set("selection", token);
  }
  return `/dashboard/inventory/adjustments?${query.toString()}`;
}
export function readStockSelection(raw: string, branchId: string, now = Date.now()): string[] {
  const value = JSON.parse(raw);
  if (!value || value.branchId !== branchId || !Array.isArray(value.productIds) || !value.productIds.length || value.productIds.length > MAX_STOCK_ADJUSTMENT_ITEMS
    || value.productIds.some((id: unknown) => !isUuid(id)) || !Number.isFinite(value.createdAt) || now - value.createdAt > 3_600_000 || value.createdAt > now + 60_000) throw new Error("This stock selection expired or belongs to another branch. Select the items again.");
  return Array.from(new Set<string>(value.productIds));
}
