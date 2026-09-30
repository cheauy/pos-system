"use client";

import { toast } from "sonner";
import { stockAdjustmentLink } from "@/lib/inventory/stock-adjustment";
import AnchoredActionMenu from "@/components/anchored-action-menu";
import ProductPhoto from '@/components/product-photo';
import ProductPhotoViewer from '@/components/product-photo-viewer';

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
  image_urls?: string[];
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
  groups?: ProductGroup[];
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
  productMode = "standard", branchId="", businessType, canAdjustStock = false,
}: {
  products: Product[];
  productMode?: string; branches?:{id:string;name:string}[];branchId?:string; businessType?: string; canAdjustStock?: boolean;
}) {
  const router = useRouter();
  const [selectedGroups, setSelectedGroups] = useState(new Set<string>());
  useEffect(() => { setSelectedGroups(new Set()); }, [branchId]);
  function toggleSelected(key: string) {
    setSelectedGroups(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }
  function adjustSelectedStock(targets: ProductGroup[]) {
    const rows = targets.flatMap(group => group.rows);
    if (!canAdjustStock) return;
    if (rows.some(row => !row.is_active)) { toast.error("Activate hidden variants before adjusting their stock."); return; }
    try {
      const ids = rows.map(row => row.id);
      router.push(stockAdjustmentLink(ids, branchId, ids.length > 30 ? sessionStorage : undefined));
      setActionMenu(null);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to open the stock selection."); }
  }
  const [actionPending, startActionTransition] = useTransition();
  const isGeneralShop = businessType === "general";
  const isFashion = businessType === "fashion";
  const isShoes = businessType === "shoes";
  const isVariantMode = productMode === "variant";
  const groupVariantProducts = isVariantMode || isGeneralShop;
  const groups = useMemo(
    () => groupProducts(products, groupVariantProducts),
    [products, groupVariantProducts],
  );
  const selectedTargets = groups.filter(group => selectedGroups.has(group.key));
  const selectedCount = selectedTargets.reduce((sum, group) => sum + group.rows.length, 0);
  const tableDetailLabel = isVariantMode
    ? "Variants"
    : isGeneralShop
      ? "SKU / Barcode"
      : "SKU";
  const detailDescription = isFashion
    ? "View style information, pricing, stock and clothing variants."
    : isShoes
      ? "View shoe information, pricing, stock and size / colour variants."
      : "View product information, pricing, stock and online visibility.";
  const variantSectionTitle = isFashion
    ? "Clothing sizes & colours"
    : isShoes
      ? "Shoe sizes & colours"
      : "Product variants";
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [catalogTab, setCatalogTab] = useState("all");
  const [sort, setSort] = useState("newest");
  const [view, setView] = useState<"list" | "grid">("list");
  const [page, setPage] = useState(1);
  const [actionMenu, setActionMenu] = useState<ActionMenuState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [detailGroup, setDetailGroup] = useState<ProductGroup | null>(null);
  const [collapsedColourGroups, setCollapsedColourGroups] = useState<Set<string>>(new Set());
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const detailPhotos = detailGroup ? [...new Set([detailGroup.imageUrl, ...(detailGroup.representative.image_urls ?? []), ...detailGroup.rows.map(row => row.variant_image_url || row.image_url)].filter((url): url is string => Boolean(url)))] : [];


  const detailVariantGroups = useMemo(
    () => (detailGroup ? groupVariantRowsByColour(detailGroup.rows) : []),
    [detailGroup],
  );

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
    setCollapsedColourGroups(new Set());
  }, [detailGroup?.key]);

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
      if (catalogTab === "hidden" && group.active) return false;
      if (category !== "all" && group.category !== category) return false;
      if (catalogTab === "low" && !group.lowStock) return false;
      if (catalogTab === "out" && !group.outOfStock) return false;
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
  }, [groups, search, category, sort, catalogTab]);

  const pageSize = 15;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  function resetPage() {
    setPage(1);
  }

  function toggleColourGroup(key: string) {
    setCollapsedColourGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function openActionMenu(
    event: ReactMouseEvent<HTMLButtonElement>,
    group: ProductGroup,
  ) {
    event.preventDefault();
    event.stopPropagation();

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 176;
    const menuHeight = canAdjustStock ? 176 : 136;
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
      const targets = request.groups ?? [request.group];
      for (let index = 0; index < targets.length; index++) {
        const group = targets[index];
        try {
          const result = request.kind === "hide"
            ? await setProductGroupActive(group.representative.id, request.groups ? false : !group.active)
            : await deleteProductGroup(group.representative.id, branchId);
          if (!result.success) {
            setConfirmState({ ...request, ...(request.groups ? { groups: targets.slice(index) } : {}), error: result.message });
            router.refresh(); return;
          }
          setSelectedGroups(current => { const next = new Set(current); next.delete(group.key); return next; });
        } catch {
          setConfirmState(null); router.refresh();
          toast.error("The result could not be confirmed. Review the refreshed products before trying again."); return;
        }
      }

      setConfirmState(null);
      router.refresh();
    });
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <nav aria-label="Catalog filters" className="flex gap-4 overflow-x-auto border-b border-slate-200 px-4">
        {([{ id: "all", label: "All Products", icon: Package }, { id: "low", label: "Low Stock", icon: SlidersHorizontal }, { id: "out", label: "Out of Stock", icon: Package }, { id: "hidden", label: "Hidden", icon: EyeOff }]).map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" aria-pressed={catalogTab === id} onClick={() => { setCatalogTab(id); resetPage(); }} className={`inline-flex shrink-0 items-center gap-2 border-b-2 py-3 text-xs font-semibold ${catalogTab === id ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}><Icon size={15} />{label}</button>
        ))}
      </nav>

      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2">
          <select value={category} onChange={(event) => { setCategory(event.target.value); resetPage(); }} className={filterInputClass + " !w-auto max-w-36 shrink-0"}>
            <option value="all">All Categories</option>
            {categories.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        <div className="relative min-w-20 flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              resetPage();
            }}
            placeholder="Search products..."
            className={filterInputClass + " min-w-0 pl-9"}
          />
        </div>

        <div className="contents">
          <div className="flex w-fit shrink-0 rounded-lg border border-slate-200 p-1">
            <button type="button" onClick={() => setView("list")} className={`rounded-md p-2 ${view === "list" ? "bg-teal-50 text-teal-700" : "text-slate-400 hover:bg-slate-50"}`} aria-label="List view">
              <List size={16} />
            </button>
            <button type="button" onClick={() => setView("grid")} className={`rounded-md p-2 ${view === "grid" ? "bg-teal-50 text-teal-700" : "text-slate-400 hover:bg-slate-50"}`} aria-label="Grid view">
              <Grid2X2 size={16} />
            </button>
          </div>
          <div className="relative shrink-0">
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
        {selectedTargets.length > 0 && <AnchoredActionMenu label={`Actions (${selectedCount})`}>
          <button type="button" disabled={actionPending} onClick={() => setConfirmState({ kind: "delete", group: selectedTargets[0], groups: selectedTargets })} className="rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50">Delete selected</button>
          <button type="button" disabled={actionPending} onClick={() => setConfirmState({ kind: "hide", group: selectedTargets[0], groups: selectedTargets })} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Hide selected</button>
          <button type="button" disabled={!canAdjustStock || actionPending} onClick={() => adjustSelectedStock(selectedTargets)} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-45">Adjust stock — {selectedCount} items</button>
        </AnchoredActionMenu>}
      </div>

      {pageRows.length === 0 ? (
        <div className="p-12 text-center">
          <Package size={38} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-700">No products found</p>
          <p className="mt-1 text-xs text-slate-500">Try changing your search or filters.</p>
        </div>
      ) : view === "grid" ? (
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {pageRows.map((group, index) => (
            <ProductCard eager={index < 3} key={group.key} group={group} selected={selectedGroups.has(group.key)} onToggle={() => toggleSelected(group.key)} onMenu={openActionMenu} onView={() => openDetails(group)} isGeneralShop={isGeneralShop} isVariantMode={isVariantMode} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="w-10 px-3 py-3"><input type="checkbox" aria-label="Select products on this page" disabled={actionPending} checked={pageRows.length > 0 && pageRows.every(group => selectedGroups.has(group.key))} onChange={() => setSelectedGroups(current => { const next = new Set(current); const all = pageRows.every(group => next.has(group.key)); pageRows.forEach(group => all ? next.delete(group.key) : next.add(group.key)); return next; })} /></th>
                <th className="px-3 py-3 text-left font-semibold">Product</th>
                <th className="px-3 py-3 text-left font-semibold">Category</th>
                <th className="px-3 py-3 text-left font-semibold">{tableDetailLabel}</th>
                <th className="px-3 py-3 text-left font-semibold">Price Range</th>
                <th className="px-3 py-3 text-left font-semibold">Total Stock</th>
                <th className="px-3 py-3 text-left font-semibold">Status</th>
                <th className="px-3 py-3 text-left font-semibold">Updated</th>
                <th className="w-16 px-3 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageRows.map((group, index) => (
                <tr key={group.key} onClick={(event) => { if (!(event.target as HTMLElement).closest("button, input, a, label")) openDetails(group); }} className="cursor-pointer transition hover:bg-slate-50/70">
                  <td className="px-3 py-3"><input type="checkbox" aria-label={`Select ${group.name}`} disabled={actionPending} checked={selectedGroups.has(group.key)} onChange={() => toggleSelected(group.key)} /></td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      {group.imageUrl ? (
                        <ProductPhoto loading={index < 3 ? 'eager' : 'lazy'} src={group.imageUrl} alt={group.name} sizes="56px" className="h-11 w-11 rounded-lg border border-slate-200 object-cover" />
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-slate-400"><Package size={18} /></div>
                      )}
                      <div className="min-w-0">
                        <button type="button" onClick={() => openDetails(group)} aria-label={`View ${group.name}`} className="block max-w-52 truncate text-left font-semibold text-slate-900 hover:text-teal-700 focus-visible:outline-2 focus-visible:outline-teal-600">{group.name}</button>
                        <p className="mt-0.5 truncate text-[11px] text-slate-400">{group.sku || "No SKU"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-600">{group.category}</td>
                  <td className="px-3 py-3">
                    {isVariantMode ? (
                      <>
                        <p className="text-xs font-semibold text-slate-800">{group.variants} variants</p>
                        {group.sizes.length > 0 && (
                          <p className="mt-0.5 max-w-32 truncate text-[10px] text-slate-400">
                            {group.sizes.join(" · ")}
                          </p>
                        )}
                      </>
                    ) : isGeneralShop ? (
                      <>
                        <p className="max-w-36 truncate text-xs font-semibold text-slate-800">
                          {group.variants > 1 ? `${group.variants} options` : group.sku || "No SKU"}
                        </p>
                        <p className="mt-0.5 max-w-36 truncate text-[10px] text-slate-400">
                          {group.variants > 1
                            ? "Separate SKU / stock per option"
                            : group.representative.barcode || "No barcode"}
                        </p>
                      </>
                    ) : (
                      <p className="max-w-36 truncate text-xs font-semibold text-slate-800">
                        {group.sku || "No SKU"}
                      </p>
                    )}
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

      {canAdjustStock && <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3 text-xs">
        <span className="font-semibold text-slate-700">{groups.filter(group => selectedGroups.has(group.key)).length} products selected</span>
        <button type="button" onClick={() => setSelectedGroups(new Set(filtered.map(group => group.key)))} className="text-blue-700 underline">Select filtered</button>
        <button type="button" onClick={() => setSelectedGroups(new Set())} className="text-slate-500">Clear</button>

      </div>}
      <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p>
          Showing {filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} of {filtered.length} products
        </p>
        <div className="flex items-center gap-1.5">
          <button type="button" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className={pageButtonClass} aria-label="Previous page"><ChevronLeft size={15} /></button>
          {Array.from({ length: Math.min(pageCount, 5) }, (_, index) => {
            const value = index + 1;
            return <button key={value} type="button" onClick={() => setPage(value)} className={`${pageButtonClass} ${safePage === value ? "border-teal-700 bg-teal-700 text-white" : ""}`}>{value}</button>;
          })}
          {pageCount > 5 && <span className="px-1 text-slate-400">…</span>}
          {pageCount > 5 && <button type="button" onClick={() => setPage(pageCount)} className={`${pageButtonClass} ${safePage === pageCount ? "border-teal-700 bg-teal-700 text-white" : ""}`}>{pageCount}</button>}
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
              <Link
                href={`/dashboard/products/${actionMenu.group.representative.id}/edit`}
                role="menuitem"
                onClick={() => setActionMenu(null)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <Pencil size={15} /> Edit
              </Link>
              {canAdjustStock && <button type="button" role="menuitem" onClick={() => adjustSelectedStock([actionMenu.group])} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"><SlidersHorizontal size={15} /> Adjust stock</button>}
              <button
                type="button"
                role="menuitem"
                onClick={() => requestHide(actionMenu.group)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                {actionMenu.group.active ? <EyeOff size={15} /> : <Eye size={15} />}
                {actionMenu.group.active ? "Hide" : "Unhide"}
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
                  <p className="mt-0.5 text-xs text-slate-500">
                    {detailDescription}
                  </p>
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
                    <button type="button" onClick={() => setPhotoPreview(detailGroup.imageUrl)} aria-label="View cover photo" className="shrink-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-teal-600"><ProductPhoto src={detailGroup.imageUrl} alt={detailGroup.name} sizes="80px" className="h-20 w-20 rounded-2xl border border-slate-200 object-cover" /></button>
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
                  <DetailMetric
                    label={
                      isVariantMode
                        ? "Variants"
                        : isGeneralShop && detailGroup.rows.length > 1
                          ? "Options"
                          : isGeneralShop
                            ? "Barcode"
                            : "SKU"
                    }
                    value={
                      isVariantMode
                        ? String(detailGroup.variants)
                        : isGeneralShop && detailGroup.rows.length > 1
                          ? String(detailGroup.rows.length)
                          : isGeneralShop
                            ? detailGroup.representative.barcode || "—"
                            : detailGroup.sku || "—"
                    }
                  />
                  <DetailMetric label="Total stock" value={String(detailGroup.totalStock)} />
                  <DetailMetric
                    label="Price"
                    value={detailGroup.minPrice === detailGroup.maxPrice ? formatMoney(detailGroup.minPrice) : `${formatMoney(detailGroup.minPrice)} – ${formatMoney(detailGroup.maxPrice)}`}
                  />
                </div>

                {(detailGroup.representative.image_urls?.length ?? 0) > 0 && <div className="mt-4 flex gap-3 overflow-x-auto" aria-label="Product gallery">{detailGroup.representative.image_urls?.map((url, index) => <button type="button" key={url} onClick={() => setPhotoPreview(url)} aria-label={`View product photo ${index + 1}`} className="shrink-0 rounded-xl focus-visible:outline-2 focus-visible:outline-teal-600"><ProductPhoto src={url} alt={`${detailGroup.name} photo ${index + 1}`} sizes="120px" className="h-28 w-28 shrink-0 rounded-xl border border-slate-200 object-contain" loading="lazy" /></button>)}</div>}

                {isVariantMode && (
                <div className="mt-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-950">{variantSectionTitle}</h4>
                      <p className="mt-0.5 text-xs text-slate-500">{detailGroup.rows.length} variant{detailGroup.rows.length === 1 ? "" : "s"} in this product.</p>
                    </div>
                  </div>

                  <div className="mt-3 space-y-3">
                    {detailVariantGroups.map((colourGroup) => {
                      const collapsed = collapsedColourGroups.has(colourGroup.key);
                      const groupImage = colourGroup.imageUrl ?? detailGroup.imageUrl;

                      return (
                        <section
                          key={colourGroup.key}
                          className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                        >
                          <div className="flex items-center border-b border-slate-200 bg-slate-50/80">
                            <button
                              type="button"
                              onClick={() => toggleColourGroup(colourGroup.key)}
                              className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-3 text-left transition hover:bg-slate-100"
                              aria-expanded={!collapsed}
                            >
                              <ChevronRight
                                size={15}
                                className={`shrink-0 text-slate-500 transition-transform ${
                                  collapsed ? "" : "rotate-90"
                                }`}
                              />
                              <span
                                className="h-6 w-6 shrink-0 rounded-full border border-slate-200 shadow-sm"
                                style={{ backgroundColor: getColourSwatchValue(colourGroup.label) }}
                                aria-hidden="true"
                              />
                              <span className="truncate text-sm font-bold text-slate-900">
                                {colourGroup.label}
                              </span>
                              <span className="shrink-0 text-xs font-medium text-slate-400">
                                · {colourGroup.rows.length} variant{colourGroup.rows.length === 1 ? "" : "s"}
                              </span>
                            </button>


                          </div>

                          {!collapsed && (
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[820px] text-xs">
                                <thead className="bg-white text-[10px] uppercase tracking-wide text-slate-400">
                                  <tr className="border-b border-slate-100">
                                    <th className="px-3 py-2 text-left font-semibold">Image</th>
                                    <th className="px-3 py-2 text-left font-semibold">Size</th>
                                    <th className="px-3 py-2 text-left font-semibold">Colour</th>
                                    <th className="px-3 py-2 text-left font-semibold">SKU</th>
                                    <th className="px-3 py-2 text-right font-semibold">Cost</th>
                                    <th className="px-3 py-2 text-right font-semibold">Price</th>
                                    <th className="px-3 py-2 text-left font-semibold">Stock</th>
                                    <th className="px-3 py-2 text-right font-semibold">Qty</th>
                                    <th className="px-3 py-2 text-left font-semibold">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {[...colourGroup.rows]
                                    .sort((a, b) => compareVariantRows(a, b))
                                    .map((row) => {
                                      const stockQty = Number(row.stock_quantity || 0);
                                      const lowStockQty = Number(row.low_stock_quantity || 0);
                                      const rowImage = row.variant_image_url ?? groupImage ?? row.image_url;

                                      return (
                                        <tr key={row.id} className="bg-white hover:bg-slate-50/60">
                                          <td className="px-3 py-2">
                                            {rowImage ? (
                                              <button type="button" onClick={() => setPhotoPreview(rowImage)} aria-label={`View ${colourGroup.label} ${row.size ?? ""} photo`} className="rounded-lg focus-visible:outline-2 focus-visible:outline-teal-600"><ProductPhoto sizes="36px"
                                                src={rowImage}
                                                alt={`${detailGroup.name} ${colourGroup.label} ${row.size ?? ""}`}
                                                loading="lazy"
                                                decoding="async"
                                                className="h-9 w-9 rounded-lg border border-slate-200 object-cover"
                                              />
                                              </button>
                                            ) : (
                                              <div className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-400">
                                                <Package size={13} />
                                              </div>
                                            )}
                                          </td>
                                          <td className="px-3 py-2 font-bold text-slate-800">{row.size || "—"}</td>
                                          <td className="px-3 py-2 text-slate-600">
                                            <span className="inline-flex items-center gap-1.5">
                                              <span
                                                className="h-3 w-3 rounded-full border border-slate-200"
                                                style={{ backgroundColor: getColourSwatchValue(colourGroup.label) }}
                                                aria-hidden="true"
                                              />
                                              {colourGroup.label}
                                            </span>
                                          </td>
                                          <td className="max-w-40 truncate px-3 py-2 font-mono text-[11px] text-slate-500">
                                            {row.sku || "—"}
                                          </td>
                                          <td className="px-3 py-2 text-right text-slate-600">
                                            {formatMoney(Number(row.cost_price || 0))}
                                          </td>
                                          <td className="px-3 py-2 text-right font-bold text-slate-800">
                                            {formatMoney(Number(row.selling_price || 0))}
                                          </td>
                                          <td className="px-3 py-2">
                                            <VariantStockBadge stock={stockQty} lowStock={lowStockQty} />
                                          </td>
                                          <td className="px-3 py-2 text-right font-semibold text-slate-600">
                                            {stockQty}
                                          </td>
                                          <td className="px-3 py-2">
                                            <span className={`inline-flex items-center gap-1.5 font-semibold ${
                                              row.is_active ? "text-slate-700" : "text-slate-400"
                                            }`}>
                                              <span className={`h-2 w-2 rounded-full ${
                                                row.is_active ? "bg-emerald-500" : "bg-slate-300"
                                              }`} />
                                              {row.is_active ? "Active" : "Hidden"}
                                            </span>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </section>
                      );
                    })}
                  </div>
                </div>
                )}

                {!isVariantMode && (
                  <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
                    <h4 className="text-sm font-bold text-slate-950">Product information</h4>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <GeneralInfo label="SKU" value={detailGroup.representative.sku || "—"} />
                      <GeneralInfo label="Barcode" value={detailGroup.representative.barcode || "—"} />
                      {isGeneralShop && (
                        <>
                          <GeneralInfo label="Color" value={detailGroup.representative.color || "—"} />
                          <GeneralInfo label="Size / option" value={detailGroup.representative.size || "—"} />
                        </>
                      )}
                    </div>

                    {isGeneralShop && detailGroup.rows.length > 1 && (
                      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
                        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
                          <p className="text-xs font-bold text-slate-800">Product options</p>
                          <p className="mt-0.5 text-[10px] text-slate-500">Each option keeps its own SKU, price and stock.</p>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[560px] text-xs">
                            <thead className="bg-white text-[10px] uppercase tracking-wide text-slate-400">
                              <tr className="border-b border-slate-100">
                                <th className="px-3 py-2 text-left font-semibold">Option</th>
                                <th className="px-3 py-2 text-left font-semibold">Color</th>
                                <th className="px-3 py-2 text-left font-semibold">SKU</th>
                                <th className="px-3 py-2 text-right font-semibold">Price</th>
                                <th className="px-3 py-2 text-right font-semibold">Stock</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {detailGroup.rows.map((row) => (
                                <tr key={row.id}>
                                  <td className="px-3 py-2 font-semibold text-slate-800">{row.size || "—"}</td>
                                  <td className="px-3 py-2 text-slate-600">{row.color || "—"}</td>
                                  <td className="px-3 py-2 font-mono text-[11px] text-slate-500">{row.sku || "—"}</td>
                                  <td className="px-3 py-2 text-right font-semibold text-slate-800">{formatMoney(Number(row.selling_price || 0))}</td>
                                  <td className="px-3 py-2 text-right font-semibold text-slate-700">{Number(row.stock_quantity || 0)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

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

      {photoPreview && detailGroup && typeof document !== "undefined" && createPortal(<ProductPhotoViewer key={photoPreview} images={detailPhotos} initialIndex={Math.max(0, detailPhotos.indexOf(photoPreview))} name={detailGroup.name} onClose={() => setPhotoPreview(null)} />, document.body)}

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
                {confirmState.groups ? `${confirmState.kind === "delete" ? "Delete" : "Hide"} ${confirmState.groups.reduce((sum, group) => sum + group.rows.length, 0)} selected items?` : confirmState.kind === "delete"
                  ? `Delete ${confirmState.group.name}?`
                  : `${confirmState.group.active ? "Hide" : "Unhide"} ${confirmState.group.name}?`}
              </h3>
              <p className="mt-1.5 text-sm leading-5 text-slate-500">
                {confirmState.kind === "delete"
                  ? "This removes the product/style from the current branch and automatically sets its remaining branch stock to zero in the same operation. Sales and inventory history are kept. Other branches are unchanged."
                  : (confirmState.groups || confirmState.group.active)
                    ? "This product/style will become inactive and be hidden from POS and online. You can unhide it from Actions."
                    : "This product/style will become active again in POS. Enable online visibility separately in Edit Product."}
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
                      : (confirmState.groups || confirmState.group.active) ? "Hide" : "Unhide"}
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
  eager,
  group,
  onMenu,
  onView,
  isGeneralShop = false,
  isVariantMode = false,
  selected = false, onToggle,
}: {
  eager: boolean;
  group: ProductGroup;
  onMenu: (event: ReactMouseEvent<HTMLButtonElement>, group: ProductGroup) => void;
  onView: () => void;
  isGeneralShop?: boolean;
  isVariantMode?: boolean;
  selected?: boolean; onToggle?: () => void;
}) {
  return (
    <div onClick={(event) => { if (!(event.target as HTMLElement).closest("button, input, a, label")) onView(); }} className="cursor-pointer rounded-xl border border-slate-200 bg-white p-3 transition hover:border-blue-200 hover:shadow-sm">
      {onToggle && <label className="mb-2 flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" aria-label={`Select ${group.name}`} checked={selected} onChange={onToggle} /> Select product</label>}
      <div className="flex items-start gap-3">
        <button type="button" onClick={onView} aria-label={`View ${group.name}`} className="flex min-w-0 flex-1 items-start gap-3 text-left focus-visible:outline-2 focus-visible:outline-teal-600">
          {group.imageUrl ? <ProductPhoto loading={eager ? 'eager' : 'lazy'} src={group.imageUrl} alt={group.name} sizes="56px" className="h-14 w-14 rounded-xl border border-slate-200 object-cover" /> : <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><Package size={20} /></div>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{group.name}</p>
            <p className="mt-0.5 text-xs text-slate-400">{group.category}</p>
            <div className="mt-2 flex flex-wrap gap-1.5"><StatusBadge group={group} /></div>
          </div>
        </button>
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
        <div>
          <p className="text-[10px] text-slate-400">
            {isVariantMode ? "Variants" : isGeneralShop ? "Barcode" : "SKU"}
          </p>
          <p className="truncate text-xs font-semibold text-slate-800">
            {isVariantMode
              ? group.variants
              : isGeneralShop
                ? group.variants > 1
                  ? `${group.variants} options`
                  : group.representative.barcode || "—"
                : group.sku || "—"}
          </p>
        </div>
        <div><p className="text-[10px] text-slate-400">Stock</p><p className="text-xs font-semibold text-slate-800">{group.totalStock}</p></div>
        <div><p className="text-[10px] text-slate-400">Price</p><p className="text-xs font-semibold text-slate-800">{formatMoney(group.minPrice)}</p></div>
      </div>
    </div>
  );
}

function GeneralInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-slate-800" title={value}>{value}</p>
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

function groupVariantRowsByColour(rows: Product[]) {
  const grouped = new Map<string, { label: string; rows: Product[] }>();

  for (const row of rows) {
    const label = row.color?.trim() || "No colour";
    const key = label.toLocaleLowerCase();
    const current = grouped.get(key) ?? { label, rows: [] };
    current.rows.push(row);
    grouped.set(key, current);
  }

  return Array.from(grouped.entries())
    .map(([key, group]) => ({
      key,
      label: group.label,
      rows: group.rows,
      imageUrl:
        group.rows.find((row) => row.variant_image_url)?.variant_image_url ??
        group.rows.find((row) => row.image_url)?.image_url ??
        null,
    }))
    .sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }),
    );
}

function getColourSwatchValue(value: string) {
  const normalized = value.trim().toLowerCase();
  const swatches: Record<string, string> = {
    black: "#111827",
    white: "#ffffff",
    red: "#dc2626",
    blue: "#2563eb",
    navy: "#1e3a8a",
    green: "#16a34a",
    yellow: "#eab308",
    orange: "#ea580c",
    pink: "#ec4899",
    purple: "#9333ea",
    violet: "#7c3aed",
    brown: "#92400e",
    beige: "#d6c3a1",
    grey: "#94a3b8",
    gray: "#94a3b8",
    silver: "#cbd5e1",
    gold: "#d4a017",
    cream: "#fff7d6",
    "no colour": "#e2e8f0",
  };

  if (/^#[0-9a-f]{3,8}$/i.test(value.trim())) return value.trim();
  return swatches[normalized] ?? "#cbd5e1";
}

function VariantStockBadge({ stock, lowStock }: { stock: number; lowStock: number }) {
  if (stock <= 0) {
    return (
      <span className="inline-flex rounded-full bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-700">
        Out of stock
      </span>
    );
  }

  if (stock <= lowStock) {
    return (
      <span className="inline-flex rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">
        Low stock
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
      In stock
    </span>
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
