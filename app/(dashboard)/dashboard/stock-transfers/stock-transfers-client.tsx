"use client";

import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Box,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleX,
  FileText,
  History,
  MapPin,
  MoreVertical,
  Pencil,
  Package,
  PackageCheck,
  Plus,
  RotateCcw,
  Search,
  Send,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import {
  createTransfer,
  deleteDraftTransfer,
  receiveTransfer,
  sendTransfer,
  updateTransferDraft,
} from "./actions";

export type TransferLocation = {
  id: string;
  name: string;
};

export type TransferProduct = {
  id: string;
  name: string;
  sku: string | null;
  size: string | null;
  color: string | null;
  imageUrl: string | null;
  categoryId: string | null;
  categoryName: string;
  businessStock: number;
};

export type TransferLocationStock = {
  locationId: string;
  productId: string;
  quantity: number;
};

export type TransferItem = {
  productId: string;
  quantity: number;
};

type DraftBuilderItem = {
  productId: string;
  quantity: number;
};

export type TransferRow = {
  id: string;
  transferNumber: string;
  status: string;
  sourceLocationId: string;
  destinationLocationId: string;
  note: string | null;
  createdAt: string;
  createdBy: string | null;
  items: TransferItem[];
};

type Props = {
  locations: TransferLocation[];
  products: TransferProduct[];
  locationStock: TransferLocationStock[];
  transfers: TransferRow[];
};

const inputClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

const primaryButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60";

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function transferStatusLabel(status: string) {
  if (status === "in_transit") return "In Transit";
  if (status === "partially_received") return "Partially Received";
  if (status === "received") return "Received";
  if (status === "cancelled") return "Cancelled";
  if (status === "sent") return "Sent";
  return "Draft";
}

function statusClasses(status: string) {
  if (status === "received") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "in_transit" || status === "sent") {
    return "bg-blue-50 text-blue-700 ring-blue-200";
  }
  if (status === "partially_received") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }
  if (status === "cancelled") return "bg-rose-50 text-rose-700 ring-rose-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusClasses(
        status,
      )}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {transferStatusLabel(status)}
    </span>
  );
}

