"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Grid2X2,
  List,
  MoreHorizontal,
  Package,
  Pencil,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";

import {
  deleteProductGroup,
  setProductGroupActive,
} from "@/app/(dashboard)/dashboard/products/actions";

type ProductCategory = {
  name: string;
};

export type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode?: string | null;
  image_url: string | null;
  variant_image_url?: string | null;
  cost_price: number;
  selling_price: number;
  stock_quantity: number;
  low_stock_quantity: number;
  is_active: boolean;
  is_online: boolean;
  created_at: string;
  updated_at?: string | null;
  size?: string | null;
  color?: string | null;
  product_type?: string | null;
  variant_group_id?: string | null;
  categories: ProductCategory | ProductCategory[] | null;
};

type ProductGroup = {
  key: string;
  representative: Product;
  rows: Product[];
  name: string;
  category: string;
  sku: string | null;
  imageUrl: string | null;
  variants: number;
  sizes: string[];
  minPrice: number;
  maxPrice: number;
  totalStock: number;
  lowStock: boolean;
  outOfStock: boolean;
  active: boolean;
  onlineCount: number;
  updatedAt: string;
};

type ActionMenuState = {
  group: ProductGroup;
  top: number;
  left: number;
};

type ConfirmState = {
  kind: "hide" | "delete";
  group: ProductGroup;
  error?: string;
};

