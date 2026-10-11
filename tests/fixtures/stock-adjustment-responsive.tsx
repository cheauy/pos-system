// Real web UI with isolated stock fixtures; no database or network mutations.
import { createRoot } from "react-dom/client";
import StockAdjustmentClient, { type AdjustmentProduct } from "../../app/(dashboard)/dashboard/inventory/adjustments/stock-adjustment-client";
import LanguageProvider from "../../components/providers/language-provider";
import { parseStockAdjustmentItems } from "../../lib/inventory/stock-adjustment";

const products: AdjustmentProduct[] = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Classic Cotton T-Shirt", sku: "TS-BLK-M", barcode: "100001", imageUrl: "/shirt.svg", color: "Black", size: "M", stockQuantity: 47, lowStockQuantity: 5, costPrice: 5, sellingPrice: 15, isActive: true, updatedAt: "2026-10-09T08:00:00Z", categoryName: "Clothing" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Linen Shirt", sku: "LN-WHT-L", barcode: "100002", imageUrl: "/shirt.svg", color: "White", size: "L", stockQuantity: 18, lowStockQuantity: 5, costPrice: 12, sellingPrice: 30, isActive: true, updatedAt: null, categoryName: "Clothing" },
  { id: "33333333-3333-4333-8333-333333333333", name: "Canvas Tote Bag with a deliberately long product name", sku: "BAG-NAT-ONE", barcode: null, imageUrl: null, color: "Natural", size: "One size", stockQuantity: 0, lowStockQuantity: 2, costPrice: 3, sellingPrice: 10, isActive: true, updatedAt: null, categoryName: "Accessories" },
];
const controls = {
  calls: [] as Record<string, string>[], refreshes: 0, hold: false, fail: false, uncertain: false,
  release: () => {},
};
declare global { interface Window { stockFixture: typeof controls; } }
window.stockFixture = controls;
export function useRouter() { return { refresh() { controls.refreshes++; } }; }
export function useBranchSwitchGuard() {}
export async function submitStockAdjustmentBatch(_previous: unknown, data: FormData) {
  const payload = Object.fromEntries(Array.from(data.entries()).map(([key, value]) => [key, String(value)]));
  parseStockAdjustmentItems(payload.items);
  controls.calls.push(payload);
  if (controls.hold) await new Promise<void>(resolve => { controls.release = resolve; });
  if (controls.uncertain) { controls.uncertain = false; throw new Error("Fixture interrupted response"); }
  const success = !controls.fail;
  controls.fail = false;
  return { success, message: success ? "Fixture batch saved" : "Fixture validation rejected", submittedAt: Date.now() };
}
export const submitStockAdjustment = submitStockAdjustmentBatch;
const query = new URLSearchParams(location.search);
if (query.get("selection") === "many") products.push(...Array.from({ length: 18 }, (_, i) => ({ ...products[i % 3], id: `00000000-0000-4000-8000-${String(100 + i).padStart(12, "0")}`, sku: `TEST-${i}`, name: `Fixture product ${i + 4}` })));
document.documentElement.classList.toggle("dark", query.get("theme") === "dark");
createRoot(document.getElementById("root")!).render(
  <LanguageProvider initialLanguage={query.get("lang") === "km" ? "km" : "en"}>
    <div className="workspace-theme min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="workspace-content mx-auto max-w-[1680px]">
        <StockAdjustmentClient products={products} recentAdjustments={products.slice(0, 2).map((p, i) => ({ id: `recent-${i}`, productId: p.id, productName: p.name, sku: p.sku, imageUrl: p.imageUrl, size: p.size, color: p.color, adjustmentType: "increase", quantityDelta: 3, stockBefore: p.stockQuantity - 3, stockAfter: p.stockQuantity, reason: "Manual stock intake", reference: "TEST-ONLY", createdAt: "2026-10-09T08:00:00Z" }))} branchName="TENH Central" branchId="44444444-4444-4444-8444-444444444444" initialProductIds={query.get("selection") === "none" ? [] : products.slice(0, query.get("selection") === "many" ? products.length : query.get("selection") === "single" ? 1 : 2).map(p => p.id)} recoveryKey="stock-responsive-fixture" />
      </div>
    </div>
  </LanguageProvider>,
);
