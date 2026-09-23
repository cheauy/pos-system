import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { requirePermission } from "@/lib/auth/require-permission";
import { businessHasPermission } from "@/lib/auth/effective-permissions";
import { loadWorkspace } from "./order-workspace-data";
import { parseFilters } from "./order-workspace-types";
import OrdersWorkspace from "./orders-workspace";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const business = await requirePermission("orders.view");
  const filters = parseFilters(await searchParams);
  let workspace;
  try { workspace = await loadWorkspace(business.id, filters); }
  catch (error) {
    return <section className="rounded-xl border border-amber-200 bg-white p-6 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
      <h1 className="text-2xl font-bold">Orders</h1>
      <div role="alert" className="mt-5 flex items-start gap-3 text-sm text-amber-700 dark:text-amber-300"><AlertCircle size={20} className="shrink-0" /><p>{error instanceof Error ? error.message : "Orders could not be loaded."}</p></div>
      <Link href="/dashboard/orders" className="mt-5 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Try again</Link>
    </section>;
  }
  const [edit, cancel, refund, create] = await Promise.all([
    businessHasPermission(business,"orders.update"),
    businessHasPermission(business,"orders.cancel"),
    businessHasPermission(business,"orders.return"),
    businessHasPermission(business,"pos.access"),
  ]);
  return <OrdersWorkspace key={business.id} businessId={business.id} businessName={business.name} data={workspace} filters={filters} permissions={{
    edit, cancel, delete: cancel, refund, create,
  }} />;
}
