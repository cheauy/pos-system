"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileText,
  Filter,
  Mail,
  MapPin,
  PackageCheck,
  Phone,
  Plus,
  Search,
  Send,
  ShoppingCart,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";

export type PurchaseOrderSupplier = {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
};

type PurchaseOrderItem = {
  id: string;
  purchase_order_id: string;
  product_name: string;
  sku: string | null;
  ordered_quantity: number;
  received_quantity: number;
  unit_cost: number;
};

export type PurchaseOrderListItem = {
  id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  po_number: string;
  reference_number: string | null;
  status: "draft" | "sent" | "partial" | "received" | "cancelled";
  order_date: string;
  expected_date: string | null;
  notes: string | null;
  subtotal: number;
  total: number;
  created_by: string | null;
  created_by_name: string;
  created_at: string;
  item_count: number;
  ordered_quantity: number;
  received_quantity: number;
  items: PurchaseOrderItem[];
};

type DetailTab = "overview" | "items" | "notes";
type StatusFilter = "all" | PurchaseOrderListItem["status"];
type SortMode = "newest" | "oldest" | "highest" | "lowest";

const PAGE_SIZE = 10;

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(parsed);
}

function statusLabel(status: PurchaseOrderListItem["status"]) {
  if (status === "partial") return "Partially Received";
  if (status === "received") return "Completed";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusClass(status: PurchaseOrderListItem["status"]) {
  switch (status) {
    case "draft":
      return "bg-slate-100 text-slate-600";
    case "sent":
      return "bg-blue-50 text-blue-700";
    case "partial":
      return "bg-amber-50 text-amber-700";
    case "received":
      return "bg-emerald-50 text-emerald-700";
    case "cancelled":
      return "bg-red-50 text-red-700";
  }
}

export default function PurchaseOrdersClient({
  orders,
  suppliers,
  canCreate,
  canUpdate,
}: {
  orders: PurchaseOrderListItem[];
  suppliers: PurchaseOrderSupplier[];
  canCreate: boolean;
  canUpdate: boolean;
}) {
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(
    orders[0]?.id ?? null,
  );
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");

  const supplierMap = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier])),
    [suppliers],
  );

  const filteredOrders = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const next = orders.filter((order) => {
      const matchesSearch =
        !normalizedSearch ||
        [
          order.po_number,
          order.supplier_name,
          order.reference_number,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(normalizedSearch),
          );

      const matchesSupplier =
        supplierFilter === "all" || order.supplier_id === supplierFilter;
      const matchesStatus =
        statusFilter === "all" || order.status === statusFilter;
      const matchesFrom = !fromDate || order.order_date >= fromDate;
      const matchesTo = !toDate || order.order_date <= toDate;

      return (
        matchesSearch &&
        matchesSupplier &&
        matchesStatus &&
        matchesFrom &&
        matchesTo
      );
    });

    next.sort((a, b) => {
      if (sortMode === "highest") return b.total - a.total;
      if (sortMode === "lowest") return a.total - b.total;
      if (sortMode === "oldest") {
        return a.created_at.localeCompare(b.created_at);
      }
      return b.created_at.localeCompare(a.created_at);
    });

    return next;
  }, [
    orders,
    search,
    supplierFilter,
    statusFilter,
    fromDate,
    toDate,
    sortMode,
  ]);

  useEffect(() => {
    setPage(1);
  }, [search, supplierFilter, statusFilter, fromDate, toDate, sortMode]);

  useEffect(() => {
    if (
      selectedId &&
      filteredOrders.some((order) => order.id === selectedId)
    ) {
      return;
    }
    setSelectedId(filteredOrders[0]?.id ?? null);
  }, [filteredOrders, selectedId]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const visibleOrders = filteredOrders.slice(pageStart, pageStart + PAGE_SIZE);

  const selectedOrder =
    orders.find((order) => order.id === selectedId) ?? null;
  const selectedSupplier = selectedOrder?.supplier_id
    ? supplierMap.get(selectedOrder.supplier_id) ?? null
    : null;

  const stats = useMemo(() => {
    const total = orders.length;
    const draft = orders.filter((order) => order.status === "draft").length;
    const sent = orders.filter((order) => order.status === "sent").length;
    const partial = orders.filter((order) => order.status === "partial").length;
    const completed = orders.filter((order) => order.status === "received").length;
    const outstanding = orders
      .filter((order) =>
        ["draft", "sent", "partial"].includes(order.status),
      )
      .reduce((sum, order) => sum + order.total, 0);

    return { total, draft, sent, partial, completed, outstanding };
  }, [orders]);

  function clearFilters() {
    setSearch("");
    setSupplierFilter("all");
    setStatusFilter("all");
    setFromDate("");
    setToDate("");
    setSortMode("newest");
  }

  return (
    <main className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">
            Purchase Orders
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Order stock from suppliers, track what is arriving, and receive purchased items into inventory.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <Filter size={17} />
            Filters
          </button>
          {canCreate ? (
            <Link
              href="/dashboard/purchase-orders/new"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              <Plus size={18} />
              New Purchase Order
            </Link>
          ) : null}
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard icon={<ClipboardList size={20} />} label="Total Orders" value={stats.total.toString()} tone="blue" />
        <StatCard icon={<FileText size={20} />} label="Draft" value={stats.draft.toString()} tone="slate" />
        <StatCard icon={<Send size={20} />} label="Sent" value={stats.sent.toString()} tone="blue" />
        <StatCard icon={<Clock3 size={20} />} label="Partially Received" value={stats.partial.toString()} tone="amber" />
        <StatCard icon={<CheckCircle2 size={20} />} label="Completed" value={stats.completed.toString()} tone="emerald" />
        <StatCard icon={<WalletCards size={20} />} label="Outstanding Value" value={money(stats.outstanding)} tone="amber" compact />
      </section>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_370px]">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {filtersOpen && (
            <div className="border-b border-slate-200 bg-white p-3">
              <div className="grid gap-2 lg:grid-cols-[minmax(220px,1.35fr)_minmax(150px,.7fr)_minmax(150px,.7fr)_minmax(250px,1fr)_minmax(140px,.6fr)]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search PO, supplier or reference..."
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <select
                  value={supplierFilter}
                  onChange={(event) => setSupplierFilter(event.target.value)}
                  className={selectClass}
                >
                  <option value="all">All Suppliers</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>

                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                  className={selectClass}
                >
                  <option value="all">All Statuses</option>
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="partial">Partially Received</option>
                  <option value="received">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>

                <div className="grid grid-cols-2 gap-2">
                  <label className="relative">
                    <CalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(event) => setFromDate(event.target.value)}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-2 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      aria-label="Order date from"
                    />
                  </label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(event) => setToDate(event.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-2 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    aria-label="Order date to"
                  />
                </div>

                <select
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as SortMode)}
                  className={selectClass}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="highest">Highest total</option>
                  <option value="lowest">Lowest total</option>
                </select>
              </div>

              {(search || supplierFilter !== "all" || statusFilter !== "all" || fromDate || toDate || sortMode !== "newest") && (
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
                  >
                    <X size={14} /> Clear filters
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">PO Number</th>
                  <th className="px-3 py-3">Supplier</th>
                  <th className="px-3 py-3">Reference</th>
                  <th className="px-3 py-3">Order Date</th>
                  <th className="px-3 py-3">Expected Date</th>
                  <th className="px-3 py-3 text-center">Items</th>
                  <th className="px-3 py-3 text-center">Ordered</th>
                  <th className="px-3 py-3 text-center">Received</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Created By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleOrders.map((order) => {
                  const active = order.id === selectedId;
                  return (
                    <tr
                      key={order.id}
                      onClick={() => {
                        setSelectedId(order.id);
                        setDetailTab("overview");
                      }}
                      className={`cursor-pointer transition ${
                        active
                          ? "bg-blue-50/80"
                          : "bg-white hover:bg-slate-50/80"
                      }`}
                    >
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {order.po_number}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {order.supplier_name || "—"}
                      </td>
                      <td className="px-3 py-3 text-slate-500">
                        {order.reference_number || "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                        {formatDate(order.order_date)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                        {formatDate(order.expected_date)}
                      </td>
                      <td className="px-3 py-3 text-center font-medium text-slate-700">
                        {order.item_count}
                      </td>
                      <td className="px-3 py-3 text-center text-slate-600">
                        {order.ordered_quantity}
                      </td>
                      <td className="px-3 py-3 text-center text-slate-600">
                        {order.received_quantity}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(order.status)}`}>
                          {statusLabel(order.status)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-slate-900">
                        {money(order.total)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {order.created_by_name}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {visibleOrders.length === 0 && (
            <div className="px-6 py-16 text-center">
              <ShoppingCart className="mx-auto text-slate-300" size={38} />
              <p className="mt-3 font-semibold text-slate-700">No purchase orders found</p>
              <p className="mt-1 text-sm text-slate-500">Try changing your filters or create a new purchase order.</p>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              {filteredOrders.length === 0
                ? "Showing 0 purchase orders"
                : `Showing ${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, filteredOrders.length)} of ${filteredOrders.length} purchase orders`}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={safePage <= 1}
                className={pagerButtonClass}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="grid h-9 min-w-9 place-items-center rounded-lg bg-blue-600 px-2 text-sm font-semibold text-white">
                {safePage}
              </span>
              <span className="text-xs text-slate-400">/ {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                disabled={safePage >= totalPages}
                className={pagerButtonClass}
                aria-label="Next page"
              >
                <ChevronRight size={16} />
              </button>
              <span className="ml-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">
                10 per page
              </span>
            </div>
          </div>
        </section>

        <PurchaseOrderDetails
          order={selectedOrder}
          supplier={selectedSupplier}
          tab={detailTab}
          onTabChange={setDetailTab}
          canUpdate={canUpdate}
        />
      </div>
    </main>
  );
}

function PurchaseOrderDetails({
  order,
  supplier,
  tab,
  onTabChange,
  canUpdate,
}: {
  order: PurchaseOrderListItem | null;
  supplier: PurchaseOrderSupplier | null;
  tab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  canUpdate: boolean;
}) {
  if (!order) {
    return (
      <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <ClipboardList className="text-slate-300" size={36} />
        <p className="mt-3 font-semibold text-slate-800">Select a purchase order</p>
        <p className="mt-1 text-sm text-slate-500">Choose an order from the list to see its details.</p>
      </aside>
    );
  }

  const progress = order.ordered_quantity > 0
    ? Math.min(100, Math.round((order.received_quantity / order.ordered_quantity) * 100))
    : 0;

  return (
    <aside className="h-fit overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm 2xl:sticky 2xl:top-4">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-slate-950">{order.po_number}</h2>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(order.status)}`}>
                {statusLabel(order.status)}
              </span>
            </div>
            <p className="mt-2 font-semibold text-slate-800">{order.supplier_name || "No supplier"}</p>
          </div>
        </div>

        <div className="mt-4 space-y-2.5 text-sm text-slate-600">
          {supplier?.contact_person && (
            <DetailLine icon={<UserRound size={15} />} text={supplier.contact_person} />
          )}
          {supplier?.phone && (
            <DetailLine icon={<Phone size={15} />} text={supplier.phone} />
          )}
          {supplier?.email && (
            <DetailLine icon={<Mail size={15} />} text={supplier.email} />
          )}
          {supplier?.address && (
            <DetailLine icon={<MapPin size={15} />} text={supplier.address} />
          )}
        </div>
      </div>

      <div className="flex border-y border-slate-200 px-3">
        {(["overview", "items", "notes"] as DetailTab[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onTabChange(value)}
            className={`border-b-2 px-3 py-3 text-xs font-semibold capitalize transition ${
              tab === value
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {value === "items" ? `Items (${order.item_count})` : value}
          </button>
        ))}
      </div>

      <div className="p-5">
        {tab === "overview" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>Order Progress</span>
                <span>{progress}%</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {order.received_quantity} of {order.ordered_quantity} units received
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 p-4 text-sm">
              <SummaryLine label="Order Date" value={formatDate(order.order_date)} />
              <SummaryLine label="Expected Date" value={formatDate(order.expected_date)} />
              <SummaryLine label="Supplier Reference" value={order.reference_number || "—"} />
              <SummaryLine label="Created By" value={order.created_by_name} />
              <SummaryLine label="Items" value={order.item_count.toString()} />
            </div>

            <div className="rounded-xl border border-slate-200 p-4 text-sm">
              <SummaryLine label="Subtotal" value={money(order.subtotal)} />
              <div className="my-3 border-t border-slate-100" />
              <SummaryLine label="Total Amount" value={money(order.total)} strong />
            </div>
          </div>
        )}

        {tab === "items" && (
          <div className="space-y-2">
            {order.items.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.product_name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">SKU {item.sku || "—"}</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">
                    {money(item.unit_cost * item.ordered_quantity)}
                  </p>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {item.received_quantity}/{item.ordered_quantity} received · {money(item.unit_cost)} each
                </p>
              </div>
            ))}
            {order.items.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-500">No items on this purchase order.</p>
            )}
          </div>
        )}

        {tab === "notes" && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            {order.notes || "No notes for this purchase order."}
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Link
            href={`/dashboard/purchase-orders/${order.id}`}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <PackageCheck size={16} />
            View PO
          </Link>
          {canUpdate && !['received', 'cancelled'].includes(order.status) ? (
            <Link
              href={`/dashboard/purchase-orders/${order.id}`}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ShoppingCart size={16} />
              Receive Items
            </Link>
          ) : ['received', 'cancelled'].includes(order.status) ? (
            <div className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-400">
              <CheckCircle2 size={16} />
              Closed
            </div>
          ) : <div />}
        </div>
      </div>
    </aside>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
  compact = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "blue" | "slate" | "amber" | "emerald";
  compact?: boolean;
}) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-600",
    slate: "bg-slate-100 text-slate-600",
    amber: "bg-amber-50 text-amber-600",
    emerald: "bg-emerald-50 text-emerald-600",
  }[tone];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${toneClass}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-slate-500">{label}</p>
          <p className={`${compact ? "text-lg" : "text-2xl"} mt-0.5 truncate font-bold text-slate-950`}>
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

function DetailLine({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <span className="break-words">{text}</span>
    </div>
  );
}

function SummaryLine({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <span className="text-slate-500">{label}</span>
      <span className={`${strong ? "text-base font-bold" : "font-medium"} text-right text-slate-900`}>
        {value}
      </span>
    </div>
  );
}

const selectClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

const pagerButtonClass =
  "grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";
