import { getBranchContext } from "@/lib/branches/context";
import VisitedProductViews from "./visited-product-views";
import { requireAnyPermission } from "@/lib/auth/require-permission";
import { businessHasPermission, getEffectivePermissions } from "@/lib/auth/effective-permissions";

export default async function ProductsPage({ searchParams }: {
  searchParams: Promise<{ view?: string }>;
}) {
  const branchRequest = getBranchContext();
  // Preserve the permission redirect if the independent branch lookup also fails.
  void branchRequest.catch(() => {});
  const business = await requireAnyPermission(["products.view", "inventory.view"]);
  const context = await branchRequest;
  const [params, canViewProducts, canViewStock, permissions] = await Promise.all([
    searchParams,
    businessHasPermission(business, "products.view"),
    businessHasPermission(business, "inventory.view"),
    getEffectivePermissions(business.id, business.role),
  ]);
  const stock = canViewStock && (params.view === "stock" || !canViewProducts);
  const canAdjustStock = await businessHasPermission(business, "products.stock_adjust");
  // Load only the selected view. Catalog navigation must not query sales analytics.
  const View = stock
    ? (await import("../inventory/inventory-view")).default
    : (await import("./products-view")).default;
  return <VisitedProductViews key={JSON.stringify([business.id, context.userId, context.branchId, permissions])}
    view={stock ? "stock" : "products"} canViewProducts={canViewProducts} canViewStock={canViewStock} canAdjustStock={canAdjustStock}>
    <View />
  </VisitedProductViews>;
}
