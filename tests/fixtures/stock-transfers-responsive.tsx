import { createRoot } from "react-dom/client";
import StockTransfersClient, { type TransferProduct, type TransferRow } from "../../app/(dashboard)/dashboard/stock-transfers/stock-transfers-client";
import LanguageProvider from "../../components/providers/language-provider";
import FixedWorkspaceHeader from "../../components/ui/fixed-workspace-header";

const query = new URLSearchParams(location.search);
const locations = [
  { id: "central", name: query.has("long") ? "សាខាកណ្ដាល ភ្នំពេញ TENH Central showroom and warehouse" : "TENH Central" },
  { id: "north", name: query.has("long") ? "សាខាខាងជើង សៀមរាប TENH Northern regional showroom" : "TENH North" },
  { id: "east", name: "TENH East" },
];
const products: TransferProduct[] = Array.from({ length: 18 }, (_, i) => ({
  id: `product-${i}`, name: i < 2 ? "Linen shirt" : `Cotton shirt ${i + 1}`, sku: `TEST-${i}`, size: i % 2 ? "L" : "M",
  color: i % 2 ? "White" : "Black", imageUrl: null, categoryId: null, categoryName: "Shirts", businessStock: 50,
}));
const locationStock = products.flatMap((p, i) => [
  { locationId: "central", productId: p.id, quantity: i === 17 ? 0 : 10 + i },
  { locationId: "north", productId: p.id, quantity: i < 3 ? 4 : 0 },
]);
const statuses = ["draft", "sent", "in_transit", "partially_received", "received", "cancelled"];
const transfers: TransferRow[] = query.has("empty") ? [] : Array.from({ length: 12 }, (_, i) => ({
  id: `transfer-${i}`, transferNumber: `TR-TEST-${String(i + 1).padStart(3, "0")}`, status: statuses[i % 6],
  sourceLocationId: i % 2 ? "north" : "central", destinationLocationId: "east", note: `Fixture reference ${i}`,
  createdAt: new Date(Date.UTC(2026, 9, 10 - i, 8)).toISOString(), createdBy: "Fixture cashier",
  items: [{ productId: "product-0", quantity: 2 }, { productId: "product-1", quantity: 3 }],
}));
const controls = { calls: [] as Array<{ action: string; payload: Record<string, string> }>, hold: false, fail: false, release: null as null | (() => void) };
Object.assign(window, { transferFixture: controls });
async function draft(action: string, data: FormData) {
  controls.calls.push({ action, payload: Object.fromEntries(Array.from(data.entries()).map(([key, value]) => [key, String(value)])) });
  if (controls.hold) await new Promise<void>(resolve => { controls.release = resolve; });
  if (controls.fail) { controls.fail = false; throw new Error("Fixture draft rejected"); }
}
export const createTransfer = (data: FormData) => draft("create", data);
export const updateTransferDraft = (data: FormData) => draft("update", data);
export const cancelDraftTransfer = () => { throw new Error("Lifecycle operations are blocked in this fixture"); };
export const sendTransfer = cancelDraftTransfer;
export const receiveTransfer = cancelDraftTransfer;
document.documentElement.classList.toggle("dark", query.get("theme") === "dark");
createRoot(document.getElementById("root")!).render(
  <LanguageProvider initialLanguage={query.get("lang") === "km" ? "km" : "en"}>
    <div data-workspace-shell className="workspace-theme min-h-screen bg-slate-50">
      <FixedWorkspaceHeader><header className="workspace-header flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3"><button aria-label="Open menu" className="h-11 w-11 rounded-lg border border-slate-200">☰</button><div><small>TENH CLOTHING</small><p className="font-semibold">Stock Transfers</p></div></div>
        <div className="workspace-header-actions"><button className="h-11 rounded-lg border border-slate-200 px-3">Main Branch⌄</button></div>
      </header></FixedWorkspaceHeader>
      <div className="workspace-content mx-auto max-w-[1680px] p-3 sm:p-6" data-mobile-chrome="compact">
        <StockTransfersClient locations={locations} products={products} locationStock={locationStock} transfers={transfers} />
      </div>
    </div>
  </LanguageProvider>,
);
