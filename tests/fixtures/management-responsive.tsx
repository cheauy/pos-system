// Real web components; server actions, navigation and printing are isolated.
import React from "react";
import { createRoot } from "react-dom/client";
import BundleItemsClient from "../../app/(dashboard)/dashboard/bundles/bundle-items-client";
import CategoriesClient from "../../app/(dashboard)/dashboard/categories/categories-client";
import BarcodeLabelsClient from "../../app/(dashboard)/dashboard/barcodes/barcode-labels-client";
import LanguageProvider from "../../components/providers/language-provider";

const controls = { calls: [] as { action: string; data: Record<string, FormDataEntryValue[]> }[], toasts: [] as string[], refreshes: 0 };
declare global { interface Window { managementFixture: typeof controls; } }
window.managementFixture = controls;
window.print = () => { throw new Error("Physical printing is forbidden in this fixture."); };
export const toast = { success(message: string) { controls.toasts.push(message); }, error(message: string) { controls.toasts.push(message); }, info(message: string) { controls.toasts.push(message); } };
export function Toaster() { return null; }
export function useRouter() { return { refresh() { controls.refreshes++; }, push() {} }; }
export async function preparePrint() { throw new Error("Printing preparation is isolated."); }
export async function createBundleProduct(_previous: unknown, data: FormData) { record("createBundle", data); return { success: false, message: "Fixture save rejected for inspection." }; }
export async function editBundleProduct(data: FormData) { record("editBundle", data); return { success: false, message: "Fixture save rejected for inspection." }; }
export async function manageBundle() { throw new Error("No bundle mutations allowed."); }
export async function packBundle() { throw new Error("No stock mutations allowed."); }
export async function repairCategoryIndexes() { throw new Error("No category repairs allowed."); }
export async function setCategoryOnline() { throw new Error("No category mutations allowed."); }
export async function deleteCategoryById() { throw new Error("No category mutations allowed."); }
export async function createCategory(data: FormData) { record("createCategory", data); return { ok: false, message: "Fixture save rejected for inspection." }; }
export async function updateCategory(data: FormData) { record("editCategory", data); return { ok: false, message: "Fixture save rejected for inspection." }; }
function record(action: string, data: FormData) {
  controls.calls.push({ action, data: Object.fromEntries([...new Set(data.keys())].map(key => [key, data.getAll(key)])) });
}

const query = new URLSearchParams(location.search);
const khmer = query.get("lang") === "km";
const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";
const categories = [{ id: "category-1", name: khmer ? "សម្លៀកបំពាក់បុរស" : "Fixture Clothing" }, { id: "category-2", name: "Fixture Accessories" }];
const branches = [{ id: "branch-1", name: khmer ? "សាខាធំ" : "Fixture Main Branch" }, { id: "branch-2", name: "Fixture Other Branch" }];
const products = Array.from({ length: 10 }, (_, index) => ({
  id: "product-" + index, name: index < 3 ? (khmer ? "អាវធំ" : "Fixture Jacket") : "Fixture Item " + index,
  sku: "SKU-" + index, barcode: "00000000000000" + index, size: index % 2 ? "XL" : "M", color: ["Grey", "White", "Red"][index % 3],
  cost_price: 3, selling_price: 18 + index, stock_quantity: 20, product_type: "variant", imageUrl: image,
  image_url: image, variant_image_url: image, categoryName: categories[index % 2].name, categoryId: categories[index % 2].id,
  category_id: categories[index % 2].id, businessStock: 20, is_active: true,
  groups: index === 0 ? [{ id: "group-1", name: "Fixture finish", selection_type: "single", is_required: true, min_selections: 1, max_selections: 1 }] : [],
  options: index === 0 ? [{ id: "option-1", group_id: "group-1", name: "Fixture standard", is_default: true, price_adjustment: 2 }] : [],
}));
const bundle = { id: "bundle-1", name: khmer ? "ឈុតសម្លៀកបំពាក់" : "Fixture Bundle", sku: "BUNDLE-FIXTURE", description: "Fixture description", categoryId: "category-1", imageUrl: image, imageUrls: [image], updatedAt: "2026-10-11", createdAt: "2026-10-11", online: true, pos: true, price: 37, cost: 6, active: true, packed: true, stock: query.has("locked") ? 2 : 0, capacity: 20,
  components: products.slice(0, 2).map(product => ({ id: product.id, name: product.name, sku: product.sku, imageUrl: image, quantity: 1, optionIds: product.options.map(option => option.id), options: product.color + " / " + product.size, available: 20 })) };
const categoryRecords = categories.map((category, index) => ({ ...category, description: "Fixture category description", isOnline: index === 0, index: index + 1, productCount: 5, createdAt: "2026-10-11", branchIds: index === 0 ? null : ["branch-1"] }));
const empty = query.has("empty");
const permissions = !query.has("readOnly");
const scope = query.get("scope") || "bundle";
createRoot(document.getElementById("root")!).render(
  <LanguageProvider initialLanguage={khmer ? "km" : "en"}>
    <div className="workspace-theme min-h-screen bg-white" style={{ "--app-accent": "#a21caf" } as React.CSSProperties}>
      <div className="workspace-header-slot"><header className="workspace-header flex h-[69px] items-center justify-between border-b border-slate-200 bg-white px-4"><span>Fixture TENH</span><span data-i18n-ignore="true">{branches[0].name}</span></header></div>
      <div className="workspace-content fixture-content mx-auto max-w-[1680px] p-4" data-mobile-chrome="compact">
        {scope === "bundle" ? <BundleItemsClient branchId="branch-1" branchName={branches[0].name} bundles={empty ? [] : [bundle]} products={products} categories={categories} canCreate={permissions} canPack={permissions} canEdit={permissions} canDelete={permissions} /> : scope === "categories" ? <CategoriesClient categories={empty ? [] : categoryRecords} branches={branches} totalProducts={10} loadError={null} /> : <BarcodeLabelsClient businessName="Fixture TENH" products={empty ? [] : products} categories={categories} settings={{ barcode_label_size: query.get("size") || "50x30", barcode_template: query.get("template") || "product" }} />}
      </div>
    </div>
  </LanguageProvider>,
);
