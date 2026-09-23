"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Boxes,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleX,
  Coins,
  Ellipsis,
  PackageSearch,
  RotateCcw,
  Search,
  Settings2,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  image_url: string | null;
  variant_image_url: string | null;
  category_id: string | null;
  stock_quantity: number;
  low_stock_quantity: number;
  cost_price: number;
  selling_price: number;
  size: string | null;
  color: string | null;
  is_active: boolean;
  updated_at: string | null;
  sold_30d: number;
};

type Category = { id: string; name: string };
type Location = { id: string; name: string; code: string };
type LocationStock = {
  location_id: string;
  product_id: string;
  quantity: number;
  low_stock_threshold: number;
};

type Props = {
  defaultBranchId?: string;
  products: Product[];
  categories: Category[];
  locations: Location[];
  locationStock: LocationStock[];
};

type Tab = "all" | "low" | "out" | "fast" | "slow" | "none";
type ColumnKey = "sku" | "category" | "stock" | "threshold" | "cost" | "value" | "status";
type ResolvedProduct = Product & {
  displayStock: number;
  displayThreshold: number;
  displayStatus: "in" | "low" | "out";
  categoryName: string;
};

const PAGE_SIZES = [10, 20, 50];

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function stockStatus(stock: number, threshold: number) {
  if (stock <= 0) return "out" as const;
  if (stock <= threshold) return "low" as const;
  return "in" as const;
}

function movementTab(product: Product): "fast" | "slow" | "none" {
  if (product.sold_30d <= 0) return "none";
  if (product.sold_30d >= 5) return "fast";
  return "slow";
}

