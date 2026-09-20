"use client";

import {
  useMemo,
  useState,
} from "react";
import {
  Barcode,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Filter,
  ImageIcon,
  Minus,
  MoreHorizontal,
  Plus,
  Printer,
  Search,
} from "lucide-react";

import { code39Bars } from "@/lib/barcode/code39";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  image_url: string | null;
  variant_image_url: string | null;
  cost_price: number;
  selling_price: number;
  stock_quantity: number;
  size: string | null;
  color: string | null;
  category_id: string | null;
  is_active: boolean;
};

type Category = {
  id: string;
  name: string;
};

type TemplateId = "product" | "price";
type PreviewTab = "label" | "pdf";

type LabelElements = {
  name: boolean;
  variant: boolean;
  barcode: boolean;
  sku: boolean;
  price: boolean;
  image: boolean;
  storeName: boolean;
  customText: boolean;
};

type TemplateDefinition = {
  id: TemplateId;
  name: string;
  description: string;
  elements: LabelElements;
};

const templates: TemplateDefinition[] = [
  { id: "product", name: "Centered label", description: "Centered shop name, product, variant, SKU, barcode and bold price.", elements: { name:true,variant:true,barcode:true,sku:true,price:true,image:false,storeName:true,customText:false } },
  { id: "price", name: "Split-price label", description: "Product details on the left, large price on the right, barcode below.", elements: { name:true,variant:true,barcode:true,sku:true,price:true,image:false,storeName:true,customText:false } },
];

const sizeRank = new Map(
  ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"].map((value, index) => [
    value,
    index,
  ]),
);

