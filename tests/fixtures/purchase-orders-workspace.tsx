// Real web components with local-only services. Never connects to a business or database.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import LanguageProvider from "../../components/providers/language-provider";
import PurchaseOrdersClient from "../../app/(dashboard)/dashboard/purchase-orders/purchase-orders-client";
import PurchaseOrderForm from "../../app/(dashboard)/dashboard/purchase-orders/new/purchase-order-form";
import type { PurchaseFilters, PurchaseWorkspace } from "../../app/(dashboard)/dashboard/purchase-orders/list-actions";

const supplier = { id: "fixture-supplier", name: "Fixture Supplier", contact_person: "Sok", phone: "012345678", email: null, address: "Fixture street", notes: null, is_active: true };
const products = [
  { id: "tee", name: "QA Tee", sku: "QAT-BLK-M", barcode: "TEST-TEE", cost_price: 6, size: "M", color: "Black", image_url: null },
  { id: "shirt", name: "Linen Shirt", sku: "LIN-WHT-L", barcode: "TEST-SHIRT", cost_price: 8, size: "L", color: "White", image_url: null },
];
const orders = ["draft", "sent"].map((status, index) => ({
  id: "fixture-order-" + index, supplier_id: supplier.id, supplier_name: supplier.name, po_number: "TEST-PO-00" + index, reference_number: "Fixture reference", status: status as "draft" | "sent", order_date: "2026-10-10", expected_date: "2026-10-12", notes: "Fixture only", subtotal: 100, total: 100, created_by: "fixture", created_by_name: "Fixture user", created_at: "2026-10-10T01:00:00Z", item_count: 2, ordered_quantity: 15, received_quantity: 0, items: [],
}));
function workspace(rows = orders): PurchaseWorkspace {
  return { orders: rows, suppliers: [supplier], page: 1, total: rows.length, stats: { total: rows.length, draft: 1, sent: 1, partial: 0, completed: 0, outstanding: 200 } };
}
const controls = {
  calls: [] as Record<string, FormDataEntryValue>[], loads: [] as PurchaseFilters[], failNext: false, failLoad: false, hold: false, release: () => {}, choices: 0,
};
(window as any).purchaseFixture = controls;
export async function getPurchaseOrderChoices() { controls.choices++; return { suppliers: [supplier], products }; }
export async function loadPurchaseOrders(filters: PurchaseFilters) {
  controls.loads.push(filters);
  if (controls.hold) await new Promise<void>(resolve => { controls.release = resolve; });
  if (controls.failLoad) { controls.failLoad = false; throw Error("Fixture list failed"); }
  const rows = orders.filter(order => (!filters.search || [order.po_number, order.supplier_name, order.reference_number].some(value => value.includes(filters.search))) && (filters.statusFilter === "all" || order.status === filters.statusFilter) && (!filters.fromDate || order.order_date >= filters.fromDate) && (!filters.toDate || order.order_date <= filters.toDate));
  return workspace(filters.sortMode === "oldest" ? rows.toReversed() : rows);
}
export async function createPurchaseOrder(data: FormData) {
  controls.calls.push(Object.fromEntries(data));
  if (controls.hold) await new Promise<void>(resolve => { controls.release = resolve; });
  if (controls.failNext) { controls.failNext = false; throw Error("Fixture save failed. Retry."); }
  if (!data.get("supplierId") || !JSON.parse(String(data.get("items"))).length) throw Error("Fixture validation failed");
  return "fixture-created";
}
export async function setPurchaseOrderStatus() { throw Error("Workflow changes are outside this fixture"); }
export async function receivePurchaseOrder() { throw Error("Receiving is outside this fixture"); }
export function useRouter() { return { push() {}, refresh() {} }; }

function Fixture() {
  const params = new URLSearchParams(location.search);
  const [initial] = useState(() => workspace(params.get("state") === "empty" ? [] : orders));
  document.documentElement.style.setProperty("--app-accent", "#93430b");
  return <LanguageProvider initialLanguage={params.get("lang") === "km" ? "km" : "en"}>
    <div className="workspace-theme min-h-screen bg-slate-50">
      <div className="workspace-header flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4"><strong>TENH POS · Purchase Orders</strong><span>Main Branch</span></div>
      <div className="workspace-content mx-auto max-w-7xl p-4">
        {params.get("state") === "standalone" ? <main><PurchaseOrderForm suppliers={[supplier]} products={products} /></main> : <PurchaseOrdersClient workspace={initial} canCreate={params.get("permission") !== "view"} canUpdate={false} />}
      </div>
    </div>
  </LanguageProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
