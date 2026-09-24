"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  Box,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  FileText,
  Hash,
  Info,
  Link2,
  PackageCheck,
  Search,
  SlidersHorizontal,
  Store,
} from "lucide-react";
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { submitStockAdjustment } from "./actions";
import { initialStockAdjustmentState } from "./state";
import { useBranchSwitchGuard } from "../../workspace-branch-provider";

export type AdjustmentProduct = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  imageUrl: string | null;
  size: string | null;
  color: string | null;
  stockQuantity: number;
  lowStockQuantity: number;
  costPrice: number;
  sellingPrice: number;
  isActive: boolean;
  updatedAt: string | null;
  categoryName: string;
};

export type RecentAdjustment = {
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  imageUrl: string | null;
  size: string | null;
  color: string | null;
  adjustmentType: string;
  quantityDelta: number;
  stockBefore: number;
  stockAfter: number;
  reason: string;
  reference: string | null;
  createdAt: string;
};

type Props = {
  products: AdjustmentProduct[];
  recentAdjustments: RecentAdjustment[];
  branchName: string;
  branchId: string;
  initialProductId?: string;
  recoveryKey: string;
};

type Mode = "increase" | "decrease" | "set";
type DateRange = "7" | "30" | "90" | "all";

const reasons = [
  "Stock count correction",
  "Damaged",
  "Supplier return",
  "Customer return",
  "Sample / internal use",
  "Manual stock intake",
  "Other",
];

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isFinite(value) ? value : 0);
}

function dateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function variantText(product: Pick<AdjustmentProduct, "color" | "size">) {
  return [product.color, product.size].filter(Boolean).join(" / ") || "Standard item";
}

function ProductThumb({ src, name }: { src: string | null; name: string }) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="h-full w-full object-cover"
        loading="lazy"
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
      <Box size={22} />
      <span className="sr-only">{name}</span>
    </div>
  );
}

const swatchColours: Record<string, string> = {
  black: "#111827",
  white: "#ffffff",
  red: "#dc2626",
  blue: "#2563eb",
  green: "#16a34a",
  yellow: "#eab308",
  orange: "#f97316",
  pink: "#ec4899",
  purple: "#9333ea",
  gray: "#94a3b8",
  grey: "#94a3b8",
  brown: "#92400e",
  navy: "#1e3a8a",
};

function colourKey(value: string | null) {
  return value?.trim().toLocaleLowerCase() ?? "";
}

function ColourDot({ colour }: { colour: string | null }) {
  const key = colourKey(colour);
  const fill = swatchColours[key] ?? "#cbd5e1";
  return (
    <span
      className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-slate-300"
      style={{ backgroundColor: fill }}
      aria-hidden="true"
    />
  );
}

function stockStatus(product: AdjustmentProduct) {
  if (product.stockQuantity <= 0) {
    return { label: "Out of stock", className: "bg-red-50 text-red-700" };
  }
  if (product.stockQuantity <= product.lowStockQuantity) {
    return { label: `Low stock · ${product.stockQuantity}`, className: "bg-amber-50 text-amber-700" };
  }
  return { label: `In stock · ${product.stockQuantity}`, className: "bg-emerald-50 text-emerald-700" };
}