function getCategoryName(categories: ProductCategory | ProductCategory[] | null) {
  if (!categories) return "Uncategorized";
  if (Array.isArray(categories)) return categories[0]?.name ?? "Uncategorized";
  return categories.name;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatUpdated(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function groupProducts(products: Product[], variantMode: boolean): ProductGroup[] {
  const grouped = new Map<string, Product[]>();

  for (const product of products) {
    const key =
      variantMode && product.product_type === "variant" && product.variant_group_id
        ? product.variant_group_id
        : product.id;
    const rows = grouped.get(key) ?? [];
    rows.push(product);
    grouped.set(key, rows);
  }

  return Array.from(grouped.entries()).map(([key, rows]) => {
    const representative = rows[0];
    const prices = rows.map((row) => Number(row.selling_price || 0));
    const totalStock = rows.reduce((sum, row) => sum + Number(row.stock_quantity || 0), 0);
    const sizes = Array.from(
      new Set(rows.map((row) => row.size?.trim()).filter((value): value is string => Boolean(value))),
    );
    const updatedAt = rows
      .map((row) => row.updated_at || row.created_at)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

    return {
      key,
      representative,
      rows,
      name: representative.name,
      category: getCategoryName(representative.categories),
      sku: representative.sku,
      imageUrl:
        representative.image_url ??
        rows.find((row) => row.variant_image_url)?.variant_image_url ??
        null,
      variants: rows.length,
      sizes,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      totalStock,
      lowStock:
        totalStock > 0 &&
        rows.some((row) => Number(row.stock_quantity || 0) <= Number(row.low_stock_quantity || 0)),
      outOfStock: totalStock === 0,
      active: rows.some((row) => row.is_active),
      onlineCount: rows.filter((row) => row.is_online).length,
      updatedAt,
    };
  });
}

export default function ProductList({
  products,
  productMode = "standard",
}: {
  products: Product[];
  productMode?: string;
}) {
  const router = useRouter();
  const [actionPending, startActionTransition] = useTransition();
  const variantMode = productMode === "variant";
  const groups = useMemo(() => groupProducts(products, variantMode), [products, variantMode]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [channel, setChannel] = useState("all");
  const [stock, setStock] = useState("all");
  const [sort, setSort] = useState("newest");
  const [view, setView] = useState<"list" | "grid">("list");
  const [page, setPage] = useState(1);
  const [actionMenu, setActionMenu] = useState<ActionMenuState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [detailGroup, setDetailGroup] = useState<ProductGroup | null>(null);

  useEffect(() => {
    if (!actionMenu) return;
    const close = () => setActionMenu(null);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [actionMenu]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setActionMenu(null);
      setDetailGroup(null);
      if (!actionPending) setConfirmState(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actionPending]);

  const categories = useMemo(
    () => Array.from(new Set(groups.map((group) => group.category))).sort(),
    [groups],
  );

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    let result = groups.filter((group) => {
      const matchesSearch =
        !keyword ||
        group.name.toLowerCase().includes(keyword) ||
        (group.sku ?? "").toLowerCase().includes(keyword) ||
        group.category.toLowerCase().includes(keyword) ||
        group.rows.some((row) =>
          [row.sku, row.barcode, row.size, row.color]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(keyword)),
        );
      if (!matchesSearch) return false;
      if (category !== "all" && group.category !== category) return false;
      if (status === "active" && (!group.active || group.lowStock || group.outOfStock)) return false;
      if (status === "low" && !group.lowStock) return false;
      if (status === "out" && !group.outOfStock) return false;
      if (status === "inactive" && group.active) return false;
      if (channel === "online" && group.onlineCount === 0) return false;
      if (channel === "hidden" && group.onlineCount > 0) return false;
      if (stock === "in" && group.totalStock <= 0) return false;
      if (stock === "low" && !group.lowStock) return false;
      if (stock === "out" && !group.outOfStock) return false;
      return true;
    });

    result = [...result].sort((a, b) => {
      if (sort === "oldest") return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "stock") return b.totalStock - a.totalStock;
      if (sort === "price") return b.maxPrice - a.maxPrice;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    return result;
  }, [groups, search, category, status, channel, stock, sort]);

  const pageSize = 15;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  function resetPage() {
    setPage(1);
  }

  function openActionMenu(
    event: ReactMouseEvent<HTMLButtonElement>,
    group: ProductGroup,
  ) {
    event.preventDefault();
    event.stopPropagation();

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 176;
    const menuHeight = 176;
    const margin = 12;
    const left = Math.min(
      Math.max(margin, rect.right - menuWidth),
      Math.max(margin, window.innerWidth - menuWidth - margin),
    );
    const opensUp = rect.bottom + menuHeight + 8 > window.innerHeight;
    const rawTop = opensUp ? rect.top - menuHeight - 6 : rect.bottom + 6;
    const top = Math.min(
      Math.max(margin, rawTop),
      Math.max(margin, window.innerHeight - menuHeight - margin),
    );

    setActionMenu({ group, top, left });
  }

  function openDetails(group: ProductGroup) {
    setActionMenu(null);
    setDetailGroup(group);
  }

  function requestHide(group: ProductGroup) {
    setActionMenu(null);
    setConfirmState({ kind: "hide", group });
  }

  function requestDelete(group: ProductGroup) {
    setActionMenu(null);
    setConfirmState({ kind: "delete", group });
  }

  function runConfirmedAction() {
    if (!confirmState || actionPending) return;
    const request = confirmState;

    startActionTransition(async () => {
      const result =
        request.kind === "hide"
          ? await setProductGroupActive(request.group.representative.id, false)
          : await deleteProductGroup(request.group.representative.id);

      if (!result.success) {
        setConfirmState((current) =>
          current ? { ...current, error: result.message } : current,
        );
        return;
      }

      setConfirmState(null);
      router.refresh();
    });
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Product List</h2>
          <p className="mt-0.5 text-xs text-slate-500">View and manage your products, variants and inventory.</p>
        </div>
      </div>

      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="relative w-full max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              resetPage();
            }}
            placeholder="Search products..."
            className={filterInputClass + " pl-9"}
          />
        </div>

        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(130px,.9fr)_minmax(130px,.9fr)_minmax(130px,.9fr)_minmax(130px,.9fr)_auto_minmax(150px,1fr)]">
          <select value={category} onChange={(event) => { setCategory(event.target.value); resetPage(); }} className={filterInputClass}>
            <option value="all">All Categories</option>
            {categories.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <select value={status} onChange={(event) => { setStatus(event.target.value); resetPage(); }} className={filterInputClass}>
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="low">Low Stock</option>
            <option value="out">Out of Stock</option>
            <option value="inactive">Inactive</option>
          </select>
          <select value={channel} onChange={(event) => { setChannel(event.target.value); resetPage(); }} className={filterInputClass}>
            <option value="all">All Channels</option>
            <option value="online">Online</option>
            <option value="hidden">Hidden Online</option>
          </select>
          <select value={stock} onChange={(event) => { setStock(event.target.value); resetPage(); }} className={filterInputClass}>
            <option value="all">All Stock Levels</option>
            <option value="in">In Stock</option>
            <option value="low">Low Stock</option>
            <option value="out">Out of Stock</option>
          </select>
          <div className="flex w-fit rounded-lg border border-slate-200 p-1">
            <button type="button" onClick={() => setView("list")} className={`rounded-md p-2 ${view === "list" ? "bg-blue-50 text-blue-600" : "text-slate-400 hover:bg-slate-50"}`} aria-label="List view">
              <List size={16} />
            </button>
            <button type="button" onClick={() => setView("grid")} className={`rounded-md p-2 ${view === "grid" ? "bg-blue-50 text-blue-600" : "text-slate-400 hover:bg-slate-50"}`} aria-label="Grid view">
              <Grid2X2 size={16} />
            </button>
          </div>
          <div className="relative">
            <SlidersHorizontal size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select value={sort} onChange={(event) => setSort(event.target.value)} className={filterInputClass + " pl-8"}>
              <option value="newest">Sort: Newest</option>
              <option value="oldest">Sort: Oldest</option>
              <option value="name">Sort: Name</option>
              <option value="stock">Sort: Stock</option>
              <option value="price">Sort: Price</option>
            </select>
          </div>
        </div>
      </div>

      {pageRows.length === 0 ? (
        <div className="p-12 text-center">
          <Package size={38} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-700">No products found</p>
          <p className="mt-1 text-xs text-slate-500">Try changing your search or filters.</p>
        </div>
      ) : view === "grid" ? (
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {pageRows.map((group) => (
            <ProductCard key={group.key} group={group} onMenu={openActionMenu} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="w-10 px-3 py-3"><input type="checkbox" aria-label="Select all products" /></th>
                <th className="px-3 py-3 text-left font-semibold">Product</th>
                <th className="px-3 py-3 text-left font-semibold">Category</th>
                <th className="px-3 py-3 text-left font-semibold">Variants</th>
                <th className="px-3 py-3 text-left font-semibold">Price Range</th>
                <th className="px-3 py-3 text-left font-semibold">Total Stock</th>
                <th className="px-3 py-3 text-left font-semibold">Status</th>
                <th className="px-3 py-3 text-left font-semibold">Updated</th>
                <th className="w-16 px-3 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageRows.map((group) => (
                <tr key={group.key} className="transition hover:bg-slate-50/70">
                  <td className="px-3 py-3"><input type="checkbox" aria-label={`Select ${group.name}`} /></td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      {group.imageUrl ? (
                        <img src={group.imageUrl} alt={group.name} loading="lazy" decoding="async" className="h-11 w-11 rounded-lg border border-slate-200 object-cover" />
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-slate-400"><Package size={18} /></div>
                      )}
                      <div className="min-w-0">
                        <p className="max-w-52 truncate font-semibold text-slate-900">{group.name}</p>
                        <p className="mt-0.5 truncate text-[11px] text-slate-400">{group.sku || "No SKU"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-600">{group.category}</td>
                  <td className="px-3 py-3">
                    <p className="text-xs font-semibold text-slate-800">{group.variants}</p>
                    {group.sizes.length > 0 && <p className="mt-0.5 max-w-32 truncate text-[10px] text-slate-400">{group.sizes.join(" · ")}</p>}
                  </td>
                  <td className="px-3 py-3 text-xs font-medium text-slate-700">
                    {group.minPrice === group.maxPrice ? formatMoney(group.minPrice) : `${formatMoney(group.minPrice)} – ${formatMoney(group.maxPrice)}`}
                  </td>
                  <td className="px-3 py-3 text-xs font-semibold text-slate-800">{group.totalStock}</td>
                  <td className="px-3 py-3"><StatusBadge group={group} /></td>
                  <td className="px-3 py-3 text-xs text-slate-500">{formatUpdated(group.updatedAt)}</td>
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={(event) => openActionMenu(event, group)}
                      aria-label={`Actions for ${group.name}`}
                      aria-haspopup="menu"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                    >
                      <MoreHorizontal size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p>
          Showing {filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} of {filtered.length} products
        </p>
        <div className="flex items-center gap-1.5">
          <button type="button" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className={pageButtonClass} aria-label="Previous page"><ChevronLeft size={15} /></button>
          {Array.from({ length: Math.min(pageCount, 5) }, (_, index) => {
            const value = index + 1;
            return <button key={value} type="button" onClick={() => setPage(value)} className={`${pageButtonClass} ${safePage === value ? "border-blue-600 bg-blue-600 text-white" : ""}`}>{value}</button>;
          })}
          {pageCount > 5 && <span className="px-1 text-slate-400">…</span>}
          {pageCount > 5 && <button type="button" onClick={() => setPage(pageCount)} className={`${pageButtonClass} ${safePage === pageCount ? "border-blue-600 bg-blue-600 text-white" : ""}`}>{pageCount}</button>}
          <button type="button" disabled={safePage >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} className={pageButtonClass} aria-label="Next page"><ChevronRight size={15} /></button>
          <span className="ml-1 inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-500">15 / page</span>
        </div>
      </div>

      {actionMenu && typeof document !== "undefined" &&
        createPortal(
          <>
            <button
              type="button"
              aria-label="Close product actions"
              className="fixed inset-0 z-[80] cursor-default"
              onMouseDown={() => setActionMenu(null)}
            />
            <div
              role="menu"
              className="fixed z-[90] w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10"
              style={{ top: actionMenu.top, left: actionMenu.left }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => openDetails(actionMenu.group)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <Eye size={15} /> View
              </button>
              <Link
                href={`/dashboard/products/${actionMenu.group.representative.id}/edit`}
                role="menuitem"
                onClick={() => setActionMenu(null)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <Pencil size={15} /> Edit
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => requestHide(actionMenu.group)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <EyeOff size={15} />
                Hide
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => requestDelete(actionMenu.group)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
              >
                <Trash2 size={15} /> Delete
              </button>
            </div>
          </>,
          document.body,
        )}

      {detailGroup && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[95] bg-slate-950/30"
            onMouseDown={() => setDetailGroup(null)}
          >
            <aside
              role="dialog"
              aria-modal="true"
              aria-label={`${detailGroup.name} details`}
              className="absolute right-0 top-0 flex h-full w-full max-w-[520px] flex-col border-l border-slate-200 bg-white shadow-2xl"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">Product details</p>
                  <h3 className="mt-1 text-lg font-bold text-slate-950">{detailGroup.name}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">View style information, inventory and clothing variants.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailGroup(null)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
                  aria-label="Close product details"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5">
                <div className="flex items-start gap-4">
                  {detailGroup.imageUrl ? (
                    <img src={detailGroup.imageUrl} alt={detailGroup.name} className="h-20 w-20 rounded-2xl border border-slate-200 object-cover" />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><Package size={25} /></div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="truncate text-base font-bold text-slate-950">{detailGroup.name}</h4>
                      <StatusBadge group={detailGroup} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{detailGroup.category}</p>
                    <p className="mt-1 text-xs font-medium text-slate-400">{detailGroup.sku || "No SKU"}</p>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2">
                  <DetailMetric label="Variants" value={String(detailGroup.variants)} />
                  <DetailMetric label="Total stock" value={String(detailGroup.totalStock)} />
                  <DetailMetric
                    label="Price"
                    value={detailGroup.minPrice === detailGroup.maxPrice ? formatMoney(detailGroup.minPrice) : `${formatMoney(detailGroup.minPrice)} – ${formatMoney(detailGroup.maxPrice)}`}
                  />
                </div>

                <div className="mt-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-950">Clothing sizes & colours</h4>
                      <p className="mt-0.5 text-xs text-slate-500">{detailGroup.rows.length} variant{detailGroup.rows.length === 1 ? "" : "s"} in this style.</p>
                    </div>
                  </div>

                  <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[650px] text-xs">
                      <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                        <tr className="border-b border-slate-200">
                          <th className="px-3 py-2.5 text-left font-semibold">Image</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Size</th>
                          <th className="px-3 py-2.5 text-left font-semibold">Colour</th>
                          <th className="px-3 py-2.5 text-left font-semibold">SKU</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Cost</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Price</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Stock</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Alert</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {[...detailGroup.rows]
                          .sort((a, b) => compareVariantRows(a, b))
                          .map((row) => (
                            <tr key={row.id} className="bg-white">
                              <td className="px-3 py-2.5">
                                {(row.variant_image_url ?? row.image_url) ? (
                                  <img
                                    src={row.variant_image_url ?? row.image_url ?? ""}
                                    alt={`${detailGroup.name} ${row.color ?? ""} ${row.size ?? ""}`}
                                    loading="lazy"
                                    decoding="async"
                                    className="h-8 w-8 rounded-md border border-slate-200 object-cover"
                                  />
                                ) : (
                                  <div className="grid h-8 w-8 place-items-center rounded-md bg-slate-100 text-slate-400"><Package size={13} /></div>
                                )}
                              </td>
                              <td className="px-3 py-2.5 font-semibold text-slate-800">{row.size || "—"}</td>
                              <td className="px-3 py-2.5 text-slate-600">{row.color || "—"}</td>
                              <td className="max-w-40 truncate px-3 py-2.5 font-mono text-[11px] text-slate-500">{row.sku || "—"}</td>
                              <td className="px-3 py-2.5 text-right text-slate-600">{formatMoney(Number(row.cost_price || 0))}</td>
                              <td className="px-3 py-2.5 text-right font-semibold text-slate-800">{formatMoney(Number(row.selling_price || 0))}</td>
                              <td className="px-3 py-2.5 text-right font-semibold text-slate-800">{row.stock_quantity}</td>
                              <td className="px-3 py-2.5 text-right text-slate-500">{row.low_stock_quantity}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-4 text-xs">
                    <span className="text-slate-500">Last updated</span>
                    <span className="font-semibold text-slate-800">{formatUpdated(detailGroup.updatedAt)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-4 text-xs">
                    <span className="text-slate-500">Online visibility</span>
                    <span className="font-semibold text-slate-800">{detailGroup.onlineCount > 0 ? "Visible online" : "Hidden online"}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 border-t border-slate-200 bg-white px-5 py-4">
                <Link
                  href={`/dashboard/products/${detailGroup.representative.id}/edit`}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  <Pencil size={15} /> Edit Product
                </Link>
                <button
                  type="button"
                  onClick={() => setDetailGroup(null)}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </aside>
          </div>,
          document.body,
        )}

      {confirmState && typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 p-4">
            <div
              role="alertdialog"
              aria-modal="true"
              className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${confirmState.kind === "delete" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"}`}>
                {confirmState.kind === "delete" ? <Trash2 size={19} /> : <EyeOff size={19} />}
              </div>
              <h3 className="mt-3 text-base font-bold text-slate-950">
                {confirmState.kind === "delete"
                  ? `Delete ${confirmState.group.name}?`
                  : `Hide ${confirmState.group.name}?`}
              </h3>
              <p className="mt-1.5 text-sm leading-5 text-slate-500">
                {confirmState.kind === "delete"
                  ? "This permanently removes this product/style. If it is already used in order or inventory history, TENH POS will block the delete and keep the records safe."
                  : "This product/style will become inactive and will be hidden from POS and online. You can enable POS/online again from Edit Product."}
              </p>

              {confirmState.error && (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700">
                  {confirmState.error}
                </div>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={actionPending}
                  onClick={() => setConfirmState(null)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={actionPending}
                  onClick={runConfirmedAction}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${confirmState.kind === "delete" ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}
                >
                  {actionPending
                    ? "Working..."
                    : confirmState.kind === "delete"
                      ? "Delete"
                      : "Hide"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}

function ProductCard({
  group,
  onMenu,
}: {
  group: ProductGroup;
  onMenu: (event: ReactMouseEvent<HTMLButtonElement>, group: ProductGroup) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 transition hover:border-blue-200 hover:shadow-sm">
      <div className="flex items-start gap-3">
        <Link href={`/dashboard/products/${group.representative.id}/edit`} className="flex min-w-0 flex-1 items-start gap-3">
          {group.imageUrl ? <img src={group.imageUrl} alt={group.name} loading="lazy" decoding="async" className="h-14 w-14 rounded-xl border border-slate-200 object-cover" /> : <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><Package size={20} /></div>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{group.name}</p>
            <p className="mt-0.5 text-xs text-slate-400">{group.category}</p>
            <div className="mt-2 flex flex-wrap gap-1.5"><StatusBadge group={group} /></div>
          </div>
        </Link>
        <button
          type="button"
          onClick={(event) => onMenu(event, group)}
          aria-label={`Actions for ${group.name}`}
          aria-haspopup="menu"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
        >
          <MoreHorizontal size={17} />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center">
        <div><p className="text-[10px] text-slate-400">Variants</p><p className="text-xs font-semibold text-slate-800">{group.variants}</p></div>
        <div><p className="text-[10px] text-slate-400">Stock</p><p className="text-xs font-semibold text-slate-800">{group.totalStock}</p></div>
        <div><p className="text-[10px] text-slate-400">Price</p><p className="text-xs font-semibold text-slate-800">{formatMoney(group.minPrice)}</p></div>
      </div>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-slate-900" title={value}>{value}</p>
    </div>
  );
}

function compareVariantRows(a: Product, b: Product) {
  const aSize = (a.size ?? "").trim();
  const bSize = (b.size ?? "").trim();
  const aNumber = Number(aSize);
  const bNumber = Number(bSize);
  const aNumeric = aSize !== "" && Number.isFinite(aNumber);
  const bNumeric = bSize !== "" && Number.isFinite(bNumber);

  if (aNumeric && bNumeric && aNumber !== bNumber) return aNumber - bNumber;
  if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
  const sizeCompare = aSize.localeCompare(bSize, undefined, { numeric: true, sensitivity: "base" });
  if (sizeCompare !== 0) return sizeCompare;
  return (a.color ?? "").localeCompare(b.color ?? "", undefined, { sensitivity: "base" });
}

function StatusBadge({ group }: { group: ProductGroup }) {
  if (!group.active) return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">Inactive</span>;
  if (group.outOfStock) return <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-semibold text-red-700">Out of Stock</span>;
  if (group.lowStock) return <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700">Low Stock</span>;
  return <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">Active</span>;
}

const filterInputClass = "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const pageButtonClass = "inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";
