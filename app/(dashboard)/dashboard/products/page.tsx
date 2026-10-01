import Link from "next/link";
import { Boxes, Package, SlidersHorizontal } from "lucide-react";
import { requireAnyPermission } from "@/lib/auth/require-permission";
import { businessHasPermission } from "@/lib/auth/effective-permissions";

export default async function ProductsPage({ searchParams }: {
  searchParams: Promise<{ view?: string }>;
}) {
  const business = await requireAnyPermission(["products.view", "inventory.view"]);
  const [params, canViewProducts, canViewStock] = await Promise.all([
    searchParams,
    businessHasPermission(business, "products.view"),
    businessHasPermission(business, "inventory.view"),
  ]);
  const stock = canViewStock && (params.view === "stock" || !canViewProducts);
  const canAdjustStock = stock && await businessHasPermission(business, "products.stock_adjust");
  // Load only the selected view. Catalog navigation must not query sales analytics.
  const View = stock
    ? (await import("../inventory/inventory-view")).default
    : (await import("./products-view")).default;
  return <main className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-5">
    <header className="col-start-1 row-start-1">
      <h1 className="text-lg font-bold tracking-tight text-slate-950">Products &amp; Stock</h1>
      <p className="mt-1 text-sm text-slate-500">Manage your products, variants and branch stock in one place.</p>
    </header>
    {canAdjustStock && <Link href="/dashboard/inventory/adjustments" className="col-start-2 row-start-1 inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-800">
      <SlidersHorizontal size={17} /> Adjust Stock
    </Link>}
    <nav aria-label="Products and stock views" className="col-span-2 row-start-2 flex gap-1 border-b border-slate-200">
      {canViewProducts && <Link href="/dashboard/products" prefetch={false} aria-current={!stock ? "page" : undefined}
        className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${!stock ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
        <Package size={18} />Products
      </Link>}
      {canViewStock && <Link href="/dashboard/products?view=stock" prefetch={false} aria-current={stock ? "page" : undefined}
        className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${stock ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
        <Boxes size={18} />Stock
      </Link>}
    </nav>
    {stock ? <div className="col-span-2 min-w-0"><View /></div> : <View />}
  </main>;
}
