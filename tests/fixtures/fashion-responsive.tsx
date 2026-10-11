// Real web components with isolated actions; never writes products or inventory.
import { createRoot } from "react-dom/client";
import AddProductModal from "../../app/(dashboard)/dashboard/products/add-product-modal";
import AddClothingStyleModal from "../../app/(dashboard)/dashboard/products/add-clothing-style-modal";
import LanguageProvider from "../../components/providers/language-provider";

const controls = { calls: [] as FormData[], refreshes: 0, hold: false, message: "", release: () => {}, toasts: [] as string[] };
declare global { interface Window { fashionFixture: typeof controls; } }
window.fashionFixture = controls;
export function useRouter() { return { refresh() { controls.refreshes++; }, push() {} }; }
export const toast = {
  success(message: string) { controls.toasts.push(message); },
  error(message: string) { controls.toasts.push(message); },
  info(message: string) { controls.toasts.push(message); },
};
export async function createVariantProduct(_previous: unknown, data: FormData) {
  controls.calls.push(data);
  if (controls.hold) await new Promise<void>(resolve => { controls.release = resolve; });
  return { success: !controls.message, message: controls.message || "Fixture product created." };
}

const query = new URLSearchParams(location.search);
const khmer = query.get("lang") === "km";
const businessType = query.get("mode") || "fashion";
const categories = [{ id: "fixture-category", name: khmer ? "ប្រភេទសម្លៀកបំពាក់សម្រាប់ការធ្វើតេស្តឈ្មោះវែង" : "Fixture Apparel" }];
const branches = [
  { id: "fixture-main", name: khmer ? "សាខាធំសម្រាប់ការធ្វើតេស្តនៅទីក្រុងភ្នំពេញ" : "Fixture Main Branch" },
  { id: "fixture-other", name: "Fixture Other Branch" },
];
createRoot(document.getElementById("root")!).render(
  <LanguageProvider initialLanguage={khmer ? "km" : "en"}>
    <div className="workspace-theme min-h-screen bg-slate-50 p-4" style={{ "--app-accent": "#a21caf" } as React.CSSProperties}>
      <div className="workspace-content mx-auto max-w-[1680px]">
        {query.get("legacy") ? <AddClothingStyleModal categories={categories} branches={branches} businessType={businessType}/> : <AddProductModal categories={categories} branches={branches} businessType={businessType} productMode="variant"/>}
      </div>
    </div>
  </LanguageProvider>,
);