function StatCard({
  icon,
  title,
  value,
  subtitle,
  tone,
}: {
  icon: ReactNode;
  title: string;
  value: number;
  subtitle: string;
  tone: "blue" | "slate" | "cyan" | "emerald" | "rose";
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-600",
    slate: "bg-slate-100 text-slate-600",
    cyan: "bg-sky-50 text-sky-600",
    emerald: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-600",
  } as const;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{title}</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

function productLabel(product: TransferProduct) {
  return [product.name, product.color, product.size, product.sku]
    .filter(Boolean)
    .join(" · ");
}

function productSubtitle(product: TransferProduct) {
  return [product.color, product.size].filter(Boolean).join(" / ") || product.sku || "Variant";
}

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

function ProductVariantPicker({
  products,
  value,
  onChange,
  stockForProduct,
}: {
  products: TransferProduct[];
  value: string;
  onChange: (productId: string) => void;
  stockForProduct: (product: TransferProduct) => number;
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
    const map = new Map<string, TransferProduct[]>();
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
    setHighlightedIndex(0);
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [open, query, categoryFilter, colorFilter]);

  function selectProduct(product: TransferProduct) {
    if (stockForProduct(product) <= 0) return;
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
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
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
                        disabled={outOfStock}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        onClick={() => selectProduct(product)}
                        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
                          active
                            ? "bg-blue-50 ring-1 ring-inset ring-blue-400"
                            : highlighted
                              ? "bg-slate-50"
                              : "hover:bg-slate-50"
                        } ${outOfStock ? "cursor-not-allowed opacity-55" : ""}`}
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

export default function StockTransfersClient({
  locations,
  products,
  locationStock,
  transfers,
}: Props) {
  const router = useRouter();

  const [createOpen, setCreateOpen] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [sourceLocationId, setSourceLocationId] = useState("");
  const [destinationLocationId, setDestinationLocationId] = useState("");
  const [productId, setProductId] = useState("");
  const [draftQuantity, setDraftQuantity] = useState(1);
  const [draftItems, setDraftItems] = useState<DraftBuilderItem[]>([]);
  const [note, setNote] = useState("");
  const [editingTransferId, setEditingTransferId] = useState<string | null>(null);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [deletePendingId, setDeletePendingId] = useState<string | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedTransferId, setSelectedTransferId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [page, setPage] = useState(1);

  const locationMap = useMemo(
    () => new Map(locations.map((location) => [location.id, location.name])),
    [locations],
  );
  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const locationStockMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const stock of locationStock) {
      map.set(`${stock.locationId}:${stock.productId}`, Number(stock.quantity ?? 0));
    }
    return map;
  }, [locationStock]);

  function stockForProduct(product: TransferProduct) {
    if (!sourceLocationId) return 0;
    return (
      locationStockMap.get(`${sourceLocationId}:${product.id}`) ?? 0
    );
  }

  const selectedProduct = productId ? productMap.get(productId) ?? null : null;
  const availableStock = selectedProduct ? stockForProduct(selectedProduct) : null;

  const totals = useMemo(() => {
    const statusCount = (status: string) => transfers.filter((transfer) => transfer.status === status).length;
    return {
      total: transfers.length,
      draft: statusCount("draft"),
      inTransit: transfers.filter((transfer) =>
        ["sent", "in_transit", "partially_received"].includes(transfer.status),
      ).length,
      received: statusCount("received"),
      cancelled: statusCount("cancelled"),
    };
  }, [transfers]);

  const filteredTransfers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return transfers.filter((transfer) => {
      if (statusFilter !== "all" && transfer.status !== statusFilter) return false;
      if (
        branchFilter !== "all" &&
        transfer.sourceLocationId !== branchFilter &&
        transfer.destinationLocationId !== branchFilter
      ) {
        return false;
      }
      if (!needle) return true;

      const itemText = transfer.items
        .map((item) => {
          const product = productMap.get(item.productId);
          return product ? productLabel(product) : item.productId;
        })
        .join(" ")
        .toLowerCase();

      return [
        transfer.transferNumber,
        transfer.note ?? "",
        locationMap.get(transfer.sourceLocationId) ?? "",
        locationMap.get(transfer.destinationLocationId) ?? "",
        itemText,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [branchFilter, locationMap, productMap, search, statusFilter, transfers]);

  const PAGE_SIZE = 5;
  const totalPages = Math.max(1, Math.ceil(filteredTransfers.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleTransfers = filteredTransfers.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const selectedTransfer = selectedTransferId
    ? transfers.find((transfer) => transfer.id === selectedTransferId) ?? null
    : null;

  function resetDraftBuilder() {
    setSourceLocationId("");
    setDestinationLocationId("");
    setProductId("");
    setDraftQuantity(1);
    setDraftItems([]);
    setNote("");
    setCreateError(null);
  }

  function beginEditTransfer(transfer: TransferRow) {
    if (transfer.status !== "draft") {
      return;
    }

    setEditingTransferId(transfer.id);
    setSourceLocationId(transfer.sourceLocationId);
    setDestinationLocationId(transfer.destinationLocationId);
    setProductId("");
    setDraftQuantity(1);
    setDraftItems(
      transfer.items.map((item) => ({
        productId: item.productId,
        quantity: Number(item.quantity || 0),
      })),
    );
    setNote(transfer.note ?? "");
    setCreateError(null);
    setActionMenuId(null);
    setHistoryOpen(false);
    setSelectedTransferId(null);
    setCreateOpen(true);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  async function handleDeleteDraft(transfer: TransferRow) {
    if (transfer.status !== "draft" || deletePendingId) {
      return;
    }

    const confirmed = window.confirm(
      `Delete draft ${transfer.transferNumber}? This removes the draft and its items permanently.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletePendingId(transfer.id);
    setActionMenuId(null);

    const formData = new FormData();
    formData.set("transferId", transfer.id);

    try {
      await deleteDraftTransfer(formData);

      if (selectedTransferId === transfer.id) {
        setSelectedTransferId(null);
        setHistoryOpen(false);
      }

      if (editingTransferId === transfer.id) {
        resetDraftBuilder();
        setEditingTransferId(null);
        setCreateOpen(false);
      }

      router.refresh();
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Unable to delete this draft.",
      );
    } finally {
      setDeletePendingId(null);
    }
  }

  function addDraftItem() {
    setCreateError(null);

    if (!sourceLocationId) {
      setCreateError("Choose the From Branch before adding products.");
      return;
    }

    if (!productId || !selectedProduct) {
      setCreateError("Choose a product / variant first.");
      return;
    }

    if (!Number.isInteger(draftQuantity) || draftQuantity <= 0) {
      setCreateError("Quantity must be a positive whole number.");
      return;
    }

    const alreadyStaged =
      draftItems.find((item) => item.productId === productId)?.quantity ?? 0;
    const nextQuantity = alreadyStaged + draftQuantity;
    const stock = stockForProduct(selectedProduct);

    if (stock <= 0) {
      setCreateError("This variant has no available stock in the selected branch.");
      return;
    }

    if (nextQuantity > stock) {
      setCreateError(
        `${selectedProduct.name} has ${stock} available in the selected branch.`,
      );
      return;
    }

    setDraftItems((current) => {
      const existing = current.find((item) => item.productId === productId);
      if (existing) {
        return current.map((item) =>
          item.productId === productId
            ? { ...item, quantity: item.quantity + draftQuantity }
            : item,
        );
      }

      return [...current, { productId, quantity: draftQuantity }];
    });
    setProductId("");
    setDraftQuantity(1);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createPending) return;

    if (!sourceLocationId || !destinationLocationId) {
      setCreateError("Choose the From Branch and To Branch.");
      return;
    }

    if (sourceLocationId === destinationLocationId) {
      setCreateError("From Branch and To Branch must be different.");
      return;
    }

    if (draftItems.length === 0) {
      setCreateError("Add at least one product / variant before creating the draft.");
      return;
    }

    setCreatePending(true);
    setCreateError(null);

    const formData = new FormData();
    formData.set("sourceLocationId", sourceLocationId);
    formData.set("destinationLocationId", destinationLocationId);
    formData.set("note", note);
    formData.set("itemsJson", JSON.stringify(draftItems));

    try {
      if (editingTransferId) {
        formData.set("transferId", editingTransferId);
        await updateTransferDraft(formData);
      } else {
        await createTransfer(formData);
      }

      resetDraftBuilder();
      setEditingTransferId(null);
      setCreateOpen(false);
      setActionMenuId(null);
      router.refresh();
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Unable to create stock transfer.",
      );
    } finally {
      setCreatePending(false);
    }
  }

  function openTransfer(transferId: string) {
    setSelectedTransferId(transferId);
    setHistoryOpen(true);
  }

  return (
    <>
      <main className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">Stock Transfers</h1>
            <p className="mt-1 text-sm text-slate-500">
              Move exact product variants between branches with send and receive control.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedTransferId(null);
                setHistoryOpen(true);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700"
            >
              <History size={17} />
              Transfer history
            </button>
            <button
              type="button"
              onClick={() => {
                resetDraftBuilder();
                setEditingTransferId(null);
                setCreateError(null);
                setCreateOpen(true);
              }}
              className={primaryButton}
            >
              <Plus size={17} />
              New Transfer
            </button>
          </div>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            icon={<ArrowRightLeft size={22} />}
            title="Total Transfers"
            value={totals.total}
            subtitle="All time transfers"
            tone="blue"
          />
          <StatCard
            icon={<FileText size={22} />}
            title="Draft"
            value={totals.draft}
            subtitle="Awaiting to be sent"
            tone="slate"
          />
          <StatCard
            icon={<Truck size={22} />}
            title="In Transit"
            value={totals.inTransit}
            subtitle="Transfers moving now"
            tone="cyan"
          />
          <StatCard
            icon={<CheckCircle2 size={22} />}
            title="Received"
            value={totals.received}
            subtitle="Completed transfers"
            tone="emerald"
          />
          <StatCard
            icon={<CircleX size={22} />}
            title="Cancelled"
            value={totals.cancelled}
            subtitle="Cancelled transfers"
            tone="rose"
          />
        </section>

        {createOpen && (
          <section className="overflow-visible rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white">
                  <Plus size={19} />
                </div>
                <div>
                  <h2 className="font-semibold text-slate-950">
                    {editingTransferId ? "Edit Draft Transfer" : "Create Transfer"}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {editingTransferId
                      ? "Update branches, items or note before the transfer is sent."
                      : "Add one or more product variants, then create the draft."}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetDraftBuilder}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  <RotateCcw size={15} />
                  Clear All
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resetDraftBuilder();
                    setEditingTransferId(null);
                    setCreateOpen(false);
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
                  aria-label="Close create transfer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <form onSubmit={handleCreate} className="p-5">
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-700">From Branch</span>
                  <select
                    required
                    value={sourceLocationId}
                    onChange={(event) => {
                      const nextSource = event.target.value;
                      setSourceLocationId(nextSource);
                      setProductId("");
                      setDraftItems([]);
                      setCreateError(null);
                      if (destinationLocationId === nextSource) {
                        setDestinationLocationId("");
                      }
                    }}
                    className={inputClass}
                  >
                    <option value="">Select branch</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                  <span className="block text-[11px] text-slate-400">
                    Available stock is checked from this branch.
                  </span>
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-700">To Branch</span>
                  <select
                    required
                    value={destinationLocationId}
                    onChange={(event) => {
                      setDestinationLocationId(event.target.value);
                      setCreateError(null);
                    }}
                    className={inputClass}
                  >
                    <option value="">Select branch</option>
                    {locations
                      .filter((location) => location.id !== sourceLocationId)
                      .map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>

              <div className="mt-4 grid items-end gap-3 lg:grid-cols-[minmax(0,1fr)_130px_auto]">
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-700">Product / Variant</span>
                  <ProductVariantPicker
                    products={products.filter(product => sourceLocationId && locationStockMap.has(`${sourceLocationId}:${product.id}`))}
                    value={productId}
                    onChange={(nextProductId) => {
                      setProductId(nextProductId);
                      setCreateError(null);
                    }}
                    stockForProduct={stockForProduct}
                  />
                  <span className="block min-h-4 text-[11px] text-slate-500">
                    {selectedProduct
                      ? `Available in selected branch: ${availableStock ?? 0}`
                      : sourceLocationId
                        ? "Choose a variant to see branch stock."
                        : "Choose From Branch first to check branch stock."}
                  </span>
                </div>

                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-700">Quantity</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={draftQuantity}
                    onChange={(event) => setDraftQuantity(Number(event.target.value))}
                    className={inputClass}
                  />
                  <span className="block min-h-4 text-[11px] text-transparent">Quantity</span>
                </label>

                <div className="pb-4">
                  <button
                    type="button"
                    onClick={addDraftItem}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                  >
                    <Plus size={16} />
                    Add Item
                  </button>
                </div>
              </div>

              {draftItems.length > 0 && (
                <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between bg-slate-50 px-4 py-2.5">
                    <p className="text-sm font-semibold text-slate-800">
                      Transfer items ({draftItems.length})
                    </p>
                    <p className="text-xs text-slate-500">
                      {draftItems.reduce((sum, item) => sum + item.quantity, 0)} total quantity
                    </p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {draftItems.map((item) => {
                      const product = productMap.get(item.productId);
                      return (
                        <div
                          key={item.productId}
                          className="grid grid-cols-[minmax(0,1fr)_100px_40px] items-center gap-3 px-4 py-2.5"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                              {product?.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={product.imageUrl}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <Box size={17} className="text-slate-400" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-800">
                                {product?.name ?? item.productId}
                              </p>
                              <p className="truncate text-xs text-slate-500">
                                {product
                                  ? [product.color, product.size, product.sku]
                                      .filter(Boolean)
                                      .join(" · ")
                                  : "Variant"}
                              </p>
                            </div>
                          </div>
                          <label>
                            <span className="sr-only">Quantity</span>
                            <input
                              type="number"
                              min={1}
                              max={product ? stockForProduct(product) : undefined}
                              value={item.quantity}
                              onChange={(event) => {
                                const nextQuantity = Math.max(1, Number(event.target.value) || 1);
                                setDraftItems((current) =>
                                  current.map((row) =>
                                    row.productId === item.productId
                                      ? {
                                          ...row,
                                          quantity: product
                                            ? Math.min(nextQuantity, stockForProduct(product))
                                            : nextQuantity,
                                        }
                                      : row,
                                  ),
                                );
                              }}
                              className="h-9 w-full rounded-lg border border-slate-200 px-2 text-center text-sm outline-none focus:border-blue-500"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              setDraftItems((current) =>
                                current.filter((row) => row.productId !== item.productId),
                              )
                            }
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-rose-500 transition hover:bg-rose-50"
                            aria-label={`Remove ${product?.name ?? "item"}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-700">
                    Reference / Note (Optional)
                  </span>
                  <input
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    className={inputClass}
                    placeholder="e.g. Stock for new store opening..."
                  />
                </label>
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      resetDraftBuilder();
                      setCreateOpen(false);
                    }}
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      createPending ||
                      !sourceLocationId ||
                      !destinationLocationId ||
                      draftItems.length === 0
                    }
                    className={`${primaryButton} h-11`}
                  >
                    {createPending ? (editingTransferId ? "Saving Draft..." : "Creating Draft...") : editingTransferId ? "Save Draft" : "Create Draft"}
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>

              {createError && (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {createError}
                </div>
              )}
            </form>
          </section>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <ArrowRightLeft size={18} />
              </div>
              <div>
                <h2 className="font-semibold text-slate-950">Recent Transfers</h2>
                <p className="text-sm text-slate-500">Manage and track stock transfers across your branches.</p>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Showing {filteredTransfers.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(safePage * PAGE_SIZE, filteredTransfers.length)} of {filteredTransfers.length}
            </p>
          </div>

          <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[1.5fr_180px_180px]">
            <label className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search transfers, reference, or products..."
                className={`${inputClass} pl-9`}
              />
            </label>

            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
              className={inputClass}
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="in_transit">In Transit</option>
              <option value="partially_received">Partially Received</option>
              <option value="received">Received</option>
              <option value="cancelled">Cancelled</option>
            </select>

            <select
              value={branchFilter}
              onChange={(event) => {
                setBranchFilter(event.target.value);
                setPage(1);
              }}
              className={inputClass}
            >
              <option value="all">All Branches</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Transfer ID</th>
                  <th className="px-4 py-3">From Branch</th>
                  <th className="px-4 py-3">To Branch</th>
                  <th className="px-4 py-3">Items</th>
                  <th className="px-4 py-3">Total Qty</th>
                  <th className="px-4 py-3">Created Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleTransfers.map((transfer) => {
                  const totalQuantity = transfer.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
                  return (
                    <tr
                      key={transfer.id}
                      className="cursor-pointer transition hover:bg-blue-50/40"
                      onClick={() => openTransfer(transfer.id)}
                    >
                      <td className="px-5 py-3 font-semibold text-blue-600">{transfer.transferNumber}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {locationMap.get(transfer.sourceLocationId) ?? "Source"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {locationMap.get(transfer.destinationLocationId) ?? "Destination"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {transfer.items.length} {transfer.items.length === 1 ? "item" : "items"}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">{totalQuantity}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDateTime(transfer.createdAt)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={transfer.status} />
                      </td>
                      <td className="relative px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setActionMenuId((current) =>
                              current === transfer.id ? null : transfer.id,
                            );
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                          aria-label={`Actions for ${transfer.transferNumber}`}
                        >
                          <MoreVertical size={16} />
                        </button>

                        {actionMenuId === transfer.id && (
                          <div
                            className="absolute right-4 top-11 z-30 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 text-left shadow-xl"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {transfer.status === "draft" ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => beginEditTransfer(transfer)}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                                >
                                  <Pencil size={15} />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  disabled={deletePendingId === transfer.id}
                                  onClick={() => void handleDeleteDraft(transfer)}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                                >
                                  <Trash2 size={15} />
                                  {deletePendingId === transfer.id ? "Deleting..." : "Delete"}
                                </button>
                              </>
                            ) : (
                              <p className="px-3 py-2 text-xs text-slate-500">
                                Sent transfers are locked.
                              </p>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {visibleTransfers.length === 0 && (
              <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center">
                <Package size={36} className="text-slate-300" />
                <p className="mt-3 font-semibold text-slate-700">No transfers match these filters</p>
                <p className="mt-1 text-sm text-slate-500">Create a new transfer or change the filters.</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
            <p className="text-xs text-slate-500">{filteredTransfers.length} transfer records</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 disabled:opacity-40"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-blue-600 px-2 text-xs font-semibold text-white">
                {safePage}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 disabled:opacity-40"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </section>
      </main>

      {historyOpen && (
        <div className="fixed inset-0 z-[90]">
          <button
            type="button"
            aria-label="Close transfer history"
            onClick={() => setHistoryOpen(false)}
            className="absolute inset-0 bg-slate-950/25"
          />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-[500px] flex-col border-l border-slate-200 bg-white shadow-2xl">
            {selectedTransfer ? (
              <TransferDetails
                transfer={selectedTransfer}
                locationMap={locationMap}
                productMap={productMap}
                onEdit={() => beginEditTransfer(selectedTransfer)}
                onDelete={() => void handleDeleteDraft(selectedTransfer)}
                deletePending={deletePendingId === selectedTransfer.id}
                onBack={() => setSelectedTransferId(null)}
                onClose={() => setHistoryOpen(false)}
              />
            ) : (
              <TransferHistoryList
                transfers={transfers}
                locations={locations}
                locationMap={locationMap}
                onOpen={setSelectedTransferId}
                onClose={() => setHistoryOpen(false)}
              />
            )}
          </aside>
        </div>
      )}
    </>
  );
}

function TransferHistoryList({
  transfers,
  locations,
  locationMap,
  onOpen,
  onClose,
}: {
  transfers: TransferRow[];
  locations: TransferLocation[];
  locationMap: Map<string, string>;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState("all");
  const [branch, setBranch] = useState("all");

  const rows = transfers.filter((transfer) => {
    if (status !== "all" && transfer.status !== status) return false;
    if (
      branch !== "all" &&
      transfer.sourceLocationId !== branch &&
      transfer.destinationLocationId !== branch
    ) {
      return false;
    }
    return true;
  });

  return (
    <>
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Transfer history</h2>
          <p className="text-sm text-slate-500">Review every stock movement between branches.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
        >
          <X size={19} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-slate-200 p-4">
        <select value={status} onChange={(event) => setStatus(event.target.value)} className={inputClass}>
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="in_transit">In Transit</option>
          <option value="partially_received">Partially Received</option>
          <option value="received">Received</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select value={branch} onChange={(event) => setBranch(event.target.value)} className={inputClass}>
          <option value="all">All branches</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-2">
          {rows.map((transfer) => {
            const qty = transfer.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
            return (
              <button
                type="button"
                key={transfer.id}
                onClick={() => onOpen(transfer.id)}
                className="w-full rounded-2xl border border-slate-200 p-4 text-left transition hover:border-blue-200 hover:bg-blue-50/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{transfer.transferNumber}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatDateTime(transfer.createdAt)}</p>
                  </div>
                  <StatusBadge status={transfer.status} />
                </div>
                <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                  <span>{locationMap.get(transfer.sourceLocationId) ?? "Source"}</span>
                  <ArrowRight size={14} className="text-slate-400" />
                  <span>{locationMap.get(transfer.destinationLocationId) ?? "Destination"}</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {transfer.items.length} {transfer.items.length === 1 ? "item" : "items"} · {qty} total quantity
                </p>
              </button>
            );
          })}

          {rows.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 px-5 py-10 text-center text-sm text-slate-500">
              No transfer history matches these filters.
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function TransferDetails({
  transfer,
  locationMap,
  productMap,
  onEdit,
  onDelete,
  deletePending,
  onBack,
  onClose,
}: {
  transfer: TransferRow;
  locationMap: Map<string, string>;
  productMap: Map<string, TransferProduct>;
  onEdit: () => void;
  onDelete: () => void;
  deletePending: boolean;
  onBack: () => void;
  onClose: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const totalQuantity = transfer.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const progress =
    transfer.status === "received"
      ? 3
      : transfer.status === "in_transit" || transfer.status === "sent" || transfer.status === "partially_received"
        ? 2
        : 1;

  return (
    <>
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-600"
        >
          <ArrowLeft size={16} />
          Transfer history
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
        >
          <X size={19} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-950">{transfer.transferNumber}</h2>
            <p className="mt-1 text-sm text-slate-500">Created {formatDateTime(transfer.createdAt)}</p>
          </div>

          <div className="relative flex items-center gap-2">
            <StatusBadge status={transfer.status} />
            {transfer.status === "draft" && (
              <>
                <button
                  type="button"
                  onClick={() => setMenuOpen((current) => !current)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                  aria-label="Draft transfer actions"
                >
                  <MoreVertical size={16} />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-10 z-20 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onEdit();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Pencil size={15} />
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={deletePending}
                      onClick={() => {
                        setMenuOpen(false);
                        onDelete();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                    >
                      <Trash2 size={15} />
                      {deletePending ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl bg-slate-50 p-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">From Branch</p>
            <p className="mt-1 flex items-center gap-1.5 font-semibold text-slate-800">
              <MapPin size={15} className="text-blue-600" />
              {locationMap.get(transfer.sourceLocationId) ?? "Source"}
            </p>
          </div>
          <ArrowRight size={18} className="text-slate-400" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">To Branch</p>
            <p className="mt-1 flex items-center gap-1.5 font-semibold text-slate-800">
              <MapPin size={15} className="text-blue-600" />
              {locationMap.get(transfer.destinationLocationId) ?? "Destination"}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Total Items</p>
            <p className="mt-1 text-xl font-bold text-slate-950">{transfer.items.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Total Quantity</p>
            <p className="mt-1 text-xl font-bold text-slate-950">{totalQuantity}</p>
          </div>
        </div>

        <div className="mt-5">
          <p className="text-sm font-semibold text-slate-800">Transfer Progress</p>
          <div className="mt-3 grid grid-cols-3 gap-1">
            {["Draft", "In Transit", "Received"].map((label, index) => {
              const step = index + 1;
              const active = step <= progress && transfer.status !== "cancelled";
              return (
                <div key={label} className="text-center">
                  <div className="relative flex items-center justify-center">
                    {index > 0 && (
                      <div className={`absolute right-1/2 top-1/2 h-0.5 w-full -translate-y-1/2 ${active ? "bg-blue-500" : "bg-slate-200"}`} />
                    )}
                    <div className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 ${active ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-400"}`}>
                      {active ? <CheckCircle2 size={14} /> : step}
                    </div>
                  </div>
                  <p className={`mt-2 text-xs font-semibold ${active ? "text-slate-800" : "text-slate-400"}`}>{label}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-800">Items ({transfer.items.length})</p>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="grid grid-cols-[1fr_72px] bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <span>Product / Variant</span>
              <span className="text-right">Qty</span>
            </div>
            <div className="divide-y divide-slate-100">
              {transfer.items.map((item) => {
                const product = productMap.get(item.productId);
                return (
                  <div key={item.productId} className="grid grid-cols-[1fr_72px] items-center gap-3 px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                        {product?.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Box size={17} className="text-slate-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {product?.name ?? item.productId}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {product ? productSubtitle(product) : "Product"}
                        </p>
                      </div>
                    </div>
                    <p className="text-right text-sm font-semibold text-slate-800">{item.quantity}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>



        {transfer.note && (
          <div className="mt-5 rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-800">Reference / Note</p>
            <p className="mt-2 text-sm text-slate-600">{transfer.note}</p>
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 p-4">
        {transfer.status === "draft" && (
          <form action={sendTransfer}>
            <input type="hidden" name="transferId" value={transfer.id} />
            <button className={`${primaryButton} w-full`}>
              <Send size={16} />
              Send Transfer
            </button>
          </form>
        )}
        {(transfer.status === "in_transit" || transfer.status === "sent" || transfer.status === "partially_received") && (
          <form action={receiveTransfer}>
            <input type="hidden" name="transferId" value={transfer.id} />
            <button className={`${primaryButton} w-full`}>
              <PackageCheck size={16} />
              Mark as Received
            </button>
          </form>
        )}
        {transfer.status === "received" && (
          <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            <CheckCircle2 size={17} />
            Transfer received
          </div>
        )}
        {transfer.status === "cancelled" && (
          <div className="flex items-center justify-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            <CircleX size={17} />
            Transfer cancelled
          </div>
        )}
      </div>
    </>
  );
}
