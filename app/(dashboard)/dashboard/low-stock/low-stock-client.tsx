"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Building2,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  Filter,
  MoreHorizontal,
  PackageOpen,
  Search,
  Settings2,
  ShoppingCart,
  Truck,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

export type LowStockRow = {
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  imageUrl: string | null;
  branchId: string;
  branchName: string;
  currentStock: number;
  reorderLevel: number;
  suggestedReorder: number;
  unitCost: number;
  estimatedValue: number;
  supplierId: string | null;
  supplierName: string | null;
  lastRestockedAt: string | null;
  status: "low_stock" | "critical" | "out_of_stock";
};

export type LowStockActivity = {
  id: string;
  productName: string;
  sku: string | null;
  quantityDelta: number;
  stockAfter: number;
  reason: string;
  adjustmentType: string;
  createdAt: string;
};

type Option = { id: string; name: string };

type Props = {
  rows: LowStockRow[];
  branches: Option[];
  suppliers: Option[];
  activities: LowStockActivity[];
  loadError: string | null;
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

const date = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function uniqueProductCount(rows: LowStockRow[]) {
  return new Set(rows.map((row) => row.productId)).size;
}

function statusLabel(status: LowStockRow["status"]) {
  if (status === "out_of_stock") return "Out of Stock";
  if (status === "critical") return "Critical";
  return "Low Stock";
}

function statusClass(status: LowStockRow["status"]) {
  if (status === "out_of_stock") return "bg-red-100 text-red-700";
  if (status === "critical") return "bg-rose-50 text-rose-700";
  return "bg-amber-50 text-amber-700";
}

export default function LowStockClient({
  rows,
  branches,
  suppliers,
  activities,
  loadError,
}: Props) {
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState("all");
  const [supplier, setSupplier] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (
        term &&
        ![row.productName, row.sku, row.supplierName]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term))
      ) {
        return false;
      }
      if (branch !== "all" && row.branchId !== branch) return false;
      if (supplier !== "all" && (row.supplierId ?? "unassigned") !== supplier) return false;
      if (status !== "all" && row.status !== status) return false;
      return true;
    });
  }, [rows, query, branch, supplier, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const summary = useMemo(() => {
    const outRows = rows.filter((row) => row.status === "out_of_stock");
    const suppliersAffected = new Set(rows.map((row) => row.supplierId).filter(Boolean)).size;
    return {
      low: uniqueProductCount(rows),
      out: uniqueProductCount(outRows),
      reorderQty: rows.reduce((sum, row) => sum + row.suggestedReorder, 0),
      reorderValue: rows.reduce((sum, row) => sum + row.estimatedValue, 0),
      suppliersAffected,
    };
  }, [rows]);

  const supplierSummary = useMemo(() => {
    const map = new Map<string, { id: string; name: string; products: Set<string> }>();
    for (const row of rows) {
      if (!row.supplierId || !row.supplierName) continue;
      const entry = map.get(row.supplierId) ?? {
        id: row.supplierId,
        name: row.supplierName,
        products: new Set<string>(),
      };
      entry.products.add(row.productId);
      map.set(row.supplierId, entry);
    }
    return Array.from(map.values())
      .map((entry) => ({ id: entry.id, name: entry.name, count: entry.products.size }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 5);
  }, [rows]);

  function resetPage() {
    setPage(1);
    setSelected(new Set());
  }

  function toggleRow(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage() {
    setSelected((current) => {
      const next = new Set(current);
      const pageIds = pageRows.map((row) => row.id);
      const allSelected = pageIds.length > 0 && pageIds.every((id) => next.has(id));
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  return (
    <main className="min-w-0 space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Low Stock</h1>
          <p className="mt-1 text-sm text-slate-500">
            Products that need to be restocked, reordered, or reviewed in this branch.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard/products"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
          >
            <Settings2 size={17} />
            Adjust thresholds
          </Link>
          <Link
            href="/dashboard/purchase-orders/new"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <FilePlus2 size={17} />
            Create Purchase Order
          </Link>
        </div>
      </header>

      {loadError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Some supporting inventory data could not be loaded: {loadError}. The available low-stock data is still shown below.
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<AlertTriangle size={23} />}
          iconClass="bg-amber-50 text-amber-600"
          title="Low-stock products"
          value={summary.low.toLocaleString()}
          note="Need review"
        />
        <MetricCard
          icon={<PackageOpen size={23} />}
          iconClass="bg-rose-50 text-rose-600"
          title="Out of stock"
          value={summary.out.toLocaleString()}
          note="Unavailable now"
        />
        <MetricCard
          icon={<ShoppingCart size={23} />}
          iconClass="bg-blue-50 text-blue-600"
          title="Suggested reorder value"
          value={money.format(summary.reorderValue)}
          note={`${summary.reorderQty.toLocaleString()} units suggested`}
        />
        <MetricCard
          icon={<Building2 size={23} />}
          iconClass="bg-violet-50 text-violet-600"
          title="Suppliers affected"
          value={summary.suppliersAffected.toLocaleString()}
          note="From PO history"
        />
      </section>

      <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[1.7fr_repeat(3,minmax(130px,1fr))]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    resetPage();
                  }}
                  placeholder="Search product, SKU, supplier..."
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <FilterSelect
                value={branch}
                onChange={(value) => {
                  setBranch(value);
                  resetPage();
                }}
                options={[{ value: "all", label: "All branches" }, ...branches.map((item) => ({ value: item.id, label: item.name }))]}
              />
              <FilterSelect
                value={supplier}
                onChange={(value) => {
                  setSupplier(value);
                  resetPage();
                }}
                options={[
                  { value: "all", label: "All suppliers" },
                  ...suppliers.map((item) => ({ value: item.id, label: item.name })),
                  { value: "unassigned", label: "No supplier" },
                ]}
              />
              <FilterSelect
                value={status}
                onChange={(value) => {
                  setStatus(value);
                  resetPage();
                }}
                options={[
                  { value: "all", label: "All statuses" },
                  { value: "low_stock", label: "Low Stock" },
                  { value: "critical", label: "Critical" },
                  { value: "out_of_stock", label: "Out of Stock" },
                ]}
              />
            </div>
            <div className="mt-2 flex items-center justify-end gap-2 text-xs text-slate-500">
              <Filter size={14} />
              {filtered.length} matching stock rows
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
              <div>
                <h2 className="font-bold text-slate-900">Products ({filtered.length})</h2>
                {selected.size > 0 && (
                  <p className="mt-0.5 text-xs text-blue-600">{selected.size} selected</p>
                )}
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <PackageOpen className="mx-auto text-slate-300" size={42} />
                <p className="mt-3 font-semibold text-slate-700">No low-stock items match these filters</p>
                <p className="mt-1 text-sm text-slate-500">Change a filter or review product reorder thresholds.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1020px] text-sm">
                  <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-10 px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label="Select visible products"
                          checked={pageRows.length > 0 && pageRows.every((row) => selected.has(row.id))}
                          onChange={togglePage}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                      </th>
                      <th className="px-2 py-3">Product</th>
                      <th className="px-2 py-3">SKU</th>
                      <th className="px-2 py-3">Branch</th>
                      <th className="px-2 py-3 text-right">Current Stock</th>
                      <th className="px-2 py-3 text-right">Reorder Level</th>
                      <th className="px-2 py-3 text-right">Suggested Reorder</th>
                      <th className="px-2 py-3">Supplier</th>
                      <th className="px-2 py-3">Last Restocked</th>
                      <th className="px-2 py-3">Status</th>
                      <th className="w-12 px-2 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pageRows.map((row) => (
                      <tr key={row.id} className="transition hover:bg-slate-50/70">
                        <td className="px-4 py-3 align-middle">
                          <input
                            type="checkbox"
                            checked={selected.has(row.id)}
                            onChange={() => toggleRow(row.id)}
                            aria-label={`Select ${row.productName}`}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                        </td>
                        <td className="px-2 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                              {row.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={row.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                              ) : (
                                <PackageOpen className="m-2 text-slate-400" size={18} />
                              )}
                            </div>
                            <Link href={`/dashboard/products/${row.productId}/edit`} className="max-w-[190px] truncate font-semibold text-slate-900 hover:text-blue-600">
                              {row.productName}
                            </Link>
                          </div>
                        </td>
                        <td className="px-2 py-3 text-slate-500">{row.sku || "—"}</td>
                        <td className="px-2 py-3 text-slate-600">{row.branchName}</td>
                        <td className={`px-2 py-3 text-right font-bold ${row.currentStock <= 0 ? "text-red-600" : "text-rose-600"}`}>
                          {row.currentStock}
                        </td>
                        <td className="px-2 py-3 text-right text-slate-600">{row.reorderLevel}</td>
                        <td className="px-2 py-3 text-right font-semibold text-slate-800">{row.suggestedReorder}</td>
                        <td className="px-2 py-3 text-slate-600">{row.supplierName || "Unassigned"}</td>
                        <td className="px-2 py-3 text-slate-500">
                          {row.lastRestockedAt ? date.format(new Date(row.lastRestockedAt)) : "—"}
                        </td>
                        <td className="px-2 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(row.status)}`}>
                            {statusLabel(row.status)}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-center">
                          <Link
                            href={`/dashboard/products/${row.productId}/edit`}
                            aria-label={`Edit ${row.productName}`}
                            className="inline-flex rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                          >
                            <MoreHorizontal size={18} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-slate-500">
                Showing {filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} stock rows
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={currentPage <= 1}
                  className="rounded-lg border border-slate-200 p-2 text-slate-500 disabled:opacity-40"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-blue-600 px-2 font-semibold text-white">{currentPage}</span>
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  disabled={currentPage >= totalPages}
                  className="rounded-lg border border-slate-200 p-2 text-slate-500 disabled:opacity-40"
                >
                  <ChevronRight size={16} />
                </button>
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-600"
                >
                  <option value={10}>10 / page</option>
                  <option value={20}>20 / page</option>
                  <option value={50}>50 / page</option>
                </select>
              </div>
            </div>
          </section>

        </div>

        <aside className="space-y-4">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-4">
              <div className="rounded-lg bg-blue-50 p-2 text-blue-600"><PackageOpen size={18} /></div>
              <h2 className="font-bold text-slate-900">Restock Summary</h2>
            </div>
            <dl className="divide-y divide-slate-100 px-4">
              <SummaryLine label="Total products" value={summary.low.toLocaleString()} />
              <SummaryLine label="Out of stock" value={summary.out.toLocaleString()} />
              <SummaryLine label="Total suggested quantity" value={summary.reorderQty.toLocaleString()} />
              <SummaryLine label="Estimated reorder value" value={money.format(summary.reorderValue)} strong />
            </dl>
            <div className="p-4">
              <Link href="/dashboard/purchase-orders/new" className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700">
                <FilePlus2 size={17} />
                Generate PO
              </Link>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold text-slate-900">Top suppliers to reorder</h2>
              <Link href="/dashboard/suppliers" className="text-xs font-semibold text-blue-600 hover:text-blue-700">View all</Link>
            </div>
            <div className="mt-3 space-y-2">
              {supplierSummary.length ? supplierSummary.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-xs font-bold text-blue-600">
                      {item.name.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="truncate text-sm font-semibold text-slate-700">{item.name}</span>
                  </div>
                  <span className="text-xs text-slate-500">{item.count} {item.count === 1 ? "item" : "items"}</span>
                </div>
              )) : (
                <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500">No supplier history is available yet.</p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold text-slate-900">Recent stock activity</h2>
              <Link href="/dashboard/inventory/adjustments" className="text-xs font-semibold text-blue-600 hover:text-blue-700">View all</Link>
            </div>
            <div className="mt-3 divide-y divide-slate-100">
              {activities.length ? activities.slice(0, 6).map((activity) => {
                const positive = activity.quantityDelta > 0;
                return (
                  <div key={activity.id} className="flex gap-3 py-3">
                    <div className={`mt-0.5 ${positive ? "text-emerald-600" : "text-rose-600"}`}>
                      {positive ? <ArrowUp size={17} /> : <ArrowDown size={17} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">{activity.reason || "Stock adjustment"}</p>
                          <p className="truncate text-xs text-slate-500">{activity.productName}{activity.sku ? ` (${activity.sku})` : ""}</p>
                        </div>
                        <span className={`shrink-0 text-sm font-bold ${positive ? "text-emerald-600" : "text-rose-600"}`}>
                          {positive ? "+" : ""}{activity.quantityDelta}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">{date.format(new Date(activity.createdAt))}</p>
                    </div>
                  </div>
                );
              }) : (
                <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500">No recent stock adjustments.</p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

function MetricCard({
  icon,
  iconClass,
  title,
  value,
  note,
}: {
  icon: ReactNode;
  iconClass: string;
  title: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-4">
        <div className={`rounded-xl p-3 ${iconClass}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-sm text-slate-500">{title}</p>
          <p className="mt-1 truncate text-2xl font-bold tracking-tight text-slate-950">{value}</p>
          <p className="mt-0.5 text-xs text-slate-400">{note}</p>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

function SummaryLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className={strong ? "font-bold text-slate-950" : "font-semibold text-slate-800"}>{value}</dd>
    </div>
  );
}
