"use client";
import ProductPicker from "@/components/product-picker";
import { Modal } from "../pos/pos-workspace-components";

import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Box,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleX,
  FileText,
  Loader2,
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
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  createTransfer,
  cancelDraftTransfer,
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
  if (status === "draft") return "Draft";
  return status.replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
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

function productLabel(product: TransferProduct) {
  return [product.name, product.color, product.size, product.sku]
    .filter(Boolean)
    .join(" · ");
}

function productSubtitle(product: TransferProduct) {
  return [product.color, product.size].filter(Boolean).join(" / ") || product.sku || "Variant";
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
  const [draftItems, setDraftItems] = useState<DraftBuilderItem[]>([]);
  const [note, setNote] = useState("");
  const [editingTransferId, setEditingTransferId] = useState<string | null>(null);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<TransferRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelPending, setCancelPending] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("all");

  const [detailsOpen, setDetailsOpen] = useState(false);
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

  const volume = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const dates = Array.from({ length: 14 }, (_, index) => new Date(Date.parse(today) - (13 - index) * 86400000).toISOString().slice(0, 10));
    const counts = dates.map(date => transfers.filter(transfer => transfer.createdAt.slice(0, 10) === date).length);
    const max = Math.max(1, ...counts);
    return { total: counts.reduce((sum, count) => sum + count, 0), points: counts.map((count, index) => `${index * 10},${36 - count / max * 30}`).join(" ") };
  }, [transfers]);

  const filteredTransfers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return transfers.filter((transfer) => {
      if (activeTab !== "all" && (activeTab === "in_transit"
        ? !["sent", "in_transit", "partially_received"].includes(transfer.status)
        : transfer.status !== activeTab)) return false;
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
  }, [activeTab, branchFilter, locationMap, productMap, search, statusFilter, transfers]);

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
    setDraftItems(
      transfer.items.map((item) => ({
        productId: item.productId,
        quantity: Number(item.quantity || 0),
      })),
    );
    setNote(transfer.note ?? "");
    setCreateError(null);
    setActionMenuId(null);
    setDetailsOpen(false);
    setSelectedTransferId(null);
    setCreateOpen(true);
  }

  function openCancel(transfer: TransferRow) {
    if (transfer.status !== "draft") return;
    setActionMenuId(null);
    setCancelReason("");
    setCancelError(null);
    setCancelTarget(transfer);
  }

  async function handleCancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cancelTarget || cancelPending || !cancelReason.trim()) return;
    setCancelPending(true);
    setCancelError(null);
    const data = new FormData();
    data.set("transferId", cancelTarget.id);
    data.set("reason", cancelReason);
    try {
      await cancelDraftTransfer(data);
      setCancelTarget(null);
      setDetailsOpen(false);
      router.refresh();
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : "Unable to cancel transfer.");
    } finally {
      setCancelPending(false);
    }
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
    setDetailsOpen(true);
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

        <section aria-label="Transfer summary" className="flex flex-wrap items-center gap-x-6 gap-y-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-center gap-3 border-r border-slate-200 pr-6">
            <span className="rounded-xl bg-blue-50 p-2.5 text-blue-600"><ArrowRightLeft size={22} /></span>
            <div><p className="text-xs text-slate-500">Total</p><p className="text-xl font-bold text-slate-950">{totals.total}</p></div>
          </div>
          {[
            { label: "Draft", value: totals.draft, color: "bg-slate-400" },
            { label: "In Transit", value: totals.inTransit, color: "bg-blue-500" },
            { label: "Received", value: totals.received, color: "bg-emerald-500" },
            { label: "Cancelled", value: totals.cancelled, color: "bg-rose-500" },
          ].map(stat => <div key={stat.label} className="flex items-center gap-2.5">
            <span className={`h-2.5 w-2.5 rounded-full ${stat.color}`} />
            <span className="text-xs text-slate-500">{stat.label}</span>
            <strong className="text-lg text-slate-950">{stat.value}</strong>
          </div>)}
          <div className="ml-auto flex items-center gap-3 border-l border-slate-100 pl-5">
            <svg viewBox="0 0 130 40" className="h-12 w-28 text-teal-400" role="img" aria-label="Transfers created over the last 14 days">
              <polygon points={`0,40 ${volume.points} 130,40`} fill="currentColor" opacity="0.12" />
              <polyline points={volume.points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
            <div><p className="text-xs text-slate-500">Transfer volume</p><p className="mt-1 text-[11px] text-slate-400">Last 14 days</p><p className="text-sm font-semibold text-teal-600">{volume.total} transfers</p></div>
          </div>
        </section>

        {createOpen && (
          <Modal
            title={editingTransferId ? "Edit Draft Transfer" : "New Transfer"}
            wide
            locked={createPending}
            onClose={() => {
              resetDraftBuilder();
              setEditingTransferId(null);
              setCreateOpen(false);
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-500">
                {editingTransferId
                  ? "Update branches, items or note before the transfer is sent."
                  : "Add one or more product variants, then create the draft."}
              </p>
              <button
                type="button"
                onClick={resetDraftBuilder}
                disabled={createPending}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                <RotateCcw size={15} /> Clear All
              </button>
            </div>

            <form onSubmit={handleCreate} className="mt-4">
              <fieldset disabled={createPending} className="min-w-0">
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-slate-700">From Branch</span>
                  <select
                    required
                    value={sourceLocationId}
                    onChange={(event) => {
                      const nextSource = event.target.value;
                      setSourceLocationId(nextSource);
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

              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold text-slate-700">Product / Variant</p>
                <ProductPicker
                  products={products.filter(product => stockForProduct(product) > 0).map(product => ({
                    id: product.id, name: product.name, image: product.imageUrl, sku: product.sku,
                    variant: [product.size, product.color, `${stockForProduct(product)} available`].filter(Boolean).join(" / "),
                  }))}
                  value={draftItems.map(item => item.productId)}
                  onChange={ids => {
                    setDraftItems(current => ids.map(productId => current.find(item => item.productId === productId) ?? { productId, quantity: 1 }));
                    setCreateError(null);
                  }}
                />
                <p className="text-xs text-slate-500">{sourceLocationId ? "Select products or individual sizes/colors, then adjust quantities below." : "Choose From Branch to load available products."}</p>
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
              </fieldset>
            </form>
          </Modal>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <nav aria-label="Transfer status" className="flex overflow-x-auto border-b border-slate-200 px-3">
            {[
              { value: "all", label: "All", icon: ArrowRightLeft },
              { value: "draft", label: "Drafts", icon: FileText },
              { value: "in_transit", label: "In Transit", icon: Truck },
              { value: "received", label: "Received", icon: CheckCircle2 },
              { value: "cancelled", label: "Cancelled", icon: CircleX },
            ].map(tab => <button key={tab.value} type="button" aria-current={activeTab === tab.value ? "page" : undefined}
              onClick={() => { setActiveTab(tab.value); setStatusFilter("all"); setPage(1); setActionMenuId(null); }}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-4 text-sm font-semibold ${activeTab === tab.value ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
              <tab.icon size={17} />{tab.label}
            </button>)}
          </nav>

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
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
              className={inputClass}
            >
              <option value="all">All Statuses</option>
              {Array.from(new Set(transfers.map(transfer => transfer.status))).sort().map(status => (
                <option key={status} value={status}>{transferStatusLabel(status)}</option>
              ))}
            </select>

            <select
              aria-label="Filter by branch"
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
                      <td className="px-4 py-3 text-right">
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

      {actionMenuId && (() => {
        const transfer = transfers.find(row => row.id === actionMenuId);
        return transfer ? <Modal title={`Actions · ${transfer.transferNumber}`} onClose={() => setActionMenuId(null)}>
          <div className="space-y-2">
            <button type="button" onClick={() => { setActionMenuId(null); openTransfer(transfer.id); }} className="flex w-full items-center gap-2 rounded-xl border border-slate-200 p-3 text-left"><FileText size={17} />View details</button>
            {transfer.status === "draft" && <>
              <button type="button" onClick={() => beginEditTransfer(transfer)} className="flex w-full items-center gap-2 rounded-xl border border-slate-200 p-3 text-left"><Pencil size={17} />Edit</button>
              <button type="button" onClick={() => openCancel(transfer)} className="flex w-full items-center gap-2 rounded-xl bg-rose-50 p-3 text-left text-rose-600"><CircleX size={17} />Cancel transfer</button>
            </>}
          </div>
        </Modal> : null;
      })()}
      {cancelTarget && <Modal title={`Cancel ${cancelTarget.transferNumber}?`} locked={cancelPending} onClose={() => setCancelTarget(null)}>
        <form onSubmit={handleCancel} className="space-y-4">
          <p className="text-sm text-slate-500">The draft and its items will remain available for reference. No stock will move.</p>
          <label className="block text-sm font-semibold text-slate-700">Cancellation reason
            <textarea required maxLength={500} rows={3} value={cancelReason} disabled={cancelPending} onChange={event => setCancelReason(event.target.value)} className={`${inputClass} mt-2 h-auto`} />
          </label>
          {cancelError && <p role="alert" className="text-sm text-rose-600">{cancelError}</p>}
          <button type="submit" disabled={cancelPending || !cancelReason.trim()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 p-3 font-semibold text-white disabled:opacity-50">
            {cancelPending ? <Loader2 size={17} className="animate-spin" /> : <CircleX size={17} />}{cancelPending ? "Cancelling…" : "Cancel transfer"}
          </button>
        </form>
      </Modal>}
      {detailsOpen && selectedTransfer && (
        <div className="fixed inset-0 z-[90]">
          <button type="button" aria-label="Close transfer details" onClick={() => setDetailsOpen(false)} className="absolute inset-0 bg-slate-950/25" />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-[500px] flex-col border-l border-slate-200 bg-white shadow-2xl">
            <TransferDetails key={selectedTransfer.id} transfer={selectedTransfer} locationMap={locationMap} productMap={productMap}
              onEdit={() => beginEditTransfer(selectedTransfer)} onCancel={() => openCancel(selectedTransfer)} onClose={() => setDetailsOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}

function TransferDetails({
  transfer,
  locationMap,
  productMap,
  onEdit,
  onCancel,
  onClose,
}: {
  transfer: TransferRow;
  locationMap: Map<string, string>;
  productMap: Map<string, TransferProduct>;
  onEdit: () => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
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
          onClick={onClose}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-600"
        >
          <ArrowLeft size={16} />
          All transfers
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
                  <Modal title="Transfer actions" onClose={() => setMenuOpen(false)}>
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

                      onClick={() => {
                        setMenuOpen(false);
                        onCancel();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                    >
                      <CircleX size={15} />
                      Cancel transfer
                    </button>
                  </Modal>
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
        {actionError && <p role="alert" className="mb-3 text-sm text-rose-600">{actionError}</p>}
        {transfer.status === "draft" && (
          <form action={async data => { setActionError(null); try { await sendTransfer(data); } catch (error) { setActionError(error instanceof Error ? error.message : "Unable to send transfer."); } }}>
            <input type="hidden" name="transferId" value={transfer.id} />
            <TransferSubmitButton kind="send" />
          </form>
        )}
        {(transfer.status === "in_transit" || transfer.status === "sent" || transfer.status === "partially_received") && (
          <form action={async data => { setActionError(null); try { await receiveTransfer(data); } catch (error) { setActionError(error instanceof Error ? error.message : "Unable to receive transfer."); } }}>
            <input type="hidden" name="transferId" value={transfer.id} />
            <TransferSubmitButton kind="receive" />
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

function TransferSubmitButton({ kind }: { kind: "send" | "receive" }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} aria-busy={pending} className={`${primaryButton} w-full`}>
    {pending ? <Loader2 size={16} className="animate-spin" /> : kind === "send" ? <Send size={16} /> : <PackageCheck size={16} />}
    {pending ? (kind === "send" ? "Sending…" : "Receiving…") : kind === "send" ? "Send Transfer" : "Mark as Received"}
  </button>;
}
