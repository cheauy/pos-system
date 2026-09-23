"use client";
import {Box,Check,ChevronDown,Search,Package} from "lucide-react";
import {useEffect,useMemo,useRef,useState,type KeyboardEvent as ReactKeyboardEvent} from "react";
export type PickerProduct = {id:string;name:string;sku:string|null;size:string|null;color:string|null;imageUrl:string|null;categoryName:string;categoryId:string|null;businessStock:number};

function swatchColor(value: string | null) {
  const normalized = value?.trim().toLowerCase() ?? "";
  const colors: Record<string, string> = {
    black: "#111827",
    white: "#ffffff",
    red: "#dc3545",
    blue: "#2563eb",
    navy: "#172554",
    green: "#16a34a",
    yellow: "#eab308",
    orange: "#f97316",
    purple: "#7c3aed",
    pink: "#ec4899",
    gray: "#94a3b8",
    grey: "#94a3b8",
    brown: "#92400e",
    beige: "#d6c7aa",
  };

  return colors[normalized] ?? "#94a3b8";
}

export default function ProductVariantPicker({
  products,
  value,
  onChange,
  stockForProduct,
  allowOutOfStock = false,
}: {
  products: PickerProduct[];
  value: string;
  onChange: (productId: string) => void;
  stockForProduct: (product: PickerProduct) => number;
  allowOutOfStock?: boolean;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [colorFilter, setColorFilter] = useState("all");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const selected = value ? products.find((product) => product.id === value) ?? null : null;
  const categories = useMemo(
    () =>
      Array.from(new Set(products.map((product) => product.categoryName)))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [products],
  );
  const colors = useMemo(
    () =>
      Array.from(
        new Set(
          products
            .map((product) => product.color?.trim())
            .filter((color): color is string => Boolean(color)),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [products],
  );

  const filteredProducts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((product) => {
      if (categoryFilter !== "all" && product.categoryName !== categoryFilter) return false;
      if (colorFilter !== "all" && (product.color ?? "") !== colorFilter) return false;
      if (!needle) return true;

      return [
        product.name,
        product.categoryName,
        product.color ?? "",
        product.size ?? "",
        product.sku ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [categoryFilter, colorFilter, products, query]);

  const groups = useMemo(() => {
    const map = new Map<string, PickerProduct[]>();
    for (const product of filteredProducts) {
      const rows = map.get(product.categoryName) ?? [];
      rows.push(product);
      map.set(product.categoryName, rows);
    }

    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredProducts]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => { setHighlightedIndex(0); searchRef.current?.focus(); });
    return () => cancelAnimationFrame(frame);
  }, [open, query, categoryFilter, colorFilter]);

  function selectProduct(product: PickerProduct) {
    if (!allowOutOfStock && stockForProduct(product) <= 0) return;
    onChange(product.id);
    setOpen(false);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }

    if (filteredProducts.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.min(filteredProducts.length - 1, current + 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(0, current - 1));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const product = filteredProducts[highlightedIndex];
      if (product) selectProduct(product);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
        className={`flex min-h-14 w-full items-center gap-3 rounded-xl border bg-white px-3 text-left transition ${
          open ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200 hover:border-slate-300"
        }`}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
          {selected?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selected.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Box size={18} className="text-slate-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {selected ? (
            <>
              <p className="truncate text-sm font-semibold text-slate-900">
                {[selected.name, selected.color, selected.size].filter(Boolean).join(" · ")}
              </p>
              <p className="truncate text-xs text-slate-500">SKU: {selected.sku || "No SKU"}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-slate-700">Choose product / variant</p>
              <p className="text-xs text-slate-400">Search by product, colour, size or SKU</p>
            </>
          )}
        </div>
        <ChevronDown
          size={18}
          className={`shrink-0 text-slate-500 transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div role="dialog" aria-label="Choose product or variant" className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="border-b border-slate-200 p-3">
            <label className="relative block">
              <Search
                size={18}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setHighlightedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search by category, product name, colour, size, or SKU..."
                className="h-11 w-full rounded-xl border border-slate-200 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => {
                  setCategoryFilter("all");
                  setColorFilter("all");
                }}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${
                  categoryFilter === "all" && colorFilter === "all"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                All
              </button>
              {categories.map((category) => (
                <button
                  type="button"
                  key={category}
                  onClick={() =>
                    setCategoryFilter((current) =>
                      current === category ? "all" : category,
                    )
                  }
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${
                    categoryFilter === category
                      ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {category}
                </button>
              ))}
              {colors.map((color) => (
                <button
                  type="button"
                  key={color}
                  onClick={() => setColorFilter((current) => (current === color ? "all" : color))}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${
                    colorFilter === color
                      ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <span
                    className="h-3.5 w-3.5 rounded-full border border-slate-300"
                    style={{ backgroundColor: swatchColor(color) }}
                  />
                  {color}
                </button>
              ))}
              {(categoryFilter !== "all" || colorFilter !== "all" || query) && (
                <button
                  type="button"
                  onClick={() => {
                    setCategoryFilter("all");
                    setColorFilter("all");
                    setQuery("");
                  }}
                  className="ml-auto shrink-0 px-2 text-sm font-medium text-slate-500 hover:text-blue-600"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[430px] overflow-y-auto p-2">
            {groups.map(([name, rows]) => (
              <section key={name}>
                <div className="sticky top-0 z-10 flex items-center justify-between bg-slate-50 px-3 py-2">
                  <p className="text-sm font-bold text-slate-900">{name}</p>
                  <p className="text-xs text-slate-500">
                    {rows.length} {rows.length === 1 ? "variant" : "variants"}
                  </p>
                </div>
                <div className="divide-y divide-slate-100">
                  {rows.map((product) => {
                    const index = filteredProducts.findIndex((row) => row.id === product.id);
                    const quantity = stockForProduct(product);
                    const active = product.id === value;
                    const highlighted = index === highlightedIndex;
                    const outOfStock = quantity <= 0;
                    const lowStock = quantity > 0 && quantity <= 5;

                    return (
                      <button
                        type="button"
                        key={product.id}
                        disabled={outOfStock && !allowOutOfStock}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        onClick={() => selectProduct(product)}
                        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
                          active
                            ? "bg-blue-50 ring-1 ring-inset ring-blue-400"
                            : highlighted
                              ? "bg-slate-50"
                              : "hover:bg-slate-50"
                        } ${outOfStock && !allowOutOfStock ? "cursor-not-allowed opacity-55" : ""}`}
                      >
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                          {product.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Box size={18} className="text-slate-400" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">{product.name}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            {product.color && (
                              <span className="inline-flex items-center gap-1.5">
                                <span
                                  className="h-3.5 w-3.5 rounded-full border border-slate-300"
                                  style={{ backgroundColor: swatchColor(product.color) }}
                                />
                                {product.color}
                              </span>
                            )}
                            {product.size && <span>• {product.size}</span>}
                          </div>
                        </div>

                        <div className="hidden min-w-0 text-right sm:block">
                          <p className="max-w-48 truncate text-xs font-medium text-slate-500">
                            SKU: {product.sku || "No SKU"}
                          </p>
                        </div>

                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                            outOfStock
                              ? "bg-rose-50 text-rose-700"
                              : lowStock
                                ? "bg-amber-50 text-amber-700"
                                : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {outOfStock ? "Out of stock" : lowStock ? `Low stock · ${quantity}` : `In stock · ${quantity}`}
                        </span>

                        {active && (
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                            <Check size={15} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}

            {filteredProducts.length === 0 && (
              <div className="px-5 py-10 text-center">
                <Package size={30} className="mx-auto text-slate-300" />
                <p className="mt-2 text-sm font-semibold text-slate-700">No variants found</p>
                <p className="mt-1 text-xs text-slate-500">Change the search or filters.</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 text-xs text-slate-500">
            <span>↑ ↓ navigate · Enter select</span>
            <span>{filteredProducts.length} results shown</span>
          </div>
        </div>
      )}
    </div>
  );
}