function ProductVariantPicker({
  products,
  value,
  onChange,
}: {
  products: AdjustmentProduct[];
  value: string;
  onChange: (id: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [colour, setColour] = useState("all");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const selected = products.find((product) => product.id === value) ?? null;

  const categories = useMemo(
    () =>
      Array.from(new Set(products.map((product) => product.categoryName || "Uncategorized"))).sort(
        (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
      ),
    [products],
  );

  const colours = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const product of products) {
      const label = product.color?.trim();
      if (!label) continue;
      const key = colourKey(label);
      if (!byKey.has(key)) byKey.set(key, label);
    }
    return Array.from(byKey.entries()).sort((a, b) =>
      a[1].localeCompare(b[1], undefined, { numeric: true, sensitivity: "base" }),
    );
  }, [products]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return products
      .filter((product) => {
        if (category !== "all" && product.categoryName !== category) return false;
        if (colour !== "all" && colourKey(product.color) !== colour) return false;
        if (!normalizedQuery) return true;
        return [
          product.categoryName,
          product.name,
          product.color,
          product.size,
          product.sku,
          product.barcode,
        ]
          .filter(Boolean)
          .some((field) => String(field).toLocaleLowerCase().includes(normalizedQuery));
      })
      .sort((a, b) => {
        const categoryCompare = a.categoryName.localeCompare(b.categoryName, undefined, {
          numeric: true,
          sensitivity: "base",
        });
        if (categoryCompare !== 0) return categoryCompare;
        const nameCompare = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
        if (nameCompare !== 0) return nameCompare;
        const colourCompare = (a.color ?? "").localeCompare(b.color ?? "", undefined, {
          numeric: true,
          sensitivity: "base",
        });
        if (colourCompare !== 0) return colourCompare;
        return (a.size ?? "").localeCompare(b.size ?? "", undefined, { numeric: true, sensitivity: "base" });
      });
  }, [category, colour, products, query]);

  const groups = useMemo(() => {
    const map = new Map<string, AdjustmentProduct[]>();
    for (const product of filtered) {
      const key = product.categoryName || "Uncategorized";
      const list = map.get(key) ?? [];
      list.push(product);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setHighlightedIndex((current) => Math.min(current, Math.max(filtered.length - 1, 0)));
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [filtered.length, open]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [category, colour, query]);

  function selectProduct(product: AdjustmentProduct) {
    onChange(product.id);
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (filtered.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((index) => (index + 1) % filtered.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((index) => (index - 1 + filtered.length) % filtered.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const product = filtered[highlightedIndex];
      if (product) selectProduct(product);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name="productId" value={value} />
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex min-h-[58px] w-full items-center gap-3 rounded-xl border bg-white px-3 py-2 text-left transition ${
          open
            ? "border-blue-500 ring-2 ring-blue-100"
            : "border-slate-300 hover:border-slate-400"
        }`}
        aria-expanded={open}
      >
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {selected ? (
            <ProductThumb src={selected.imageUrl} name={selected.name} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-400">
              <Box size={18} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">
            {selected ? selected.name : "Choose product / variant"}
          </p>
          <p className="truncate text-xs text-slate-500">
            {selected
              ? `${variantText(selected)}${selected.sku ? ` · SKU: ${selected.sku}` : ""}`
              : "Search by product, colour, size or SKU"}
          </p>
        </div>
        {open ? (
          <ChevronUp size={18} className="shrink-0 text-slate-400" />
        ) : (
          <ChevronDown size={18} className="shrink-0 text-slate-400" />
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl lg:w-[calc(200%+1rem)]">
          <div className="border-b border-slate-100 bg-white p-3">
            <div className="relative">
              <Search
                size={18}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search by category, product name, colour, size, or SKU…"
                className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setCategory("all");
                  setColour("all");
                }}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  category === "all" && colour === "all"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                All
              </button>
              {categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCategory((current) => (current === item ? "all" : item))}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    category === item
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {item}
                </button>
              ))}
              {colours.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setColour((current) => (current === key ? "all" : key))}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    colour === key
                      ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  <ColourDot colour={label} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[430px] overflow-y-auto bg-white p-2">
            {groups.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className="font-semibold text-slate-700">No products found</p>
                <p className="mt-1 text-xs text-slate-500">Try another search or clear a filter.</p>
              </div>
            ) : (
              groups.map(([groupName, groupProducts]) => (
                <div key={groupName} className="mb-2 last:mb-0">
                  <div className="flex items-center justify-between bg-slate-50 px-3 py-2">
                    <p className="text-xs font-bold text-slate-800">{groupName}</p>
                    <span className="text-[11px] text-slate-500">{groupProducts.length} variants</span>
                  </div>
                  <div>
                    {groupProducts.map((product) => {
                      const globalIndex = filtered.findIndex((item) => item.id === product.id);
                      const status = stockStatus(product);
                      const isSelected = product.id === value;
                      const isHighlighted = globalIndex === highlightedIndex;
                      return (
                        <button
                          key={product.id}
                          type="button"
                          onMouseEnter={() => setHighlightedIndex(globalIndex)}
                          onClick={() => selectProduct(product)}
                          className={`flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-left transition last:border-b-0 ${
                            isSelected || isHighlighted
                              ? "bg-blue-50/80"
                              : "hover:bg-slate-50"
                          }`}
                        >
                          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                            <ProductThumb src={product.imageUrl} name={product.name} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900">{product.name}</p>
                            <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-slate-500">
                              {product.color && <ColourDot colour={product.color} />}
                              <span className="truncate">
                                {[product.color, product.size].filter(Boolean).join(" · ") || "Standard item"}
                              </span>
                            </div>
                          </div>
                          <div className="hidden min-w-0 text-right sm:block">
                            <p className="max-w-[220px] truncate text-xs font-medium text-slate-500">
                              SKU: {product.sku || "—"}
                            </p>
                          </div>
                          <span className={`hidden shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold md:inline-flex ${status.className}`}>
                            {status.label}
                          </span>
                          {isSelected && (
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                              <Check size={16} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
            <span>↑ ↓ navigate · Enter select</span>
            <span>{filtered.length} results shown</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StockAdjustmentClient({
  products,
  recentAdjustments,
  branchName, branchId, initialProductId = "", recoveryKey,
}: Props) {
  const router = useRouter();
  const [recovery, setRecovery] = useState<Record<string, string> | null>(null);
  const [ready, setReady] = useState(false);
  const saving = useRef(false);
  const [state, formAction, pending] = useActionState(
    async (previous: typeof initialStockAdjustmentState, data: FormData) => {
      if (saving.current) return previous;
      saving.current = true;
      let payload: Record<string, string>;
      try {
        payload = recovery ?? Object.fromEntries(Array.from(data.entries()).map(([key, value]) => [key, String(value)]));
        payload.requestId ||= crypto.randomUUID();
        sessionStorage.setItem(recoveryKey, JSON.stringify(payload));
        setRecovery(payload);
      } catch {
        saving.current = false;
        return { success: false, message: "Allow browser session storage before saving so interrupted adjustments can be recovered.", submittedAt: Date.now() };
      }
      try {
        const request = new FormData();
        for (const [key, value] of Object.entries(payload)) request.set(key, value);
        const result = await submitStockAdjustment(previous, request);
        if (!result.uncertain) { sessionStorage.removeItem(recoveryKey); setRecovery(null); }
        return result;
      } catch {
        return { success: false, uncertain: true, message: "Save result could not be confirmed. Retry this same adjustment to check it safely.", submittedAt: Date.now() };
      } finally { saving.current = false; }
    },
    initialStockAdjustmentState,
  );

  const [productId, setProductId] = useState(initialProductId);
  const [mode, setMode] = useState<Mode>("increase");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState(reasons[0]);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("30");

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === productId) ?? null,
    [productId, products],
  );

  const quantityNumber = Number(quantity);
  useBranchSwitchGuard(() => pending || recovery ? "Finish or retry the pending stock adjustment before switching branches." : null);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(recoveryKey);
      if (saved) {
        const draft = JSON.parse(saved) as Record<string, string>;
        if (draft.locationId === branchId && draft.requestId) {
          setRecovery(draft); setProductId(draft.productId); setMode(draft.mode as Mode);
          setQuantity(draft.quantity); setReason(draft.reason); setReference(draft.reference ?? ""); setNotes(draft.notes ?? "");
        }
      }
    } catch { /* Saving remains protected by the storage check in the action. */ }
    finally { setReady(true); }
  }, [branchId, recoveryKey]);
  const currentStock = selectedProduct?.stockQuantity ?? 0;
  const safeQuantity = Number.isFinite(quantityNumber) ? quantityNumber : 0;
  const newStock =
    mode === "increase"
      ? currentStock + Math.max(0, safeQuantity)
      : mode === "decrease"
        ? Math.max(0, currentStock - Math.max(0, safeQuantity))
        : Math.max(0, safeQuantity);
  const delta = newStock - currentStock;

  const filteredAdjustments = useMemo(() => {
    const query = search.trim().toLowerCase();
    const now = Date.now();
    const days = dateRange === "all" ? null : Number(dateRange);

    return recentAdjustments.filter((adjustment) => {
      if (days !== null) {
        const time = new Date(adjustment.createdAt).getTime();
        if (!Number.isFinite(time) || time < now - days * 86_400_000) return false;
      }

      if (!query) return true;
      return [
        adjustment.productName,
        adjustment.sku,
        adjustment.color,
        adjustment.size,
        adjustment.reason,
        adjustment.reference,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [dateRange, recentAdjustments, search]);

  useEffect(() => {
    if (!state.submittedAt || !state.success) return;
    setQuantity("1");
    setReference("");
    setNotes("");
    router.refresh();
  }, [router, state.submittedAt, state.success]);

  const canSubmit = Boolean(
    ready && selectedProduct && quantity.trim().length > 0 &&
      Number.isInteger(quantityNumber) &&
      (mode === "set" ? quantityNumber >= 0 : quantityNumber > 0) &&
      !(mode === "decrease" && quantityNumber > currentStock),
  );

  return (
    <main className="mx-auto w-full max-w-[1680px] space-y-5 pb-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            href="/dashboard/inventory"
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-blue-600"
          >
            <ArrowLeft size={15} />
            Inventory
            <span className="text-slate-300">/</span>
            <span className="text-slate-700">Stock Adjustment</span>
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">
            Stock Adjustment
          </h1>
          <p className="mt-1 text-sm text-slate-500 sm:text-base">
            Make audited corrections for damage, count differences, samples or manual stock intake.
          </p>
        </div>

        <button
          form="stock-adjustment-form"
          type="submit"
          disabled={(!canSubmit && !recovery) || pending || !ready}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PackageCheck size={18} />
          {pending ? "Saving…" : recovery ? "Retry / Check Adjustment" : "Save Adjustment"}
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(340px,.8fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <FileText size={18} />
            </div>
            <div>
              <h2 className="font-semibold text-slate-950">Adjustment Details</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Select a product, choose the adjustment type and record a reason.
              </p>
            </div>
          </div>

          <form
            id="stock-adjustment-form"
            action={formAction}
            className="space-y-5 p-5"
          >
            {recovery && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">An adjustment is awaiting confirmation. Retry checks the same request without adding stock twice.</p>}
            <fieldset disabled={pending || Boolean(recovery)} className="min-w-0 space-y-5">
            <input type="hidden" name="locationId" value={branchId} />
            <input type="hidden" name="expectedQuantity" value={currentStock} />
            <input type="hidden" name="mode" value={mode} />

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Product / Variant <span className="text-red-500">*</span>
                </span>
                <ProductVariantPicker
                  products={products}
                  value={productId}
                  onChange={setProductId}
                />
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Branch
                </span>
                <div className="flex h-12 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                  <Store size={17} className="text-slate-400" />
                  <div>
                    <p className="font-medium">{branchName}</p>
                    <p className="text-[10px] text-slate-400">Stock adjustment for this branch</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
              <div>
                <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Adjustment Type <span className="text-red-500">*</span>
                </span>
                <div className="grid overflow-hidden rounded-xl border border-slate-200 sm:grid-cols-3">
                  <ModeButton
                    active={mode === "increase"}
                    onClick={() => setMode("increase")}
                    icon={<ArrowUp size={17} />}
                    label="Increase stock"
                  />
                  <ModeButton
                    active={mode === "decrease"}
                    onClick={() => setMode("decrease")}
                    icon={<ArrowDown size={17} />}
                    label="Decrease stock"
                  />
                  <ModeButton
                    active={mode === "set"}
                    onClick={() => setMode("set")}
                    icon={<BarChart3 size={17} />}
                    label="Set exact stock"
                  />
                </div>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Quantity <span className="text-red-500">*</span>
                </span>
                <div className="relative">
                  <Hash
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    name="quantity"
                    required
                    type="number"
                    min={mode === "set" ? 0 : 1}
                    step={1}
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm font-semibold outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                {mode === "decrease" && quantityNumber > currentStock && (
                  <p className="mt-1 text-xs font-medium text-red-600">
                    Quantity exceeds current stock ({currentStock}).
                  </p>
                )}
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Reason <span className="text-red-500">*</span>
                </span>
                <div className="relative">
                  <FileText
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <select
                    name="reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    className="h-11 w-full appearance-none rounded-xl border border-slate-300 bg-white pl-9 pr-9 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    {reasons.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={15}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Reference
                </span>
                <div className="relative">
                  <Link2
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    name="reference"
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    placeholder="PO number, document, etc."
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </label>
            </div>

            <label className="block">
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-slate-700">Notes</span>
                <span className="text-[11px] text-slate-400">{notes.length}/500</span>
              </div>
              <textarea
                name="notes"
                maxLength={500}
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Add additional notes (optional)…"
                className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <BarChart3 size={17} className="text-blue-600" />
                Stock Impact Preview
              </div>
              <div className="mt-4 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-3 text-center">
                <ImpactValue label="Current Stock" value={currentStock.toLocaleString()} />
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-600">
                  {delta >= 0 ? "+" : "−"}
                </div>
                <ImpactValue
                  label="Adjustment"
                  value={`${delta > 0 ? "+" : ""}${delta}`}
                  valueClassName={delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-600" : "text-slate-900"}
                />
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-600">
                  =
                </div>
                <ImpactValue label="New Stock" value={newStock.toLocaleString()} />
              </div>
            </div>

            {state.message && (
              <div
                className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                  state.success
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {state.message}
              </div>
            )}

            <div className="flex items-start gap-2 text-xs text-slate-500">
              <Info size={15} className="mt-0.5 shrink-0 text-blue-600" />
              <p>
                This adjustment is applied immediately and recorded in the stock adjustment ledger with its reason and reference.
              </p>
            </div>
            </fieldset>
            <p className="text-xs text-slate-500">Stock corrections do not refund payments. Use Orders → Return items for customer refunds.</p>
          </form>
        </section>

        <aside className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Box size={18} />
            </div>
            <h2 className="font-semibold text-slate-950">Product Information</h2>
          </div>

          {!selectedProduct ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Select a product to see inventory information.
            </div>
          ) : (
            <div className="p-5">
              <div className="flex items-center gap-3">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  <ProductThumb src={selectedProduct.imageUrl} name={selectedProduct.name} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold text-slate-950">
                    {selectedProduct.name}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {variantText(selectedProduct)}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-400">
                    {selectedProduct.sku ? `SKU: ${selectedProduct.sku}` : "No SKU"}
                  </p>
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  Active
                </span>
              </div>

              <div className="my-5 border-t border-slate-100" />

              <InfoRows
                rows={[
                  ["Current Stock", currentStock.toLocaleString()],
                  ["Low-stock Threshold", selectedProduct.lowStockQuantity.toLocaleString()],
                  ["Selling Price", money(selectedProduct.sellingPrice)],
                ]}
              />

              <div className="my-5 border-t border-slate-100" />

              <InfoRows
                rows={[
                  ["Unit Cost", money(selectedProduct.costPrice)],
                  ["Inventory Value (Current)", money(currentStock * selectedProduct.costPrice)],
                  ["Inventory Value (After)", money(newStock * selectedProduct.costPrice)],
                ]}
                highlightLast={delta !== 0}
              />

              <div className="my-5 border-t border-slate-100" />

              <InfoRows rows={[["Last Updated", dateTime(selectedProduct.updatedAt)]]} />

              <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50/70 p-4">
                <div className="flex gap-3">
                  <Info size={18} className="mt-0.5 shrink-0 text-blue-600" />
                  <div>
                    <p className="text-sm font-semibold text-blue-700">Stock Adjustment</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Adjustments help keep inventory accurate. Completed changes remain in the audit ledger and should be corrected with a new adjustment instead of deleting history.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Clock3 size={18} />
            </div>
            <div>
              <h2 className="font-semibold text-slate-950">Recent Adjustments</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                View and track recent completed stock adjustments.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 sm:w-80">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search products, reference, etc…"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <select
              value={dateRange}
              onChange={(event) => setDateRange(event.target.value as DateRange)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="all">All time</option>
            </select>
          </div>
        </div>

        {filteredAdjustments.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <SlidersHorizontal size={22} />
            </div>
            <p className="mt-3 font-semibold text-slate-800">No stock adjustments found</p>
            <p className="mt-1 text-sm text-slate-500">
              Save an adjustment above or change the recent-adjustment filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-sm">
              <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Product / Variant</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Qty</th>
                  <th className="px-4 py-3">Stock</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAdjustments.map((adjustment) => {
                  const increase = adjustment.quantityDelta > 0;
                  const decrease = adjustment.quantityDelta < 0;
                  return (
                    <tr key={adjustment.id} className="transition hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                        {dateTime(adjustment.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                            <ProductThumb src={adjustment.imageUrl} name={adjustment.productName} />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900">
                              {adjustment.productName}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {[adjustment.color, adjustment.size, adjustment.sku]
                                .filter(Boolean)
                                .join(" · ") || "Standard item"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 font-medium ${
                            increase
                              ? "text-emerald-600"
                              : decrease
                                ? "text-red-600"
                                : "text-blue-600"
                          }`}
                        >
                          {increase ? (
                            <ArrowUp size={15} />
                          ) : decrease ? (
                            <ArrowDown size={15} />
                          ) : (
                            <BarChart3 size={15} />
                          )}
                          {increase ? "Increase" : decrease ? "Decrease" : "Set exact"}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-3 font-bold ${
                          increase ? "text-emerald-600" : decrease ? "text-red-600" : "text-slate-900"
                        }`}
                      >
                        {adjustment.quantityDelta > 0 ? "+" : ""}
                        {adjustment.quantityDelta}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {adjustment.stockBefore} → {adjustment.stockAfter}
                      </td>
                      <td className="max-w-[260px] px-4 py-3 text-slate-700">
                        <p className="line-clamp-2">{adjustment.reason}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {adjustment.reference || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 size={13} />
                          Completed
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
    </main>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-11 items-center justify-center gap-2 border-b border-slate-200 px-3 py-2.5 text-sm font-semibold transition last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 ${
        active
          ? "bg-blue-600 text-white"
          : "bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ImpactValue({
  label,
  value,
  valueClassName = "text-slate-950",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div>
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${valueClassName}`}>{value}</p>
    </div>
  );
}

function InfoRows({
  rows,
  highlightLast = false,
}: {
  rows: [string, string][];
  highlightLast?: boolean;
}) {
  return (
    <dl className="space-y-3">
      {rows.map(([label, value], index) => (
        <div key={label} className="flex items-center justify-between gap-4">
          <dt className="text-sm text-slate-500">{label}</dt>
          <dd
            className={`text-right text-sm font-semibold ${
              highlightLast && index === rows.length - 1
                ? "text-emerald-600"
                : "text-slate-900"
            }`}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
