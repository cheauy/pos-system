export type SkeletonKind = "table" | "form" | "analytics" | "pos" | "detail" | "cards" | "catalog" | "document";

export function routeSkeletonKind(path: string): SkeletonKind {
  if (/\/(receipt|shipping-label)(\/|$)/.test(path)) return "document";
  if (/^\/dashboard\/pos(\/|$)/.test(path)) return "pos";
  if (/^\/storefront\//.test(path)) return "catalog";
  if (/\/(new|edit|edit-subscription|correct)(\/|$)/.test(path)) return "form";
  if (/^\/(auth\/|login$|register(?:\/|$)|forgot-password$|reset-password$|get-started$|team-setup$)/.test(path)) return "form";
  if (path === "/dashboard" || path === "/super-admin" || /\/(reports|staff-report|health)(\/|$)/.test(path)) return "analytics";
  if (path === "/dashboard/settings") return "cards";
  if (path === "/dashboard/locations" || /^\/dashboard\/settings\/subscription(?:\/plans)?$/.test(path)) return "cards";
  if (path === "/dashboard/barcodes" || path === "/dashboard/shipping-labels") return "form";
  if (/^\/dashboard\/settings\//.test(path) && !/^\/dashboard\/settings\/users(\/|$)/.test(path)) return "form";
  if (/^\/dashboard\/(register|exports|businesses|online-store)(\/|$)/.test(path)) return "form";
  if (/^\/order\//.test(path) || /\/(orders|purchase-orders|purchases|returns|customers|businesses)\/[^/]+/.test(path)) return "detail";
  return "table";
}
