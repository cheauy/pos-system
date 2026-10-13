// Real settings page and catalog; every server action and service is replaced locally.
import React, { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import Page from "../../app/(dashboard)/dashboard/settings/business/page";
import LanguageProvider from "../../components/providers/language-provider";
import { defaultOpeningHours } from "../../lib/storefront/profile";

const query = new URLSearchParams(location.search);
const khmer = query.get("lang") === "km";
const name = khmer ? "ហាងសម្លៀកបំពាក់សម្រាប់ការធ្វើតេស្តឈ្មោះវែងនៅទីក្រុងភ្នំពេញ" : "Fixture Clothing";
const controls = { calls: [] as unknown[], loads: 0, fail: false, hold: false, release: () => {} };
declare global { interface Window { settingsFixture: typeof controls; } }
window.settingsFixture = controls;
for (const key of ["pushState", "replaceState"] as const) {
  const original = history[key].bind(history);
  history[key] = (data: unknown, unused: string, url?: string | URL | null) => { original(data, unused, url); dispatchEvent(new Event("fixture-navigation")); };
}
export function useSearchParams() {
  const search = useSyncExternalStore(callback => { addEventListener("fixture-navigation", callback); return () => removeEventListener("fixture-navigation", callback); }, () => location.search);
  return new URLSearchParams(search);
}
export function useRouter() { return { refresh() {}, push() {} }; }
export default function Link(props: React.AnchorHTMLAttributes<HTMLAnchorElement>) { return <a {...props} />; }
export async function requireAnyPermission() { return { id: "fixture-business", name, slug: "fixture", role: "owner", productMode: "variant" }; }
export async function businessHasPermission(_: unknown, permission: string) { return !query.has("readonly") || permission.endsWith(".view"); }
export function getRootDomain() { return "example.test"; }
export function getSubdomainUrl() { return location.origin + "/public-fixture"; }
export function isLocalRootDomain() { return false; }
export function isSubscriptionPaymentExpired() { return false; }
export function normalizeTenantSlug(value: string) { return value; }
export async function getBusinessChangeEntitlements() { return { modeFreeRemaining: 1, modeCredits: 2, urlFreeRemaining: 1, urlCredits: 3 }; }
const settings = { business_id: "fixture-business", business_type: "fashion", display_name: name, updated_at: "2026-10-11T00:00:00Z", description: name, logo_url: "/shirt.svg", banner_url: null, phone: "", address: "", primary_color: "#a21caf", currency: "USD", is_published: true, accept_online_orders: true, allow_pickup: true, allow_delivery: true, allow_dine_in: false, accept_cod: true, accept_khqr: false, khqr_image_url: null, khqr_account_name: "", khqr_instructions: "", social_links: { profile: { openingHours: defaultOpeningHours() } } };
export async function getStorefrontSettings() { return settings; }
export const supabaseAdmin = { from(table: string) {
  let count = false;
  const result = { select(_: string, options?: { head?: boolean }) { count = Boolean(options?.head); return result; }, eq() { return result; }, in() { return result; }, order() { return result; }, limit() { return result; }, maybeSingle() { return result; }, then(resolve: (value: unknown) => void) { resolve({ error: null, count: table === "business_locations" ? 2 : 3, data: count ? null : table === "business_members" ? [{ user_id: "fixture-owner", role: "owner" }] : table === "profiles" ? [{ id: "fixture-owner", full_name: name }] : [] }); } };
  return result;
} };
const categories = [{ id: "fashion", name: khmer ? name : "Clothing", is_online: true }, { id: "hidden", name: "Hidden category", is_online: false }];
let products = query.has("empty") ? [] : Array.from({ length: 12 }, (_, index) => ({ id: "variant-" + index, name, sku: "FIX-" + index, size: ["S", "M", "L", "XL"][index % 4], color: "Black", image_url: "/shirt.svg", variant_image_url: null, selling_price: 18 + index, stock_quantity: index, is_online: true, category_id: index === 0 ? "hidden" : "fashion" }));
let featuredIds = ["variant-0"];
export async function loadOnlineCatalog() { controls.loads++; if (query.has("slow-load")) await new Promise(resolve => setTimeout(resolve, 800)); if (query.has("load-error")) throw new Error("Fixture load failed"); return { success: true, products: [...products], categories: [...categories], featuredIds: [...featuredIds] }; }
async function result(call: unknown) { controls.calls.push(call); if (controls.hold) await new Promise<void>(resolve => { controls.release = resolve; }); return { success: !controls.fail, message: controls.fail ? "Fixture save failed" : "Saved" }; }
export async function updateCatalogProducts(ids: string[], field: string, enabled: boolean) {
  const response = await result({ ids, field, enabled });
  if (response.success) { if (field === "visibility") products = products.map(p => ids.includes(p.id) ? { ...p, is_online: enabled } : p); else featuredIds = enabled ? [...new Set([...featuredIds, ...ids])] : featuredIds.filter(id => !ids.includes(id)); }
  return response;
}
export async function setCatalogVisibility(_: string, id: string, enabled: boolean) { const response = await result({ id, enabled }); if (response.success) categories.find(c => c.id === id)!.is_online = enabled; return response; }
export async function saveOnlineCatalogProduct() { return result("edit"); }
export async function saveBusinessInfo(data: FormData) { return { ...await result("business-info"), snapshot: String(data.get("expectedInfo")) }; }
export async function updateStorefrontSettings() { return result("storefront"); }
export async function updateOnlinePaymentSettings() { return result("payment"); }
export async function buyBusinessCredit() { throw new Error("Fixture credit purchases disabled"); }
export async function submitBusinessDetails() { throw new Error("Fixture business mode changes disabled"); }
export async function checkStoreAddressAvailability() { return { available: false }; }
export async function createBusinessTable() { throw new Error("Disabled"); }
export async function deleteBusinessTable() { throw new Error("Disabled"); }
export async function regenerateBusinessTableToken() { throw new Error("Disabled"); }

void Page({ searchParams: Promise.resolve({}) }).then(content => createRoot(document.getElementById("root")!).render(
  <LanguageProvider initialLanguage={khmer ? "km" : "en"}><div className="workspace-theme p-4" style={{ "--app-accent": "#a21caf" } as React.CSSProperties}>{content}</div></LanguageProvider>,
));
