"use client";

import Link from "next/link";
import { usePagedWorkspace } from "@/lib/use-paged-workspace";
import { loadPurchaseOrders, type PurchaseWorkspace } from "./list-actions";
import OrderWorkflow from "./order-workflow";
import NewOrderDialog from "./new-order-dialog";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  Lightbulb,
  FileText,
  Filter,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Send,
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

const PAGE_SIZE = 15;

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
  workspace,
  canCreate,
  canUpdate,
  openNew = false,
}: {
  workspace: PurchaseWorkspace;
  canCreate: boolean;
  canUpdate: boolean;
  openNew?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(true);
  // Phones: purchase order details open as a full-screen sheet.
  const [detailOpen, setDetailOpen] = useState(false);
  useEffect(() => {
    if (!detailOpen) return;
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !document.querySelector("dialog[open]")) setDetailOpen(false); };
    const wide = window.matchMedia("(min-width: 640px)"); const onWide = () => { if (wide.matches) setDetailOpen(false); };
    window.addEventListener("keydown", onKey); wide.addEventListener("change", onWide);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", onKey); wide.removeEventListener("change", onWide); };
  }, [detailOpen]);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(openNew);
  const [selectedId, setSelectedId] = useState<string | null>(
    workspace.orders[0]?.id ?? null,
  );
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");

  const {data,busy,error}=usePagedWorkspace(workspace,{page,search,supplierFilter,statusFilter,fromDate,toDate,sortMode},loadPurchaseOrders);
  const {orders,suppliers,stats}=data;
  const supplierMap=useMemo(()=>new Map(suppliers.map(supplier=>[supplier.id,supplier])),[suppliers]);

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const safePage = data.page;
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const visibleOrders = orders;

  const selectedOrder =
    orders.find((order) => order.id === selectedId) ?? orders[0] ?? null;
  const selectedSupplier = selectedOrder?.supplier_id
    ? supplierMap.get(selectedOrder.supplier_id) ?? null
    : null;

  function clearFilters() {
    setPage(1);
    setSearch("");
    setSupplierFilter("all");
    setStatusFilter("all");
    setFromDate("");
    setToDate("");
    setSortMode("newest");
  }

  return (
    <main className="space-y-5" aria-busy={busy}>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {creating && <NewOrderDialog close={() => setCreating(false)} created={id => { setCreating(false); setSearch(""); setSupplierFilter("all"); setStatusFilter("all"); setFromDate(""); setToDate(""); setSortMode("newest"); setPage(1); setSelectedId(id); setDetailTab("overview"); }} />}
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
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 max-sm:hidden"
          >
            <Filter size={17} />
            Filters
          </button>
          {canCreate ? (
            <button
              type="button" onClick={() => setCreating(true)}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 max-sm:fixed max-sm:bottom-[max(1rem,env(safe-area-inset-bottom))] max-sm:right-4 max-sm:z-40 max-sm:h-12 max-sm:rounded-full max-sm:shadow-lg"
            >
              <Plus size={18} />
              New Purchase Order
            </button>
          ) : null}
        </div>
      </div>

      <section aria-label="Purchase order summary" className="grid grid-cols-2 gap-y-3 rounded-xl border border-slate-200 bg-white py-4 shadow-sm sm:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={<ClipboardList size={20} />} label="Total Orders" value={stats.total.toString()} tone="blue" />
        <StatCard icon={<FileText size={20} />} label="Draft" value={stats.draft.toString()} tone="slate" />
        <StatCard icon={<Send size={20} />} label="Sent" value={stats.sent.toString()} tone="blue" />
        <StatCard icon={<Clock3 size={20} />} label="Partially Received" value={stats.partial.toString()} tone="amber" />
        <StatCard icon={<CheckCircle2 size={20} />} label="Completed" value={stats.completed.toString()} tone="emerald" />
        <StatCard icon={<WalletCards size={20} />} label="Outstanding Value" value={money(stats.outstanding)} tone="amber" compact />
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {filtersOpen && (
            <div className="border-b border-slate-200 bg-white p-3">
              <div className="grid grid-cols-6 gap-2 sm:grid-cols-2 2xl:grid-cols-[minmax(160px,1.5fr)_minmax(110px,.8fr)_minmax(110px,.8fr)_minmax(220px,1.3fr)_minmax(110px,.8fr)]">
                <label className="relative col-span-2 block max-sm:order-4 sm:col-span-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    value={search}
                    onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                    placeholder="Search PO, supplier or reference..."
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <select
                  value={supplierFilter}
                  onChange={(event) => { setSupplierFilter(event.target.value); setPage(1); }}
                  className={`${selectClass} col-span-2 min-w-0 max-sm:text-xs sm:col-span-1`}
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
                  onChange={(event) => { setStatusFilter(event.target.value as StatusFilter); setPage(1); }}
                  className={`${selectClass} col-span-2 min-w-0 max-sm:text-xs sm:col-span-1`}
                >
                  <option value="all">All Statuses</option>
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="partial">Partially Received</option>
                  <option value="received">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>

                <div className="col-span-4 grid grid-cols-2 gap-2 max-sm:order-5 sm:col-span-1">
                  <label className="relative">
                    <CalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(event) => { setFromDate(event.target.value); setPage(1); }}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-2 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      aria-label="Order date from"
                    />
                  </label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(event) => { setToDate(event.target.value); setPage(1); }}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-2 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    aria-label="Order date to"
                  />
                </div>

                <select
                  value={sortMode}
                  onChange={(event) => { setSortMode(event.target.value as SortMode); setPage(1); }}
                  className={`${selectClass} col-span-2 min-w-0 max-sm:text-xs sm:col-span-1`}
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
            <table className="w-full min-w-[760px] text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">PO Number</th>
                  <th className="px-3 py-3">Supplier</th>
                  <th className="px-3 py-3">Reference</th>
                  <th className="px-3 py-3">Order Date</th>
                  <th className="px-3 py-3">Expected Date</th>
                  <th className="px-3 py-3 text-center">Items</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Created By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleOrders.map((order) => {
                  const active = order.id === selectedOrder?.id;
                  return (
                    <tr
                      key={order.id}
                      onClick={() => {
                        setSelectedId(order.id);
                        setDetailTab("overview");
                        if (window.matchMedia("(max-width: 639px)").matches) setDetailOpen(true);
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
            <div className="flex min-h-80 flex-col items-center justify-center px-6 py-12 text-center">
              <div className="relative mb-2"><FileText className="text-slate-200" size={64} /><span className="absolute -bottom-1 -right-1 rounded-full border-4 border-white bg-teal-600 p-1 text-white"><Plus size={18} /></span></div>
              <p className="mt-3 font-semibold text-slate-700">No purchase orders found</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{orders.length ? "No orders match these filters. Try changing your search or filters." : "You don’t have any purchase orders yet. Create a new purchase order to get started."}</p>
              {canCreate && <button type="button" onClick={() => setCreating(true)} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"><Plus size={17} />New Purchase Order</button>}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              {data.total === 0
                ? "Showing 0 purchase orders"
                : `Showing ${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, data.total)} of ${data.total} purchase orders`}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, safePage - 1))}
                disabled={busy || safePage <= 1}
                className={pagerButtonClass}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="grid h-9 min-w-9 place-items-center rounded-lg bg-teal-700 px-2 text-sm font-semibold text-white">
                {safePage}
              </span>
              <span className="text-xs text-slate-400">/ {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                disabled={busy || safePage >= totalPages}
                className={pagerButtonClass}
                aria-label="Next page"
              >
                <ChevronRight size={16} />
              </button>
              <span className="ml-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">
                15 per page
              </span>
            </div>
          </div>
        </section>

        <div role={detailOpen ? "dialog" : undefined} aria-modal={detailOpen || undefined} aria-label="Purchase order details" className={`${detailOpen ? "fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-slate-100 p-3 pt-16" : "max-sm:hidden"} sm:contents`}>
        {detailOpen && <button type="button" aria-label="Close purchase order details" onClick={() => setDetailOpen(false)} className="absolute right-3 top-3 z-10 grid h-11 w-11 place-items-center rounded-xl bg-white text-slate-700 shadow sm:hidden"><X size={20} /></button>}
        <PurchaseOrderDetails
          order={selectedOrder}
          supplier={selectedSupplier}
          tab={detailTab}
          onTabChange={setDetailTab}
          canUpdate={canUpdate}
        />
        </div>
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
        <p className="mt-2 text-sm leading-6 text-slate-500">Choose an order from the list to see its details, including items, receiving status, and notes.</p>
        <div className="mt-5 border-t border-slate-200 pt-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Lightbulb size={18} className="text-teal-700" />New to purchase orders?</h3>
          <p className="mt-2 text-xs leading-5 text-slate-500">Create a purchase order to order stock from your suppliers. Once items arrive, receive them into inventory.</p>
          <ul className="mt-4 space-y-3 rounded-xl bg-teal-50 p-3 text-xs text-slate-600">{["Create and send POs to suppliers", "Track order status and deliveries", "Receive items into inventory", "Keep stock levels up to date"].map(text => <li key={text} className="flex items-center gap-2"><CheckCircle2 size={15} className="shrink-0 text-teal-700" />{text}</li>)}</ul>
        </div>
      </aside>
    );
  }

  const progress = order.ordered_quantity > 0
    ? Math.min(100, Math.round((order.received_quantity / order.ordered_quantity) * 100))
    : 0;

  return (
    <aside className="h-fit overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-4">
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
                <div className="h-full rounded-full bg-teal-700 transition-all" style={{ width: `${progress}%` }} />
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

        <OrderWorkflow key={order.id} order={order} canUpdate={canUpdate} />
        <Link href={`/dashboard/purchase-orders/${order.id}`} className="mt-3 block text-center text-xs font-semibold text-slate-500 hover:text-teal-700">{order.status === "draft" ? "View Draft Order" : "View full order"}</Link>
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
    <div className="min-w-0 border-r border-slate-100 px-4 last:border-r-0">
      <div className="flex items-center gap-3">
        {label === "Total Orders" || compact ? <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${toneClass}`}>{icon}</div> : <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone === "slate" ? "bg-slate-400" : tone === "amber" ? "bg-amber-400" : tone === "emerald" ? "bg-emerald-500" : "bg-blue-400"}`} />}
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-slate-500">{label}</p>
          <p className={`${compact ? "text-lg" : "text-lg"} mt-0.5 truncate font-bold text-slate-950`}>
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
