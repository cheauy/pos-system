"use client";
import { ImageViewer } from "./image-viewer";

import { Eye, Sparkles, Award, ChevronDown, Grid2X2, List, Package, Search, ShoppingCart, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { StorefrontCatalogCategory, StorefrontCatalogProduct } from "@/lib/storefront/catalog-types";

import { useStorefrontLanguage } from "./storefront-language";

type CatalogSettings = { currency: string; orderingEnabled: boolean };
export default function StorefrontCatalog({ categories, products, settings, onAdd, onQuickView }: {
  categories: StorefrontCatalogCategory[]; products: StorefrontCatalogProduct[];
  onQuickView?: (product: StorefrontCatalogProduct, variantId?: string) => void;
  settings: CatalogSettings; onAdd: (product: StorefrontCatalogProduct, variantId?: string) => void;
}) {
  const { t } = useStorefrontLanguage();
  const [newOnly, setNewOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("featured");
  const [inStock, setInStock] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [limit, setLimit] = useState(24);
  useEffect(() => {
    function followCollectionLink() {
      const hash = window.location.hash;
      if (hash !== "#new-arrivals" && hash !== "#store-products" && !hash.startsWith("#category-")) return;
      setNewOnly(hash === "#new-arrivals");
      setCategory(hash.startsWith("#category-") ? decodeURIComponent(hash.slice(10)) : "all");
      setQuery(""); setLimit(24);
      document.getElementById("store-products")?.scrollIntoView({ block: "start" });
    }
    function onCollectionClick(event: MouseEvent) {
      const link = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
      if (link) requestAnimationFrame(followCollectionLink);
    }
    const frame = requestAnimationFrame(followCollectionLink);
    document.addEventListener("click", onCollectionClick);
    window.addEventListener("hashchange", followCollectionLink);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("hashchange", followCollectionLink); document.removeEventListener("click", onCollectionClick); };
  }, []);
  const categoryNames = useMemo(() => new Map(categories.map(row => [row.id, row.name])), [categories]);
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    const result = products.filter(product => {
      const content = [product.name, product.description, categoryNames.get(product.categoryId ?? ""), ...product.variants.flatMap(row => [row.sku, row.size, row.color])].join(" ").toLowerCase();
      return (!newOnly || product.isNewArrival) && (!search || content.includes(search)) && (category === "all" || (product.categoryId ?? "other") === category) &&
        (!inStock || product.totalStock > 0) &&
        (!minPrice || product.priceFrom >= Number(minPrice)) && (!maxPrice || product.priceFrom <= Number(maxPrice));
    });
    if (sort === "featured") result.sort((a, b) => Number(Boolean(b.isFeatured)) - Number(Boolean(a.isFeatured)));
    if (sort === "price-low") result.sort((a, b) => a.priceFrom - b.priceFrom);
    if (sort === "price-high") result.sort((a, b) => b.priceFrom - a.priceFrom);
    if (sort === "name") result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }, [products, newOnly, query, categoryNames, category, inStock, minPrice, maxPrice, sort]);
  function clearFilters() { setNewOnly(false); setQuery(""); setCategory("all"); setInStock(false); setMinPrice(""); setMaxPrice(""); setLimit(24); }
  return <section id="store-products" className="scroll-mt-5" aria-label="Shop products">
    <div className="catalog-toolbar">
      <label className="catalog-search"><Search size={19} /><input type="search" aria-label={t("Search products")} placeholder={t("Search for products, categories, or styles…")} value={query} onChange={event => { setQuery(event.target.value); setLimit(24); }} /></label>
      <label className="catalog-sort"><span>{t("Sort by")}</span><select aria-label="Sort products" value={sort} onChange={event => setSort(event.target.value)}><option value="featured">{t("Pre-order first")}</option><option value="price-low">{t("Price: low to high")}</option><option value="price-high">{t("Price: high to low")}</option><option value="name">{t("Name: A–Z")}</option></select></label>
      <button type="button" className="catalog-tool-button" aria-expanded={filterOpen} aria-controls="catalog-filters" onClick={() => setFilterOpen(!filterOpen)}><SlidersHorizontal size={17} />{t("Filter")}</button>
      <label className="stock-filter"><input type="checkbox" checked={inStock} onChange={event => setInStock(event.target.checked)} />{t("In stock only")}</label>
      <div className="catalog-view" role="group" aria-label="Product layout"><button type="button" className="catalog-tool-button" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")}><Grid2X2 size={17} /></button><button type="button" className="catalog-tool-button" aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")}><List size={18} /></button></div>
    </div>
    {filterOpen && <div className="catalog-filter-panel" id="catalog-filters"><label>{t("Minimum price")} ({settings.currency})<input type="number" min="0" step="0.01" value={minPrice} onChange={event => setMinPrice(event.target.value)} placeholder="0" /></label><label>{t("Maximum price")} ({settings.currency})<input type="number" min="0" step="0.01" value={maxPrice} onChange={event => setMaxPrice(event.target.value)} placeholder={t("Any price")} /></label><button type="button" onClick={clearFilters}>{t("Reset filters")}</button></div>}
    <div className="catalog-categories"><div className="category-pills" role="group" aria-label="Product categories"><button type="button" aria-pressed={!newOnly && category === "all"} onClick={() => { setNewOnly(false); setCategory("all"); setLimit(24); }}><Grid2X2 size={14} />{t("All products")}</button>{products.some(product => product.isNewArrival) && <button type="button" aria-pressed={newOnly} onClick={() => { setNewOnly(!newOnly); setCategory("all"); setLimit(24); }}><Sparkles size={14} />{t("New arrivals")}</button>}{[...categories.filter(row => products.some(product => product.categoryId === row.id)), ...(products.some(product => !product.categoryId) ? [{ id: "other", name: t("Other") }] : [])].map(row => <button key={row.id} type="button" aria-pressed={!newOnly && row.id === category} onClick={() => { setNewOnly(false); setCategory(row.id); setLimit(24); }}>{row.id === "other" ? t("Other") : row.name}</button>)}</div><p className="catalog-count" aria-live="polite">{filtered.length} {t(filtered.length === 1 ? t("product") : t("products"))}</p></div>
    {!settings.orderingEnabled && <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Browse our collection. Online ordering is currently paused.</p>}
    <div className={`store-product-grid ${view === "list" ? "list-view" : ""}`}>
      {filtered.slice(0, limit).map(product => <CatalogCard key={product.key} product={product} categoryName={categoryNames.get(product.categoryId ?? "") ?? t("Collection")} settings={settings} onAdd={variantId => onAdd(product, variantId)} onQuickView={variantId => onQuickView?.(product, variantId)} />)}
    </div>
    {!filtered.length && <div className="catalog-empty"><Package size={36} /><h2>{products.length ? t("No matching products") : t("Our collection is coming soon")}</h2><p>{products.length ? t("Try another search, category, or price range.") : t("Check back soon for the latest arrivals.")}</p>{products.length > 0 && <button type="button" onClick={clearFilters}>{t("Clear filters")}</button>}</div>}
    {filtered.length > limit && <button type="button" className="load-products" onClick={() => setLimit(limit + 24)}>{t("Load more products")} <ChevronDown size={15} /></button>}
  </section>;
}