function compareSizes(a: Product, b: Product) {
  const aValue = (a.size ?? "").trim().toUpperCase();
  const bValue = (b.size ?? "").trim().toUpperCase();
  const aRank = sizeRank.get(aValue);
  const bRank = sizeRank.get(bValue);

  if (aRank !== undefined || bRank !== undefined) {
    return (aRank ?? 999) - (bRank ?? 999);
  }

  return aValue.localeCompare(bValue, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function colorKey(product: Product) {
  return product.color?.trim() || "No colour";
}

function colorDot(color: string) {
  const normalized = color.trim().toLowerCase();
  const known: Record<string, string> = {
    red: "#dc3545",
    white: "#f8fafc",
    black: "#111827",
    blue: "#2563eb",
    green: "#16a34a",
    yellow: "#eab308",
    orange: "#f97316",
    pink: "#ec4899",
    purple: "#9333ea",
    brown: "#92400e",
    grey: "#94a3b8",
    gray: "#94a3b8",
  };
  return known[normalized] ?? "#cbd5e1";
}

function money(value: number) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export function getTemplate(id: TemplateId) {
  return templates.find((template) => template.id === id) ?? templates[0];
}

export default function BarcodeLabelsClient({
  businessName,
  products,
  categories,
  settings,
}: {
  businessName: string;
  products: Product[];
  categories: Category[];
  settings: Record<string, unknown>;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [activeColor, setActiveColor] = useState("all");
  const [categoryId, setCategoryId] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [priceFilter, setPriceFilter] = useState("all");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const templateId: TemplateId = settings.barcode_template === "price" ? "price" : "product";
  const labelSize = ["40x20", "40x30", "50x30", "60x40", "80x50"].includes(String(settings.barcode_label_size)) ? String(settings.barcode_label_size) : "50x30";
  const [previewTab, setPreviewTab] = useState<PreviewTab>("label");
  const [previewIndex, setPreviewIndex] = useState(0);
  const showElements: LabelElements = {
    name: settings.barcode_show_name !== false,
    variant: settings.barcode_show_variant !== false,
    barcode: settings.barcode_show_barcode !== false,
    sku: settings.barcode_show_sku !== false,
    price: settings.barcode_show_price !== false,
    image: Boolean(settings.barcode_show_image),
    storeName: settings.barcode_show_store_name !== false,
    customText: false,
  };

  const categoryName = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  const colors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products) {
      const key = colorKey(product);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [products]);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();

    return products.filter((product) => {
      if (activeColor !== "all" && colorKey(product) !== activeColor) return false;
      if (categoryId !== "all" && product.category_id !== categoryId) return false;
      if (stockFilter === "in" && product.stock_quantity <= 0) return false;
      if (stockFilter === "out" && product.stock_quantity > 0) return false;
      if (priceFilter === "under10" && product.selling_price >= 10) return false;
      if (priceFilter === "10to50" && (product.selling_price < 10 || product.selling_price > 50)) {
        return false;
      }
      if (priceFilter === "over50" && product.selling_price <= 50) return false;
      if (!search) return true;

      return `${product.name} ${product.sku ?? ""} ${product.barcode ?? ""} ${
        product.size ?? ""
      } ${product.color ?? ""}`
        .toLowerCase()
        .includes(search);
    });
  }, [products, activeColor, categoryId, stockFilter, priceFilter, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const product of filtered) {
      const key = colorKey(product);
      const rows = map.get(key) ?? [];
      rows.push(product);
      map.set(key, rows);
    }

    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([color, rows]) => ({
        color,
        rows: [...rows].sort(compareSizes),
      }));
  }, [filtered]);

  const selectedProducts = useMemo(
    () => products.filter((product) => selected.includes(product.id)),
    [products, selected],
  );

  const currentPreview =
    selectedProducts.length > 0
      ? selectedProducts[Math.min(previewIndex, selectedProducts.length - 1)]
      : filtered[0] ?? products[0] ?? null;


  function toggleSelected(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleGroup(rows: Product[]) {
    const ids = rows.map((row) => row.id);
    const allSelected = ids.every((id) => selected.includes(id));
    setSelected((current) => {
      if (allSelected) return current.filter((id) => !ids.includes(id));
      return Array.from(new Set([...current, ...ids]));
    });
  }

  function selectAllFiltered() {
    const ids = filtered.map((row) => row.id);
    const allSelected = ids.length > 0 && ids.every((id) => selected.includes(id));
    setSelected((current) => {
      if (allSelected) return current.filter((id) => !ids.includes(id));
      return Array.from(new Set([...current, ...ids]));
    });
  }

  function setQuantity(id: string, value: number) {
    const safe = Math.max(1, Math.min(999, Math.floor(value || 1)));
    setQuantities((current) => ({ ...current, [id]: safe }));
  }


  function resetFilters() {
    setQuery("");
    setActiveColor("all");
    setCategoryId("all");
    setStockFilter("all");
    setPriceFilter("all");
  }

  function printLabels() {
    if (!selectedProducts.length) return;
    window.print();
  }

  const printedLabels = selectedProducts.flatMap((product) => {
    const count = quantities[product.id] ?? 1;
    return Array.from({ length: Math.max(1, count) }, (_, index) => ({
      product,
      key: `${product.id}-${index}`,
    }));
  });

  return (
    <main className="min-w-0 space-y-4 pb-8">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">
            Barcode & Label Printing
          </h1>
          <p className="mt-1 text-slate-500">
            Print scan-ready barcode labels for products and exact variants.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!selectedProducts.length}
            onClick={printLabels}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Printer size={17} />
            Print Selected ({selectedProducts.length})
          </button>
        </div>
      </header>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_410px]">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 flex-wrap gap-2">
                <ColorTab
                  active={activeColor === "all"}
                  onClick={() => setActiveColor("all")}
                  label={`All (${products.length})`}
                />
                {colors.map(([color, count]) => (
                  <ColorTab
                    key={color}
                    active={activeColor === color}
                    onClick={() => setActiveColor(color)}
                    label={`${color} (${count})`}
                    color={colorDot(color)}
                  />
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-slate-500">Group by</span>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700">
                  Colour
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700">
                  Size (XS → XXL)
                </div>
              </div>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(250px,1fr)_180px_170px_170px_auto]">
              <label className="relative block">
                <Search
                  size={17}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search product name, SKU or barcode..."
                  className={`${inputClass} pl-9`}
                />
              </label>

              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className={inputClass}
              >
                <option value="all">All Categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>

              <select
                value={stockFilter}
                onChange={(event) => setStockFilter(event.target.value)}
                className={inputClass}
              >
                <option value="all">All Status</option>
                <option value="in">In stock</option>
                <option value="out">Out of stock</option>
              </select>

              <select
                value={priceFilter}
                onChange={(event) => setPriceFilter(event.target.value)}
                className={inputClass}
              >
                <option value="all">All Prices</option>
                <option value="under10">Under $10</option>
                <option value="10to50">$10 – $50</option>
                <option value="over50">Over $50</option>
              </select>

              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-blue-600 hover:bg-blue-50"
              >
                <Filter size={16} />
                Reset
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[980px]">
              <div className="grid grid-cols-[38px_minmax(260px,1.45fr)_160px_80px_130px_100px_100px_90px_115px_54px] items-center border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every((row) => selected.includes(row.id))}
                  onChange={selectAllFiltered}
                  className="h-4 w-4 accent-blue-600"
                />
                <span>Product / Variant</span>
                <span>SKU</span>
                <span>Size</span>
                <span>Colour</span>
                <span>Cost</span>
                <span>Price</span>
                <span>Stock</span>
                <span>Label Qty</span>
                <span />
              </div>

              {grouped.length === 0 ? (
                <div className="grid min-h-56 place-items-center p-8 text-center text-sm text-slate-500">
                  <div>
                    <Barcode className="mx-auto mb-3 text-slate-300" size={36} />
                    No products match these filters.
                  </div>
                </div>
              ) : (
                grouped.map((group) => {
                  const isCollapsed = collapsed.includes(group.color);
                  const groupSelected = group.rows.every((row) => selected.includes(row.id));
                  const groupImage =
                    group.rows.find((row) => row.variant_image_url)?.variant_image_url ??
                    group.rows.find((row) => row.image_url)?.image_url ??
                    null;

                  return (
                    <div key={group.color} className="border-b border-slate-200 last:border-b-0">
                      <div className="grid grid-cols-[38px_minmax(260px,1.45fr)_160px_80px_130px_100px_100px_90px_115px_54px] items-center bg-slate-50/70 px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={groupSelected}
                          onChange={() => toggleGroup(group.rows)}
                          className="h-4 w-4 accent-blue-600"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setCollapsed((current) =>
                              current.includes(group.color)
                                ? current.filter((item) => item !== group.color)
                                : [...current, group.color],
                            )
                          }
                          className="flex min-w-0 items-center gap-3 text-left"
                        >
                          <ChevronDown
                            size={16}
                            className={`shrink-0 transition ${
                              isCollapsed ? "-rotate-90" : ""
                            }`}
                          />
                          {groupImage ? (
                            <img
                              src={groupImage}
                              alt=""
                              className="h-9 w-9 rounded-lg border border-slate-200 object-cover"
                            />
                          ) : (
                            <div className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-400">
                              <ImageIcon size={16} />
                            </div>
                          )}
                          <span
                            className="h-3.5 w-3.5 shrink-0 rounded-full border border-slate-300"
                            style={{ backgroundColor: colorDot(group.color) }}
                          />
                          <span className="truncate font-bold text-slate-900">
                            {group.color}
                            <span className="ml-2 font-medium text-slate-500">
                              · {group.rows.length} variant{group.rows.length === 1 ? "" : "s"}
                            </span>
                          </span>
                        </button>
                        <div className="col-span-6" />
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.rows)}
                          className="text-sm font-semibold text-blue-600"
                        >
                          {groupSelected ? "Clear" : "Select all"}
                        </button>
                        <button
                          type="button"
                          className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500"
                          aria-label={`${group.color} options`}
                        >
                          <MoreHorizontal size={16} />
                        </button>
                      </div>

                      {!isCollapsed &&
                        group.rows.map((product) => {
                          const image = product.variant_image_url ?? product.image_url;
                          return (
                            <div
                              key={product.id}
                              className="grid grid-cols-[38px_minmax(260px,1.45fr)_160px_80px_130px_100px_100px_90px_115px_54px] items-center border-t border-slate-100 px-3 py-2 text-sm hover:bg-slate-50/70"
                            >
                              <input
                                type="checkbox"
                                checked={selected.includes(product.id)}
                                onChange={() => toggleSelected(product.id)}
                                className="h-4 w-4 accent-blue-600"
                              />
                              <div className="flex min-w-0 items-center gap-3">
                                {image ? (
                                  <img
                                    src={image}
                                    alt=""
                                    className="h-9 w-9 rounded-lg border border-slate-200 object-cover"
                                  />
                                ) : (
                                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-400">
                                    <ImageIcon size={15} />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="truncate font-semibold text-slate-900">
                                    {product.name}
                                    {product.color ? ` - ${product.color}` : ""}
                                    {product.size ? ` / ${product.size}` : ""}
                                  </p>
                                  <p className="truncate text-xs text-slate-500">
                                    {product.category_id
                                      ? categoryName.get(product.category_id) ?? "Uncategorized"
                                      : "Uncategorized"}
                                  </p>
                                </div>
                              </div>
                              <span className="truncate text-slate-600">{product.sku ?? "—"}</span>
                              <span>{product.size ?? "—"}</span>
                              <span className="flex items-center gap-2">
                                <span
                                  className="h-3.5 w-3.5 rounded-full border border-slate-300"
                                  style={{ backgroundColor: colorDot(colorKey(product)) }}
                                />
                                {colorKey(product)}
                              </span>
                              <span>{money(product.cost_price)}</span>
                              <span className="font-semibold text-slate-900">
                                {money(product.selling_price)}
                              </span>
                              <span
                                className={
                                  product.stock_quantity <= 0
                                    ? "font-semibold text-red-600"
                                    : product.stock_quantity <= 5
                                      ? "font-semibold text-amber-600"
                                      : "font-semibold text-emerald-600"
                                }
                              >
                                {product.stock_quantity}
                              </span>
                              <div className="flex w-[92px] items-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setQuantity(product.id, (quantities[product.id] ?? 1) - 1)
                                  }
                                  className="grid h-8 w-8 place-items-center text-slate-500 hover:bg-slate-50"
                                >
                                  <Minus size={13} />
                                </button>
                                <input
                                  type="number"
                                  min={1}
                                  max={999}
                                  value={quantities[product.id] ?? 1}
                                  onChange={(event) =>
                                    setQuantity(product.id, Number(event.target.value))
                                  }
                                  className="h-8 w-9 border-x border-slate-200 text-center text-sm outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setQuantity(product.id, (quantities[product.id] ?? 1) + 1)
                                  }
                                  className="grid h-8 w-8 place-items-center text-slate-500 hover:bg-slate-50"
                                >
                                  <Plus size={13} />
                                </button>
                              </div>
                              <button
                                type="button"
                                className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500"
                                aria-label={`${product.name} options`}
                              >
                                <MoreHorizontal size={16} />
                              </button>
                            </div>
                          );
                        })}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-500">
            <span>
              {selectedProducts.length} of {filtered.length} variants selected
            </span>
            <span>{products.length} total products / variants</span>
          </div>
        </section>

        <aside className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm 2xl:sticky 2xl:top-4 2xl:self-start">
          <div className="grid grid-cols-2 border-b border-slate-200">
            <button
              type="button"
              onClick={() => setPreviewTab("label")}
              className={`border-b-2 px-4 py-3 text-sm font-semibold ${
                previewTab === "label"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-600"
              }`}
            >
              Label Preview
            </button>
            <button
              type="button"
              onClick={() => setPreviewTab("pdf")}
              className={`border-b-2 px-4 py-3 text-sm font-semibold ${
                previewTab === "pdf"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-600"
              }`}
            >
              PDF Preview
            </button>
          </div>

          <div className="space-y-5 p-4">


            <div className="rounded-xl bg-slate-50 p-4">
              {previewTab === "label" ? (
                <div>
                  <div className="flex min-h-[240px] items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 p-6">
                    {currentPreview ? (
                      <LabelCard
                        product={currentPreview}
                        businessName={businessName}
                        size={labelSize}
                        templateId={templateId}
                        elements={showElements}
                        customText=""
                      />
                    ) : (
                      <p className="text-sm text-slate-500">No product available for preview.</p>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-center gap-4 text-sm text-slate-500">
                    <button
                      type="button"
                      disabled={selectedProducts.length <= 1}
                      onClick={() =>
                        setPreviewIndex((current) =>
                          Math.max(0, current - 1),
                        )
                      }
                      className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-white disabled:opacity-40"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span>
                      {selectedProducts.length
                        ? `${Math.min(previewIndex, selectedProducts.length - 1) + 1} / ${
                            selectedProducts.length
                          }`
                        : "Preview"}
                    </span>
                    <button
                      type="button"
                      disabled={
                        selectedProducts.length <= 1 ||
                        previewIndex >= selectedProducts.length - 1
                      }
                      onClick={() =>
                        setPreviewIndex((current) =>
                          Math.min(selectedProducts.length - 1, current + 1),
                        )
                      }
                      className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-white disabled:opacity-40"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mx-auto aspect-[210/297] max-h-[360px] overflow-hidden rounded-md border border-slate-300 bg-white p-4 shadow-sm">
                  <div className="grid grid-cols-2 gap-2">
                    {(selectedProducts.length ? selectedProducts : filtered.slice(0, 8))
                      .slice(0, 8)
                      .map((product) => (
                        <div key={product.id} className="scale-[0.55] origin-top-left">
                          <LabelCard
                            product={product}
                            businessName={businessName}
                            size={labelSize}
                            templateId={templateId}
                            elements={showElements}
                            customText=""
                          />
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>



            <button
              type="button"
              disabled={!selectedProducts.length}
              onClick={printLabels}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FileDown size={18} />
              Generate PDF
            </button>
            <button
              type="button"
              disabled={!selectedProducts.length}
              onClick={printLabels}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Printer size={18} />
              Print Labels
            </button>
          </div>
        </aside>
      </div>

      <div id="barcode-print-area" className="hidden print:block">
        {printedLabels.map(({ product, key }) => (
          <LabelCard
            key={key}
            product={product}
            businessName={businessName}
            size={labelSize}
            templateId={templateId}
            elements={showElements}
            customText=""
          />
        ))}
      </div>

      <style jsx global>{`
        @media print {
          @page {
            margin: 4mm;
          }
          body * {
            visibility: hidden !important;
          }
          #barcode-print-area,
          #barcode-print-area * {
            visibility: visible !important;
          }
          #barcode-print-area {
            display: flex !important;
            position: absolute;
            inset: 0 auto auto 0;
            flex-wrap: wrap;
            align-content: flex-start;
            gap: 2mm;
          }
          .barcode-label {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </main>
  );
}

function ColorTab({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
        active
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {color && (
        <span
          className="h-3.5 w-3.5 rounded-full border border-slate-300"
          style={{ backgroundColor: color }}
        />
      )}
      {label}
    </button>
  );
}

export function LabelCard({
  product,
  businessName,
  size,
  templateId,
  elements,
  customText,
}: {
  product: Product;
  businessName: string;
  size: string;
  templateId: TemplateId;
  elements: LabelElements;
  customText: string;
}) {
  const value = product.barcode || product.sku || product.id.slice(0, 12);
  const data = code39Bars(value);
  const [width, height] = size.split("x").map(Number);
  const image = product.variant_image_url ?? product.image_url;
  const split = templateId === "price";
  const scale = Math.min(width / 50, height / 30) * (elements.image && image ? 0.8 : elements.customText && customText ? 0.9 : 1);
  const details = <div style={{minWidth:0,flex:1}}>
    {elements.storeName && <div style={{fontSize:9*scale,lineHeight:1.1,fontWeight:700,marginBottom:2*scale,overflowWrap:"anywhere"}}>{businessName}</div>}
    {elements.image && image && <img src={image} alt="" style={{width:20*scale,height:20*scale,objectFit:"contain",margin:"0 auto"}}/>}
    {elements.name && <div style={{fontSize:12*scale,fontWeight:800,lineHeight:1.05,overflowWrap:"anywhere"}}>{product.name}</div>}
    {elements.variant && <div style={{fontSize:9*scale,lineHeight:1.2}}>{[product.color,product.size].filter(Boolean).join(" / ")}</div>}
    {elements.sku && <div style={{fontSize:8*scale,lineHeight:1.3,overflowWrap:"anywhere"}}>SKU: {product.sku || data.text}</div>}
  </div>;
  return <div className="barcode-label border border-slate-200 bg-white text-black" style={{width:`${width}mm`,height:`${height}mm`,boxSizing:"border-box",padding:`${1.5*scale}mm`,display:"flex",flexDirection:"column",justifyContent:"space-between",gap:2*scale,overflow:"hidden",textAlign:split?"left":"center",fontFamily:"Arial, sans-serif"}}>
    <div style={{display:"flex",gap:5*scale,alignItems:"center"}}>
      {details}
      {split && elements.price && <div style={{borderLeft:"1px solid black",paddingLeft:5*scale,flexShrink:0}}><div style={{fontSize:7*scale,letterSpacing:1}}>PRICE</div><div style={{fontSize:20*scale,fontWeight:900,lineHeight:1.2}}>{money(product.selling_price)}</div></div>}
    </div>
    {elements.barcode && <div style={{textAlign:"center",padding:"0 2mm"}}><svg viewBox={`0 0 ${data.width} 44`} style={{width:"100%",height:`${(split?8:6)*scale}mm`,display:"block"}} preserveAspectRatio="none" aria-label={`Barcode ${data.text}`}>{data.bars.map((bar,index)=><rect key={index} x={bar.x} y="0" width={bar.width} height="44" fill="black"/>)}</svg><div style={{fontSize:8*scale,letterSpacing:1,lineHeight:1.1}}>{data.text}</div></div>}
    {!split && elements.price && <div style={{fontSize:19*scale,fontWeight:900,lineHeight:1}}>{money(product.selling_price)}</div>}

  </div>;
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";