export default function InventoryClient({ products, categories, locations, locationStock, defaultBranchId = "all" }: Props) {
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [locationId, setLocationId] = useState(defaultBranchId);
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>({
    sku: true,
    category: true,
    stock: true,
    threshold: true,
    cost: true,
    value: true,
    status: true,
  });

  const categoryName = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  const locationName = useMemo(
    () => new Map(locations.map((location) => [location.id, location.name])),
    [locations],
  );

  const branchStock = useMemo(() => {
    const map = new Map<string, LocationStock>();
    for (const row of locationStock) {
      map.set(`${row.location_id}:${row.product_id}`, row);
    }
    return map;
  }, [locationStock]);

  const resolvedProducts = useMemo<ResolvedProduct[]>(
    () =>
      products.map((product) => {
        const branch =
          locationId === "all"
            ? null
            : branchStock.get(`${locationId}:${product.id}`) ?? null;
        const stock = locationId === "all" ? Number(product.stock_quantity || 0) : Number(branch?.quantity || 0);
        const threshold = branch
          ? Number(branch.low_stock_threshold || 0)
          : Number(product.low_stock_quantity || 0);
        return {
          ...product,
          displayStock: stock,
          displayThreshold: threshold,
          displayStatus: stockStatus(stock, threshold),
          categoryName: product.category_id
            ? categoryName.get(product.category_id) ?? "Uncategorized"
            : "Uncategorized",
        };
      }),
    [products, locationId, branchStock, categoryName],
  );

  const selectedProduct = useMemo(
    () => resolvedProducts.find((product) => product.id === selectedProductId) ?? null,
    [resolvedProducts, selectedProductId],
  );

  const selectedBranchRows = useMemo(() => {
    if (!selectedProduct) return [];
    return locations.map((location) => {
      const row = branchStock.get(`${location.id}:${selectedProduct.id}`) ?? null;
      const quantity = row ? Number(row.quantity || 0) : 0;
      const threshold = row
        ? Number(row.low_stock_threshold || 0)
        : Number(selectedProduct.low_stock_quantity || 0);
      return {
        id: location.id,
        name: locationName.get(location.id) ?? location.name,
        code: location.code,
        quantity,
        threshold,
        status: stockStatus(quantity, threshold),
      };
    });
  }, [selectedProduct, locations, branchStock, locationName]);

  useEffect(() => {
    if (!selectedProductId) return;
    if (!resolvedProducts.some((product) => product.id === selectedProductId)) {
      setSelectedProductId(null);
    }
  }, [resolvedProducts, selectedProductId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedProductId(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const counts = useMemo(() => {
    let low = 0;
    let out = 0;
    let fast = 0;
    let slow = 0;
    let none = 0;
    for (const product of resolvedProducts) {
      if (product.displayStatus === "out") out += 1;
      else if (product.displayStatus === "low") low += 1;
      const movement = movementTab(product);
      if (movement === "fast") fast += 1;
      else if (movement === "slow") slow += 1;
      else none += 1;
    }
    return { low, out, fast, slow, none };
  }, [resolvedProducts]);

  const totalInventoryValue = useMemo(
    () =>
      resolvedProducts.reduce(
        (sum, product) => sum + product.displayStock * Number(product.cost_price || 0),
        0,
      ),
    [resolvedProducts],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return resolvedProducts.filter((product) => {
      if (q) {
        const haystack = [
          product.name,
          product.sku,
          product.barcode,
          product.color,
          product.size,
          product.categoryName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (categoryId !== "all" && product.category_id !== categoryId) return false;
      if (statusFilter !== "all" && product.displayStatus !== statusFilter) return false;
      if (tab === "low" && product.displayStatus !== "low") return false;
      if (tab === "out" && product.displayStatus !== "out") return false;
      if (["fast", "slow", "none"].includes(tab) && movementTab(product) !== tab) return false;
      return true;
    });
  }, [resolvedProducts, search, categoryId, statusFilter, tab]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  function resetFilters() {
    setSearch("");
    setCategoryId("all");
    setLocationId("all");
    setStatusFilter("all");
    setTab("all");
    setPage(1);
  }

  const tabItems: Array<{ id: Tab; label: string; count?: number }> = [
    { id: "all", label: "All Products" },
    { id: "low", label: "Low Stock", count: counts.low },
    { id: "out", label: "Out of Stock", count: counts.out },
    { id: "fast", label: "Fast Moving", count: counts.fast },
    { id: "slow", label: "Slow Moving", count: counts.slow },
    { id: "none", label: "No Movement", count: counts.none },
  ];

  const colSpan = 3 + Object.values(visibleColumns).filter(Boolean).length;

  return (
    <main className="min-w-0">
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Advanced Inventory</h1>
          <p className="mt-1 text-sm text-slate-500">
            Track stock levels, low-stock alerts and manage inventory across all branches.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/inventory/adjustments"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <SlidersHorizontal size={17} /> Adjust Stock
          </Link>
        </div>
      </div>

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<Boxes size={24} />} tone="blue" label="Total Items" value={products.length.toLocaleString()} helper="Active product variants" />
        <MetricCard icon={<Coins size={24} />} tone="green" label="Total Inventory Value" value={money(totalInventoryValue)} helper="Current cost value" />
        <MetricCard icon={<AlertTriangle size={24} />} tone="amber" label="Low Stock Items" value={counts.low.toLocaleString()} helper="Needs attention" />
        <MetricCard icon={<CircleX size={24} />} tone="red" label="Out of Stock" value={counts.out.toLocaleString()} helper={counts.out === 0 ? "All good" : "Unavailable now"} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 pt-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex min-w-0 gap-1 overflow-x-auto">
            {tabItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  setPage(1);
                }}
                className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition ${
                  tab === item.id
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {item.label}{typeof item.count === "number" ? ` (${item.count})` : ""}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 pb-3">
            <details className="relative">
              <summary className="list-none inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600">
                <Settings2 size={15} /> Customize Columns <ChevronDown size={14} />
              </summary>
              <div className="absolute right-0 z-30 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                {(Object.keys(visibleColumns) as ColumnKey[]).map((key) => (
                  <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={visibleColumns[key]}
                      onChange={(event) => setVisibleColumns((current) => ({ ...current, [key]: event.target.checked }))}
                    />
                    <span className="capitalize">{key === "cost" ? "Unit Cost" : key}</span>
                  </label>
                ))}
              </div>
            </details>
          </div>
        </div>

        <div className="grid gap-2 border-b border-slate-200 p-3 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search product name, SKU or barcode..."
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <select
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
              setPage(1);
            }}
            className={selectClass}
          >
            <option value="all">All Categories</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          <select
            value={locationId}
            onChange={(event) => {
              setLocationId(event.target.value);
              setPage(1);
            }}
            className={selectClass}
          >
            <option value="all">All Branches</option>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}
            className={selectClass}
          >
            <option value="all">Stock Status</option>
            <option value="in">In Stock</option>
            <option value="low">Low Stock</option>
            <option value="out">Out of Stock</option>
          </select>
          <button type="button" onClick={resetFilters} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-blue-600 hover:bg-blue-50">
            <RotateCcw size={15} /> Reset
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-10 px-4 py-3">Select</th>
                <th className="px-3 py-3">Product / Variant</th>
                {visibleColumns.sku && <th className="px-3 py-3">SKU</th>}
                {visibleColumns.category && <th className="px-3 py-3">Category</th>}
                {visibleColumns.stock && <th className="px-3 py-3">Stock</th>}
                {visibleColumns.threshold && <th className="px-3 py-3">Threshold</th>}
                {visibleColumns.cost && <th className="px-3 py-3">Unit Cost</th>}
                {visibleColumns.value && <th className="px-3 py-3">Value</th>}
                {visibleColumns.status && <th className="px-3 py-3">Status</th>}
                <th className="w-16 px-3 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginated.map((product) => (
                <InventoryRow
                  key={product.id}
                  product={product}
                  visibleColumns={visibleColumns}
                  selected={product.id === selectedProductId}
                  onSelect={() => setSelectedProductId(product.id)}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-16 text-center text-slate-500">
                    <PackageSearch className="mx-auto mb-3 text-slate-300" size={32} />
                    <p className="font-semibold text-slate-700">No inventory items match these filters</p>
                    <p className="mt-1 text-xs">Try changing the search, branch or stock status.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Showing {filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} of {filtered.length} products
          </span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className={pagerClass}>
              <ChevronLeft size={16} />
            </button>
            <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-blue-600 px-2 font-semibold text-white">{safePage}</span>
            <span className="text-xs">/ {pageCount}</span>
            <button type="button" disabled={safePage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className={pagerClass}>
              <ChevronRight size={16} />
            </button>
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 outline-none"
            >
              {PAGE_SIZES.map((size) => <option key={size} value={size}>{size} / page</option>)}
            </select>
          </div>
        </div>
      </section>

      {selectedProduct && (
        <InventoryDetailDrawer
          product={selectedProduct}
          branchRows={selectedBranchRows}
          selectedLocationId={locationId}
          onClose={() => setSelectedProductId(null)}
        />
      )}
    </main>
  );
}

