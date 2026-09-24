"use client";

import ProductPhoto from '@/components/product-photo';

import CatalogProductEditor from "./catalog-product-editor";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Package, Search, Eye, EyeOff, TriangleAlert, RefreshCw, List, LayoutGrid } from "lucide-react";
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

export default function CatalogManager({ products, categories, currency, canEdit, storeUrl, featuredIds = [] }: {
  products: ManagedProduct[]; categories: ManagedCategory[]; currency: string; canEdit: boolean; storeUrl: string; featuredIds?: string[];
}) {
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
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.success) toast.error(result.message);
        else { toast.success(result.message); setSelected([]); router.refresh(); }
      } catch { toast.error("Unable to update products. Please try again."); }
    });
  }
  function bulk(field: "visibility" | "featured", enabled: boolean, ids = selected) { run(() => updateCatalogProducts(ids, field, enabled)); }
  function select(id: string, checked: boolean) { setSelected(old => checked ? [...new Set([...old, id])].slice(0, 100) : old.filter(value => value !== id)); }
  const money = (price: number) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(price);
  const badge = (product: ManagedProduct) => <span className={`whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-semibold ${featured.has(product.id) ? "bg-violet-50 text-violet-700" : product.stock_quantity <= 0 ? "bg-red-50 text-red-600" : product.stock_quantity <= 5 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{featured.has(product.id) ? "Pre-order" : product.stock_quantity <= 0 ? "Out of stock" : product.stock_quantity <= 5 ? "Low stock" : "In stock"}</span>;
  const photo = (product: ManagedProduct) => product.variant_image_url || product.image_url ? <ProductPhoto src={(product.variant_image_url || product.image_url)!} alt="" sizes={grid ? "240px" : "40px"} className={grid ? "h-32 w-full rounded-lg bg-slate-50 object-contain" : "h-10 w-10 shrink-0 rounded-lg bg-slate-50 object-contain"} /> : <Package className={grid ? "h-32 w-full bg-slate-50 p-10 text-slate-300" : "h-10 w-10 shrink-0 rounded-lg bg-slate-50 p-2 text-slate-300"} />;
  const online = (product: ManagedProduct) => <input aria-label={`Show ${product.name} ${product.sku ?? ""} online`} type="checkbox" role="switch" checked={product.is_online} disabled={!canEdit || pending} onChange={event => bulk("visibility", event.target.checked, [product.id])} className="h-4 w-8 cursor-pointer appearance-none rounded-full bg-slate-300 transition-colors before:block before:h-3 before:w-3 before:translate-x-0.5 before:translate-y-0.5 before:rounded-full before:bg-white before:transition-transform checked:bg-blue-600 checked:before:translate-x-[18px] disabled:opacity-40" />;
  const preorderToggle = (product: ManagedProduct) => <input type="checkbox" role="switch" aria-label={`Mark ${product.name} ${product.sku ?? ""} as Pre-order`} checked={featured.has(product.id)} disabled={!canEdit || pending} onChange={event => bulk("featured", event.target.checked, [product.id])} className="h-4 w-8 cursor-pointer appearance-none rounded-full bg-slate-300 transition-colors before:block before:h-3 before:w-3 before:translate-x-0.5 before:translate-y-0.5 before:rounded-full before:bg-white before:transition-transform checked:bg-violet-600 checked:before:translate-x-[18px] disabled:opacity-40" />;
  return <section className="bg-white p-4 sm:p-6" id="catalog" aria-busy={pending}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs text-slate-500">Online Store</p><h2 id="catalog-dialog-title" className="text-xl font-bold text-slate-900">Storefront Products</h2><p className="mt-1 text-xs text-slate-500">Control your online catalog. One shared online catalog and price; stock is fulfilled by eligible branches.</p></div>
      <div className="flex gap-2"><a href={storeUrl} target="_blank" rel="noreferrer" className={control}>Preview store</a><Link href="/dashboard/products" className={`${control} !bg-blue-600 text-white`}>Manage products</Link></div>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
      {[{ icon: Eye, value: visibleCount, title: "Visible products", note: "Shown on your online store" }, { icon: EyeOff, value: products.length - visibleCount, title: "Hidden products", note: "Not visible to customers" }, { icon: TriangleAlert, value: products.filter(p => p.stock_quantity > 0 && p.stock_quantity <= 5).length, title: "Low stock", note: "Stock is 5 or less" }, { icon: RefreshCw, value: products.length, title: "Synced with inventory", note: "Active products and variants" }].map(item => <div key={item.title} className="flex gap-3 rounded-lg border border-slate-200 p-3"><item.icon size={20} className="mt-1 shrink-0 text-blue-600" /><div><strong className="text-lg">{item.value}</strong><p className="text-xs font-semibold">{item.title}</p><p className="text-[10px] text-slate-500">{item.note}</p></div></div>)}
    </div>
    <div className="my-3 flex flex-wrap gap-2">{[{ id: "all", name: "All products" }, ...categories].map(item => <button type="button" key={item.id} onClick={() => filter(setCategory, item.id)} className={`rounded-full border px-3 py-1.5 text-xs ${category === item.id ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200"}`}>{item.name} <span className="ml-1 text-slate-500">{item.id === "all" ? products.length : products.filter(p => p.category_id === item.id).length}</span></button>)}</div>
    <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">Changes save instantly. Hidden categories keep their products hidden, even when individual products are enabled.</div>
    <details className="mt-2 text-xs text-slate-600"><summary className="cursor-pointer">Category visibility</summary><div className="mt-2 flex flex-wrap gap-3">{categories.map(item => <label key={item.id} className="flex items-center gap-2"><input type="checkbox" checked={item.is_online} disabled={!canEdit || pending} onChange={event => run(() => setCatalogVisibility("category", item.id, event.target.checked))} />{item.name}</label>)}</div></details>
    <div className="mt-3 flex flex-wrap gap-2">
      <label className="flex min-w-48 flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3"><Search size={15} /><input aria-label="Search store inventory" placeholder="Search products, SKU, size or color..." value={search} onChange={e => filter(setSearch, e.target.value)} className="h-10 w-full bg-transparent text-xs outline-none" /></label>
      <select aria-label="Filter category" value={category} onChange={e => filter(setCategory, e.target.value)} className={control}><option value="all">All categories</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select aria-label="Filter product visibility" value={visibility} onChange={e => filter(setVisibility, e.target.value)} className={control}><option value="all">All products</option><option value="visible">Visible online</option><option value="hidden">Hidden online</option></select>
      <select aria-label="Filter stock" value={stock} onChange={e => filter(setStock, e.target.value)} className={control}><option value="all">All stock</option><option value="in">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option></select>
      <select aria-label="Sort products" value={sort} onChange={e => filter(setSort, e.target.value)} className={control}><option value="featured">Pre-order first</option><option value="name">Name</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select>
      <button type="button" aria-label="List view" aria-pressed={!grid} onClick={() => setGrid(false)} className={control}><List size={16} /></button><button type="button" aria-label="Grid view" aria-pressed={grid} onClick={() => setGrid(true)} className={control}><LayoutGrid size={16} /></button>
    </div>
    <div className="my-3 flex flex-wrap items-center gap-2 text-xs"><label className="mr-2 flex items-center gap-2"><input type="checkbox" aria-label="Select current page" checked={shown.length > 0 && shown.every(p => selected.includes(p.id))} disabled={!canEdit || pending} onChange={e => setSelected(e.target.checked ? shown.map(p => p.id) : [])} />{selected.length ? `${selected.length} selected` : "Select page"}</label>{[{ label: "Show online", field: "visibility", value: true }, { label: "Hide", field: "visibility", value: false }, { label: "Mark as Pre-order", field: "featured", value: true }, { label: "Remove Pre-order", field: "featured", value: false }].map(item => <button key={item.label} type="button" className={control} disabled={!canEdit || pending || !selected.length} onClick={() => bulk(item.field as "visibility" | "featured", item.value)}>{item.label}</button>)}</div>
    {grid ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{shown.map(product => <article key={product.id} className="rounded-xl border border-slate-200 p-3"><div className="mb-2 flex items-center justify-between"><input aria-label={`Select ${product.name} ${product.sku ?? ""}`} type="checkbox" disabled={!canEdit || pending} checked={selected.includes(product.id)} onChange={e => select(product.id, e.target.checked)} />{badge(product)}{preorderToggle(product)}</div>{photo(product)}<CatalogProductEditor product={product} disabled={!canEdit || pending}/><p className="my-1 text-xs text-slate-500">{[product.sku, product.size, product.color].filter(Boolean).join(" / ")}</p><div className="flex items-center justify-between text-xs"><span>{money(product.selling_price)} / {product.stock_quantity} in stock</span>{online(product)}</div></article>)}</div> : <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr>{["", "Product", "Category", "Price", "Stock", "Status", "Online", "Pre-order", "Actions"].map((label, index) => <th key={index} className="whitespace-nowrap p-2">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{shown.map(product => <tr key={product.id}><td className="p-2"><input aria-label={`Select ${product.name} ${product.sku ?? ""}`} type="checkbox" disabled={!canEdit || pending} checked={selected.includes(product.id)} onChange={e => select(product.id, e.target.checked)} /></td><td className="p-2"><div className="flex min-w-44 items-center gap-2">{photo(product)}<div><CatalogProductEditor product={product} disabled={!canEdit || pending}/><p className="text-[10px] text-slate-500">{[product.sku, product.size, product.color].filter(Boolean).join(" / ")}</p>{product.is_online && !isVisible(product) && <p className="text-amber-600">Hidden by category</p>}</div></div></td><td className="p-2"><span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] text-blue-700">{categoryMap.get(product.category_id ?? "")?.name ?? "Uncategorized"}</span></td><td className="whitespace-nowrap p-2">{money(product.selling_price)}</td><td className="p-2">{product.stock_quantity}</td><td className="p-2">{badge(product)}</td><td className="p-2">{online(product)}</td><td className="p-2">{preorderToggle(product)}</td><td className="p-2"><CatalogProductEditor product={product} disabled={!canEdit || pending} icon/></td></tr>)}</tbody></table></div>}
    {!rows.length && <p className="p-8 text-center text-sm text-slate-500">{products.length ? "No matching products." : "Add products in your inventory to build your online catalog."}</p>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"><span>Showing {rows.length ? (currentPage - 1) * pageSize + 1 : 0}-{Math.min(currentPage * pageSize, rows.length)} of {rows.length} products</span><div className="flex items-center gap-2"><label>Rows per page <select className={control} value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>{[10, 25, 50].map(size => <option key={size}>{size}</option>)}</select></label><button type="button" className={control} disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>{currentPage} / {pages}</span><button type="button" className={control} disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button></div></div>
  </section>;
}