function CatalogCard({ product, categoryName, settings, onAdd, onQuickView }: {
  product: StorefrontCatalogProduct; categoryName: string; settings: CatalogSettings;
  onAdd: (variantId?: string) => void;
  onQuickView: (variantId?: string) => void;
}) {
  const { t } = useStorefrontLanguage();
  const colors = [...new Set(product.variants.map(row => row.color?.trim()).filter((color): color is string => Boolean(color)))];
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const sizes = [...new Set(product.variants.map(row => row.size?.trim()).filter((size): size is string => Boolean(size)))].sort((a, b) => {
    const order = ["XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "XXXL", "3XL", "4XL", "5XL"];
    const left = order.indexOf(a.toUpperCase());
    const right = order.indexOf(b.toUpperCase());
    return left >= 0 && right >= 0 ? left - right : a.localeCompare(b, undefined, { numeric: true });
  });
  const matches = product.variants.filter(row => (!selectedColor || row.color?.trim() === selectedColor) && (!selectedSize || row.size?.trim() === selectedSize));
  const variant = matches.find(row => row.stockQuantity > 0) ?? matches[0];
  const [imageOpen, setImageOpen] = useState(false);
  const image = variant?.imageUrl || product.imageUrl;
  const price = matches.length ? Math.min(...matches.map(row => row.sellingPrice)) : product.priceFrom;
  const preorder = Boolean(
    (selectedColor || selectedSize) &&
    matches.length === 1 &&
    product.preorderVariantIds?.includes(matches[0].id),
  );
  const stock = matches.reduce((sum, row) => sum + Math.max(0, row.stockQuantity), 0);
  return <article className="store-product-card">
    <div className="product-photo"><div className="product-badges">{product.isBestseller && <span className="product-bestseller-badge"><Award size={12} />{t("Bestseller")}</span>}{product.isNewArrival && <span className="product-new-badge">{t("New arrival")}</span>}</div>{image ? <button type="button" className="product-photo-open" aria-label={`${t("View full screen")} ${product.name}`} onClick={() => setImageOpen(true)}><img src={image} alt={product.name} loading="lazy" decoding="async" /></button> : <div className="product-photo-placeholder"><ShoppingCart size={32} /></div>}

    </div>
    <div className="product-card-body"><h3 title={product.name}>{product.name}</h3><p className="product-category">{categoryName}</p>
      <div className="product-price-row"><p className="product-price">{new Intl.NumberFormat("en-US", { style: "currency", currency: settings.currency }).format(price)}{matches.some(row => row.sellingPrice !== price) && <small className="ml-1 text-[9px] font-normal">{t("from")}</small>}</p><span className={`product-stock ${preorder ? "preorder" : stock <= 0 ? "sold-out" : stock <= 3 ? "low" : ""}`}><i />{preorder ? t("Pre-order") : stock <= 0 ? t("Sold out") : stock <= 3 ? `${t("Only")} ${stock} ${t("left")}` : t("In stock")}</span></div>
      <div className="product-swatches">{colors.map(color => <button key={color} type="button" title={color} aria-label={`${product.name}: ${color}`} aria-pressed={selectedColor === color} onClick={() => { setSelectedColor(selectedColor === color ? null : color); setSelectedSize(null); }} style={{ background: swatchColor(color) }} />)}{!colors.length && <small>{product.productType === "configurable" ? t("Customize your selection") : t("Ready to order")}</small>}</div>
      {sizes.length > 0 && <div className="product-sizes" role="group" aria-label={`${product.name} sizes`}><span>{t("Size")}</span>{sizes.map(size => {
        const available = product.variants.some(row => row.size?.trim() === size && (!selectedColor || row.color?.trim() === selectedColor) && row.stockQuantity > 0);
        return <button key={size} type="button" disabled={!available} aria-label={`${product.name}: size ${size}${available ? "" : " sold out"}`} aria-pressed={selectedSize === size} title={available ? size : `${size} - sold out`} onClick={() => setSelectedSize(selectedSize === size ? null : size)}>{size}</button>;
      })}</div>}
      {imageOpen && image && <ImageViewer images={[...new Set([image, ...(product.images ?? [])])]} name={product.name} onClose={() => setImageOpen(false)} />}
      <div className="product-card-actions"><button type="button" className="product-add" onClick={() => onAdd(variant?.id)} disabled={!settings.orderingEnabled || stock <= 0}><ShoppingCart size={14} />{!settings.orderingEnabled ? t("Ordering paused") : stock <= 0 ? t("Sold out") : t("Add to cart")}</button><button type="button" className="product-quick-view" onClick={() => onQuickView(variant?.id)}><Eye size={14} />{t("Quick view")}</button></div>
    </div>
  </article>;
}

function swatchColor(color: string) {
  const colors: Record<string, string> = { black: "#191919", white: "#fff", red: "#d93848", blue: "#3263b8", navy: "#263d69", grey: "#9d9fa3", gray: "#9d9fa3", beige: "#e6d4bb", cream: "#f3e9d5", brown: "#866142", green: "#5d6e48", pink: "#edb2c1", yellow: "#ead06a", purple: "#9a75b5", orange: "#e78c48" };
  return colors[color.toLowerCase()] ?? "linear-gradient(135deg,#d1d9e5,#f7f8fa)";
}