function InventoryRow({
  product,
  visibleColumns,
  selected,
  onSelect,
}: {
  product: ResolvedProduct;
  visibleColumns: Record<ColumnKey, boolean>;
  selected: boolean;
  onSelect: () => void;
}) {
  const image = product.variant_image_url || product.image_url;
  const denominator = Math.max(product.displayThreshold * 2, product.displayStock, 1);
  const width = Math.max(3, Math.min(100, (product.displayStock / denominator) * 100));
  const value = product.displayStock * Number(product.cost_price || 0);

  return (
    <tr
      className={`cursor-pointer transition hover:bg-blue-50/50 ${selected ? "bg-blue-50/70" : ""}`}
      onClick={onSelect}
    >
      <td className="px-4 py-3">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300"
          checked={selected}
          onChange={onSelect}
          onClick={(event) => event.stopPropagation()}
          aria-label={`View details for ${product.name}`}
        />
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <Boxes size={18} className="text-slate-300" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">
              {product.name}{product.color ? ` - ${product.color}` : ""}{product.size ? ` / ${product.size}` : ""}
            </p>
            <p className="truncate text-xs text-slate-500">
              {[product.color, product.size ? `Size ${product.size}` : null].filter(Boolean).join(" · ") || "Standard product"}
            </p>
          </div>
        </div>
      </td>
      {visibleColumns.sku && <td className="px-3 py-3 text-slate-600">{product.sku || "—"}</td>}
      {visibleColumns.category && <td className="px-3 py-3 text-slate-600">{product.categoryName}</td>}
      {visibleColumns.stock && (
        <td className="px-3 py-3">
          <div className="w-28">
            <span className={`font-bold ${product.displayStatus === "in" ? "text-emerald-700" : "text-red-600"}`}>{product.displayStock}</span>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full rounded-full ${product.displayStatus === "in" ? "bg-emerald-500" : "bg-red-500"}`}
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        </td>
      )}
      {visibleColumns.threshold && <td className="px-3 py-3 text-slate-600">{product.displayThreshold}</td>}
      {visibleColumns.cost && <td className="px-3 py-3 font-medium text-slate-700">{money(Number(product.cost_price || 0))}</td>}
      {visibleColumns.value && <td className="px-3 py-3 font-semibold text-slate-800">{money(value)}</td>}
      {visibleColumns.status && (
        <td className="px-3 py-3">
          <StatusBadge status={product.displayStatus} />
        </td>
      )}
      <td className="px-3 py-3 text-center" onClick={(event) => event.stopPropagation()}>
        <details className="relative inline-block text-left">
          <summary className="list-none inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
            <Ellipsis size={16} />
          </summary>
          <div className="absolute right-0 z-30 mt-1 w-40 rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
            <button type="button" onClick={onSelect} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50">View details</button>
            <Link href={`/dashboard/products/${product.id}/edit`} className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-50">Edit product</Link>
            <Link href="/dashboard/inventory/adjustments" className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-50">Adjust stock</Link>
          </div>
        </details>
      </td>
    </tr>
  );
}

function InventoryDetailDrawer({
  product,
  branchRows,
  selectedLocationId,
  onClose,
}: {
  product: ResolvedProduct;
  branchRows: Array<{
    id: string;
    name: string;
    code: string;
    quantity: number;
    threshold: number;
    status: "in" | "low" | "out";
  }>;
  selectedLocationId: string;
  onClose: () => void;
}) {
  const image = product.variant_image_url || product.image_url;
  const value = product.displayStock * Number(product.cost_price || 0);
  const updated = product.updated_at
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(product.updated_at))
    : "—";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/20" onMouseDown={onClose}>
      <aside
        className="h-full w-full max-w-[520px] overflow-y-auto border-l border-slate-200 bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Inventory detail</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">{product.name}</h2>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <section className="flex gap-4 rounded-2xl border border-slate-200 p-4">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="" className="h-full w-full object-cover" />
              ) : (
                <Boxes size={30} className="text-slate-300" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-slate-950">
                {product.name}{product.color ? ` · ${product.color}` : ""}{product.size ? ` · ${product.size}` : ""}
              </p>
              <p className="mt-1 text-sm text-slate-500">{product.categoryName}</p>
              <div className="mt-3"><StatusBadge status={product.displayStatus} /></div>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <DetailMetric label={selectedLocationId === "all" ? "Total stock" : "Branch stock"} value={String(product.displayStock)} />
            <DetailMetric label="Reorder threshold" value={String(product.displayThreshold)} />
            <DetailMetric label="Unit cost" value={money(Number(product.cost_price || 0))} />
            <DetailMetric label="Inventory value" value={money(value)} />
            <DetailMetric label="Selling price" value={money(Number(product.selling_price || 0))} />
            <DetailMetric label="Sold · 30 days" value={String(product.sold_30d)} />
          </section>

          <section className="rounded-2xl border border-slate-200">
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="font-semibold text-slate-950">Product information</h3>
            </div>
            <dl className="divide-y divide-slate-100 text-sm">
              <DetailRow label="SKU" value={product.sku || "—"} />
              <DetailRow label="Barcode" value={product.barcode || "—"} />
              <DetailRow label="Colour" value={product.color || "—"} />
              <DetailRow label="Size" value={product.size || "—"} />
              <DetailRow label="Last updated" value={updated} />
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="font-semibold text-slate-950">Branch stock</h3>
              <span className="text-xs text-slate-400">{branchRows.length} branches</span>
            </div>
            <div className="divide-y divide-slate-100">
              {branchRows.length > 0 ? branchRows.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="font-medium text-slate-800">{row.name}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{row.code} · Threshold {row.threshold}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${row.status === "in" ? "text-emerald-700" : "text-red-600"}`}>{row.quantity}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{row.status === "out" ? "Out of stock" : row.status === "low" ? "Low stock" : "In stock"}</p>
                  </div>
                </div>
              )) : (
                <div className="px-4 py-8 text-center text-sm text-slate-400">No branch stock records yet.</div>
              )}
            </div>
          </section>

          <div className="grid grid-cols-2 gap-3 pb-4">
            <Link href={`/dashboard/products/${product.id}/edit`} className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 font-semibold text-slate-700 hover:bg-slate-50">
              Edit Product
            </Link>
            <Link href="/dashboard/inventory/adjustments" className="inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 font-semibold text-white hover:bg-blue-700">
              Adjust Stock
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-950">{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="max-w-[65%] text-right font-medium text-slate-800">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: "in" | "low" | "out" }) {
  if (status === "in") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><Check size={13} /> In Stock</span>;
  }
  if (status === "low") {
    return <span className="inline-flex rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">Low Stock</span>;
  }
  return <span className="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">Out of Stock</span>;
}

function MetricCard({
  icon,
  tone,
  label,
  value,
  helper,
}: {
  icon: ReactNode;
  tone: "blue" | "green" | "amber" | "red";
  label: string;
  value: string;
  helper: string;
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
  } as const;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</div>
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
          <p className="mt-1 text-xs text-slate-400">{helper}</p>
        </div>
      </div>
    </div>
  );
}

const selectClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
const pagerClass = "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";
