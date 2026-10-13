"use client";
import { useLanguage } from "@/components/providers/language-provider";
import { formatUiText } from "@/lib/i18n/translations";

import ProductPhoto from '@/components/product-photo';
import "./catalog-responsive.css";
import AnchoredActionMenu from "@/components/anchored-action-menu";

import CatalogProductEditor from "./catalog-product-editor";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Package, Search, Eye, EyeOff, TriangleAlert, RefreshCw, List, LayoutGrid, SlidersHorizontal, X, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setCatalogVisibility, updateCatalogProducts } from "./catalog-actions";

export type ManagedProduct = {
  id: string; name: string; sku: string | null; size: string | null; color: string | null;
  image_url: string | null; variant_image_url: string | null;
  selling_price: number; stock_quantity: number; is_online: boolean; category_id: string | null;
};
export type ManagedCategory = { id: string; name: string; is_online: boolean };
const control = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs disabled:opacity-40";

export default function CatalogManager({ products, categories, currency, canEdit, featuredIds = [], onChanged }: {
  products: ManagedProduct[]; categories: ManagedCategory[]; currency: string; canEdit: boolean; featuredIds?: string[]; onChanged?: () => void;
}) {
  const { t: translateLabel } = useLanguage();

  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState("all");
  const [category, setCategory] = useState("all");
  const [stock, setStock] = useState("all");
  const [sort, setSort] = useState("featured");
  const [grid, setGrid] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const details = useRef<HTMLDialogElement>(null);
  const filters = useRef<HTMLDialogElement>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [filterDraft, setFilterDraft] = useState({ category, visibility, stock, sort });
  const [saveNotice, setSaveNotice] = useState<{ success: boolean; message: string } | null>(null);
  const detail = products.find(product => product.id === detailId);
  const router = useRouter();
  const categoryMap = new Map(categories.map(item => [item.id, item]));
  const featured = new Set(featuredIds);
  const isVisible = (product: ManagedProduct) => product.is_online && (!product.category_id || categoryMap.get(product.category_id)?.is_online !== false);
  const visibleCount = products.filter(isVisible).length;
  const rows = products.filter(product => {
    const matches = [product.name, product.sku, product.size, product.color].join(" ").toLowerCase().includes(search.trim().toLowerCase());
    return matches && (category === "all" || product.category_id === category) &&
      (visibility === "all" || (visibility === "visible" ? isVisible(product) : !isVisible(product))) &&
      (stock === "all" || (stock === "out" ? product.stock_quantity <= 0 : stock === "low" ? product.stock_quantity > 0 && product.stock_quantity <= 5 : product.stock_quantity > 0));
  }).sort((a, b) => sort === "price-low" ? a.selling_price - b.selling_price : sort === "price-high" ? b.selling_price - a.selling_price : sort === "name" ? a.name.localeCompare(b.name) : Number(featured.has(b.id)) - Number(featured.has(a.id)));
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pages);
  const shown = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  function filter(setter: (value: string) => void, value: string) { setter(value); setPage(1); }
  function run(action: () => Promise<{ success: boolean; message: string }>) {
    setSaveNotice(null);
    startTransition(async () => {
      try {
        const result = await action();
        setSaveNotice(result);
        if (!result.success) toast.error(result.message);
        else { toast.success(result.message); setSelected([]); if (onChanged) onChanged(); else router.refresh(); }
      } catch { const message = "Unable to update products. Please try again."; setSaveNotice({ success: false, message }); toast.error(message); }
    });
  }
  function bulk(field: "visibility" | "featured", enabled: boolean, ids = selected) { run(() => updateCatalogProducts(ids, field, enabled)); }
  function select(id: string, checked: boolean) { setSelected(old => checked ? [...new Set([...old, id])].slice(0, 100) : old.filter(value => value !== id)); }
  const money = (price: number) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(price);
  const badge = (product: ManagedProduct) => <span className={`whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-semibold ${featured.has(product.id) ? "bg-violet-50 text-violet-700" : product.stock_quantity <= 0 ? "bg-red-50 text-red-600" : product.stock_quantity <= 5 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{featured.has(product.id) ? "Pre-order" : product.stock_quantity <= 0 ? "Out of stock" : product.stock_quantity <= 5 ? "Low stock" : "In stock"}</span>;
  const photo = (product: ManagedProduct) => product.variant_image_url || product.image_url ? <ProductPhoto src={(product.variant_image_url || product.image_url)!} alt="" sizes={grid ? "240px" : "40px"} className={grid ? "h-32 w-full rounded-lg bg-slate-50 object-contain" : "h-10 w-10 shrink-0 rounded-lg bg-slate-50 object-contain"} /> : <Package className={grid ? "h-32 w-full bg-slate-50 p-10 text-slate-300" : "h-10 w-10 shrink-0 rounded-lg bg-slate-50 p-2 text-slate-300"} />;
  const online = (product: ManagedProduct) => <input aria-label={formatUiText(translateLabel("Show {0} {1} online"), [product.name, product.sku ?? ("")])} type="checkbox" role="switch" checked={product.is_online} disabled={!canEdit || pending} onChange={event => bulk("visibility", event.target.checked, [product.id])} className="h-4 w-8 cursor-pointer appearance-none rounded-full bg-slate-300 transition-colors before:block before:h-3 before:w-3 before:translate-x-0.5 before:translate-y-0.5 before:rounded-full before:bg-white before:transition-transform checked:bg-blue-600 checked:before:translate-x-[18px] disabled:opacity-40"  data-i18n-ignore-attributes="aria-label"/>;
  const preorderToggle = (product: ManagedProduct) => <input type="checkbox" role="switch" aria-label={formatUiText(translateLabel("Mark {0} {1} as Pre-order"), [product.name, product.sku ?? ("")])} checked={featured.has(product.id)} disabled={!canEdit || pending} onChange={event => bulk("featured", event.target.checked, [product.id])} className="h-4 w-8 cursor-pointer appearance-none rounded-full bg-slate-300 transition-colors before:block before:h-3 before:w-3 before:translate-x-0.5 before:translate-y-0.5 before:rounded-full before:bg-white before:transition-transform checked:bg-violet-600 checked:before:translate-x-[18px] disabled:opacity-40"  data-i18n-ignore-attributes="aria-label"/>;
  return <section className="storefront-catalog bg-white p-4 sm:p-6" id="catalog" aria-busy={pending}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs text-slate-500">Online Store</p><h2 id="catalog-dialog-title" className="text-xl font-bold text-slate-900">Storefront Products</h2><p className="mt-1 text-xs text-slate-500">Control your online catalog. One shared online catalog and price; stock is fulfilled by eligible branches.</p></div>
      <div className="flex gap-2"><Link href="/dashboard/products" className={`${control} !bg-blue-600 text-white`}>Manage products</Link></div>
    </div>
    <div className="catalog-summaries mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
      {[{ icon: Eye, value: visibleCount, title: "Visible products", note: "Shown on your online store" }, { icon: EyeOff, value: products.length - visibleCount, title: "Hidden products", note: "Not visible to customers" }, { icon: TriangleAlert, value: products.filter(p => p.stock_quantity > 0 && p.stock_quantity <= 5).length, title: "Low stock", note: "Stock is 5 or less" }, { icon: RefreshCw, value: products.length, title: "Synced with inventory", note: "Active products and variants" }].map(item => <div key={item.title} className="flex gap-3 rounded-lg border border-slate-200 p-3"><item.icon size={20} className="mt-1 shrink-0 text-blue-600" /><div><strong className="text-lg">{item.value}</strong><p className="text-xs font-semibold"><span className="catalog-summary-long">{item.title}</span><span className="catalog-summary-short">{item.title === "Visible products" ? "Visible" : item.title === "Hidden products" ? "Hidden" : item.title === "Synced with inventory" ? "Synced" : item.title}</span></p><p className="text-[10px] text-slate-500" data-i18n-ignore="true">{item.note}</p></div></div>)}
    </div>
    <div className="catalog-category-chips my-3 flex flex-wrap gap-2">{[{ id: "all", name: "All products" }, ...categories].map(item => <button type="button" key={item.id} onClick={() => filter(setCategory, item.id)} className={`rounded-full border px-3 py-1.5 text-xs ${category === item.id ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200"}`}><span data-i18n-ignore={item.id !== "all"}>{item.name}</span> <span className="ml-1 text-slate-500">{item.id === "all" ? products.length : products.filter(p => p.category_id === item.id).length}</span></button>)}</div>
    <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">Changes save instantly. Hidden categories keep their products hidden, even when individual products are enabled.</div>
    <details className="mt-2 text-xs text-slate-600"><summary className="cursor-pointer">Category visibility</summary><p className="catalog-more-info">Control your online catalog. One shared online catalog and price; stock is fulfilled by eligible branches. Changes save instantly. Hidden categories keep their products hidden, even when individual products are enabled.</p><div className="mt-2 flex flex-wrap gap-3">{categories.map(item => <label key={item.id} className="flex items-center gap-2"><input type="checkbox" checked={item.is_online} disabled={!canEdit || pending} onChange={event => run(() => setCatalogVisibility("category", item.id, event.target.checked))} /><span data-i18n-ignore="true">{item.name}</span></label>)}</div></details>
    <div className="catalog-toolbar mt-3 flex flex-wrap gap-2">
      <label className="flex min-w-48 flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3"><Search size={15} /><input aria-label="Search store inventory" placeholder="Search products, SKU, size or color..." value={search} onChange={e => filter(setSearch, e.target.value)} className="h-10 w-full bg-transparent text-xs outline-none" /></label>
      <select aria-label="Filter category" value={category} onChange={e => filter(setCategory, e.target.value)} className={control}><option value="all">All categories</option>{categories.map(item => <option key={item.id} value={item.id} data-i18n-ignore="true">{item.name}</option>)}</select>
      <select aria-label="Filter product visibility" value={visibility} onChange={e => filter(setVisibility, e.target.value)} className={control}><option value="all">All products</option><option value="visible">Visible online</option><option value="hidden">Hidden online</option></select>
      <select aria-label="Filter stock" value={stock} onChange={e => filter(setStock, e.target.value)} className={control}><option value="all">All stock</option><option value="in">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option></select>
      <select aria-label="Sort products" value={sort} onChange={e => filter(setSort, e.target.value)} className={control}><option value="featured">Pre-order first</option><option value="name">Name</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select>
      <button type="button" aria-label="List view" aria-pressed={!grid} onClick={() => setGrid(false)} className={control}><List size={16} /></button><button type="button" aria-label="Grid view" aria-pressed={grid} onClick={() => setGrid(true)} className={control}><LayoutGrid size={16} /></button>
      <button type="button" className={`catalog-compact ${control}`} aria-label="Filter products" onClick={() => { setFilterDraft({ category, visibility, stock, sort }); filters.current?.showModal(); }}><SlidersHorizontal size={18} /><span className="catalog-tablet-label">Filter</span></button>
      <button type="button" className={`catalog-compact ${control}`} aria-label={grid ? "List view" : "Grid view"} onClick={() => setGrid(!grid)}>{grid ? <List size={18} /> : <LayoutGrid size={18} />}</button>
    </div>
    <div className="catalog-compact catalog-selection">
      <label><input type="checkbox" aria-label="Select current page" checked={shown.length > 0 && shown.every(p => selected.includes(p.id))} disabled={!canEdit || pending} onChange={e => setSelected(e.target.checked ? shown.map(p => p.id) : [])} /><span>{selected.length ? formatUiText(translateLabel("{0} selected"), [String(selected.length)]) : translateLabel("Select page")}</span></label>
      <AnchoredActionMenu label="Actions" disabled={!canEdit || pending || !selected.length}>{[{ label: "Show online", field: "visibility", value: true }, { label: "Hide", field: "visibility", value: false }, { label: "Mark as Pre-order", field: "featured", value: true }, { label: "Remove Pre-order", field: "featured", value: false }].map(item => <button key={item.label} type="button" className={control} onClick={() => bulk(item.field as "visibility" | "featured", item.value)}>{item.label}</button>)}</AnchoredActionMenu>
    </div>
    <div className={`catalog-compact catalog-rows ${grid ? "catalog-grid" : ""}`}>
      {shown.map(product => <article key={product.id} className="catalog-row">
        <label className="catalog-row-select"><input aria-label={formatUiText(translateLabel("Select {0} {1}"), [product.name, product.sku ?? ""])} type="checkbox" disabled={!canEdit || pending} checked={selected.includes(product.id)} onChange={e => select(product.id, e.target.checked)} data-i18n-ignore-attributes="aria-label" /></label>
        <button type="button" className="catalog-row-details" aria-label={formatUiText(translateLabel("Product details: {0}"), [product.name])} data-i18n-ignore-attributes="aria-label" onClick={() => { setDetailId(product.id); details.current?.showModal(); }}>
          {photo(product)}<span className="catalog-row-name"><strong data-i18n-ignore="true">{product.name || product.sku}</strong><span data-i18n-ignore="true">{[product.sku, product.color, product.size].filter(Boolean).join(" / ")}</span>{product.is_online && !isVisible(product) && <span>Hidden by category</span>}</span>
          <span className="catalog-row-price"><strong>{money(product.selling_price)}</strong><span>{translateLabel("Stock")}: {product.stock_quantity}</span></span>{badge(product)}<ChevronRight size={16} className="shrink-0" />
        </button>
        <div className="catalog-row-toggles"><label><span>Online</span>{online(product)}</label><label><span>Pre-order</span>{preorderToggle(product)}</label></div>
      </article>)}
    </div>
    <div className="catalog-desktop">
    <div className="my-3 flex flex-wrap items-center gap-2 text-xs"><label className="mr-2 flex items-center gap-2"><input type="checkbox" aria-label="Select current page" checked={shown.length > 0 && shown.every(p => selected.includes(p.id))} disabled={!canEdit || pending} onChange={e => setSelected(e.target.checked ? shown.map(p => p.id) : [])} />{selected.length ? `${selected.length} selected` : "Select page"}</label>{[{ label: "Show online", field: "visibility", value: true }, { label: "Hide", field: "visibility", value: false }, { label: "Mark as Pre-order", field: "featured", value: true }, { label: "Remove Pre-order", field: "featured", value: false }].map(item => <button key={item.label} type="button" className={control} disabled={!canEdit || pending || !selected.length} onClick={() => bulk(item.field as "visibility" | "featured", item.value)}>{item.label}</button>)}</div>
    {grid ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{shown.map(product => <article key={product.id} className="rounded-xl border border-slate-200 p-3"><div className="mb-2 flex items-center justify-between"><input aria-label={formatUiText(translateLabel("Select {0} {1}"), [product.name, product.sku ?? ("")])} type="checkbox" disabled={!canEdit || pending} checked={selected.includes(product.id)} onChange={e => select(product.id, e.target.checked)}  data-i18n-ignore-attributes="aria-label"/>{badge(product)}{preorderToggle(product)}</div>{photo(product)}<CatalogProductEditor onSaved={onChanged} product={product} disabled={!canEdit || pending}/><p className="my-1 text-xs text-slate-500" data-i18n-ignore="true">{[product.sku, product.size, product.color].filter(Boolean).join(" / ")}</p><div className="flex items-center justify-between text-xs"><span>{money(product.selling_price)} / {product.stock_quantity} in stock</span>{online(product)}</div></article>)}</div> : <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr>{["", "Product", "Category", "Price", "Stock", "Status", "Online", "Pre-order", "Actions"].map((label, index) => <th key={index} className="whitespace-nowrap p-2">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{shown.map(product => <tr key={product.id}><td className="p-2"><input aria-label={formatUiText(translateLabel("Select {0} {1}"), [product.name, product.sku ?? ("")])} type="checkbox" disabled={!canEdit || pending} checked={selected.includes(product.id)} onChange={e => select(product.id, e.target.checked)}  data-i18n-ignore-attributes="aria-label"/></td><td className="p-2"><div className="flex min-w-44 items-center gap-2">{photo(product)}<div><CatalogProductEditor onSaved={onChanged} product={product} disabled={!canEdit || pending}/><p className="text-[10px] text-slate-500" data-i18n-ignore="true">{[product.sku, product.size, product.color].filter(Boolean).join(" / ")}</p>{product.is_online && !isVisible(product) && <p className="text-amber-600">Hidden by category</p>}</div></div></td><td className="p-2"><span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] text-blue-700" data-i18n-ignore={Boolean(categoryMap.get(product.category_id ?? "")?.name)}>{categoryMap.get(product.category_id ?? "")?.name ?? "Uncategorized"}</span></td><td className="whitespace-nowrap p-2">{money(product.selling_price)}</td><td className="p-2">{product.stock_quantity}</td><td className="p-2">{badge(product)}</td><td className="p-2">{online(product)}</td><td className="p-2">{preorderToggle(product)}</td><td className="p-2"><CatalogProductEditor onSaved={onChanged} product={product} disabled={!canEdit || pending} icon/></td></tr>)}</tbody></table></div>}
    {!rows.length && <p className="p-8 text-center text-sm text-slate-500">{products.length ? "No matching products." : "Add products in your inventory to build your online catalog."}</p>}
    </div>
    {!rows.length && <p className="catalog-compact p-6 text-center text-sm text-slate-500">{products.length ? "No matching products." : "Add products in your inventory to build your online catalog."}</p>}
    <p className="catalog-compact text-xs" role={saveNotice?.success === false ? "alert" : "status"}>{pending ? "Saving…" : saveNotice?.message}</p>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"><span>Showing {rows.length ? (currentPage - 1) * pageSize + 1 : 0}-{Math.min(currentPage * pageSize, rows.length)} of {rows.length} products</span><div className="flex items-center gap-2"><label>Rows per page <select className={control} value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>{[10, 25, 50].map(size => <option key={size} data-i18n-ignore="true">{size}</option>)}</select></label><button type="button" className={control} disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>{currentPage} / {pages}</span><button type="button" className={control} disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button></div></div>
    <dialog ref={filters} className="catalog-filter-panel" aria-labelledby="catalog-filter-title">
      <form onSubmit={event => { event.preventDefault(); setCategory(filterDraft.category); setVisibility(filterDraft.visibility); setStock(filterDraft.stock); setSort(filterDraft.sort); setPage(1); filters.current?.close(); }}>
        <h3 id="catalog-filter-title" className="text-lg font-bold">Filter products</h3>
        {[{ key: "category", label: "Filter category", options: [{ value: "all", label: "All categories" }, ...categories.map(c => ({ value: c.id, label: c.name }))] }, { key: "visibility", label: "Filter product visibility", options: [{ value: "all", label: "All products" }, { value: "visible", label: "Visible online" }, { value: "hidden", label: "Hidden online" }] }, { key: "stock", label: "Filter stock", options: [{ value: "all", label: "All stock" }, { value: "in", label: "In stock" }, { value: "low", label: "Low stock" }, { value: "out", label: "Out of stock" }] }, { key: "sort", label: "Sort products", options: [{ value: "featured", label: "Pre-order first" }, { value: "name", label: "Name" }, { value: "price-low", label: "Price: low to high" }, { value: "price-high", label: "Price: high to low" }] }].map(field => <label key={field.key}>{field.label}<select aria-label={field.label} required value={filterDraft[field.key as keyof typeof filterDraft]} onChange={e => setFilterDraft(old => ({ ...old, [field.key]: e.target.value }))}>{field.options.map(option => <option key={option.value} value={option.value} data-i18n-ignore={field.key === "category" && option.value !== "all"}>{option.label}</option>)}</select></label>)}
        <div className="flex justify-end gap-3"><button type="button" className={control} onClick={() => filters.current?.close()}>Cancel</button><button className={`${control} bg-blue-600 text-white`}>Apply</button></div>
      </form>
    </dialog>
    <dialog ref={details} className="catalog-details-panel" aria-labelledby="catalog-details-title">
      <header className="flex items-center justify-between gap-3"><h3 id="catalog-details-title" className="text-lg font-bold">Product details</h3><button type="button" aria-label="Close product details" className="min-h-11 min-w-11" onClick={() => details.current?.close()}><X size={20} /></button></header>
      {detail ? <><div className="catalog-detail-identity">{photo(detail)}<div><h4 className="break-words font-bold" data-i18n-ignore="true">{detail.name}</h4><p data-i18n-ignore="true">{[detail.sku, detail.color, detail.size].filter(Boolean).join(" / ")}</p><p data-i18n-ignore={Boolean(categoryMap.get(detail.category_id ?? "")?.name)}>{categoryMap.get(detail.category_id ?? "")?.name ?? "Uncategorized"}</p></div></div>
        <dl className="grid grid-cols-2 gap-3"><div><dt>Price</dt><dd className="font-bold">{money(detail.selling_price)}</dd></div><div><dt>Stock</dt><dd className="font-bold">{detail.stock_quantity}</dd></div></dl>
        <label className="catalog-detail-toggle"><span>Online</span>{online(detail)}</label><label className="catalog-detail-toggle"><span>Pre-order</span>{preorderToggle(detail)}</label>
        {detail.is_online && !isVisible(detail) && <p>Hidden by category</p>}
        <p className="text-xs text-slate-500">Changes save instantly. Hidden categories keep their products hidden, even when individual products are enabled.</p>
        <div className="flex items-center gap-3"><span>Edit</span><CatalogProductEditor product={detail} disabled={!canEdit || pending} onSaved={onChanged} icon /></div>
      </> : <p>No matching products.</p>}
      <p role={saveNotice?.success === false ? "alert" : "status"} className={saveNotice?.success === false ? "text-red-600" : "text-slate-500"}>{pending ? "Saving…" : saveNotice?.message}</p>
    </dialog>
  </section>;
}
