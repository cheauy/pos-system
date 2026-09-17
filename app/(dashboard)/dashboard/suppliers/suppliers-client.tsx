"use client";

import Link from "next/link";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Eye,
  Mail,
  MapPin,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import {
  createSupplier,
  deleteSupplier,
  toggleSupplierStatus,
} from "./actions";

type Supplier = {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
};

type PurchaseOrder = {
  id: string;
  supplier_id: string | null;
  status: string;
  order_date: string;
  total: number | string | null;
};

type SupplierMetric = {
  orderCount: number;
  receivedTotal: number;
  openValue: number;
  lastOrderDate: string | null;
};

const PAGE_SIZE = 10;
const OPEN_PO_STATUSES = new Set(["draft", "sent", "partial"]);

export default function SuppliersClient({
  suppliers,
  purchaseOrders,
  loadError,
}: {
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  loadError: string | null;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedSupplierId, setSelectedSupplierId] = useState(
    suppliers[0]?.id ?? "",
  );

  const metrics = useMemo(() => buildSupplierMetrics(purchaseOrders), [purchaseOrders]);

  const filteredSuppliers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return suppliers.filter((supplier) => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && supplier.is_active) ||
        (statusFilter === "inactive" && !supplier.is_active);

      if (!matchesStatus) return false;
      if (!normalizedQuery) return true;

      return [
        supplier.name,
        supplier.contact_person,
        supplier.phone,
        supplier.email,
        supplier.address,
      ].some((value) => value?.toLowerCase().includes(normalizedQuery));
    });
  }, [query, statusFilter, suppliers]);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredSuppliers.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visibleSuppliers = filteredSuppliers.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const selectedSupplier =
    suppliers.find((supplier) => supplier.id === selectedSupplierId) ??
    filteredSuppliers[0] ??
    suppliers[0] ??
    null;

  useEffect(() => {
    if (!selectedSupplierId && suppliers[0]) {
      setSelectedSupplierId(suppliers[0].id);
    }
  }, [selectedSupplierId, suppliers]);

  const activeSuppliers = suppliers.filter((supplier) => supplier.is_active).length;
  const thisMonthOrders = purchaseOrders.filter((order) => isThisMonth(order.order_date)).length;
  const openPoValue = purchaseOrders
    .filter((order) => OPEN_PO_STATUSES.has(order.status))
    .reduce((sum, order) => sum + numberValue(order.total), 0);

  const startRecord = filteredSuppliers.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const endRecord = Math.min(safePage * PAGE_SIZE, filteredSuppliers.length);

  return (
    <main className="space-y-5">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">Suppliers</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage companies and contacts who supply your products.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={<UsersRound size={22} />}
          title="Total Suppliers"
          value={String(suppliers.length)}
          tone="blue"
        />
        <SummaryCard
          icon={<CheckCircle2 size={22} />}
          title="Active Suppliers"
          value={String(activeSuppliers)}
          helper={`${suppliers.length ? Math.round((activeSuppliers / suppliers.length) * 100) : 0}% of total`}
          tone="green"
        />
        <SummaryCard
          icon={<ClipboardList size={22} />}
          title="Purchase Orders This Month"
          value={String(thisMonthOrders)}
          tone="violet"
        />
        <SummaryCard
          icon={<CircleDollarSign size={22} />}
          title="Open PO Value"
          value={formatCurrency(openPoValue)}
          helper="Draft, sent and partial POs"
          tone="amber"
        />
      </section>

      {loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      ) : null}

      <section className="grid items-start gap-4 xl:grid-cols-[300px_minmax(0,1fr)_340px]">
        <AddSupplierPanel />

        <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Supplier List ({suppliers.length})
                </h2>
                <p className="text-sm text-slate-500">View and manage your suppliers.</p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="relative min-w-0 sm:w-64">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search suppliers..."
                    className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </label>

                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-blue-500"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>

          {suppliers.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <Building2 size={42} className="mx-auto text-slate-300" />
              <p className="mt-3 font-semibold text-slate-700">No suppliers yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Add your first supplier from the form on the left.
              </p>
            </div>
          ) : filteredSuppliers.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-slate-500">
              No suppliers match your search or status filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[930px] text-sm">
                <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-3 py-3">Contact Person</th>
                    <th className="px-3 py-3">Phone</th>
                    <th className="px-3 py-3">Email</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Last Order</th>
                    <th className="px-3 py-3 text-right">Open PO</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleSuppliers.map((supplier) => {
                    const supplierMetric = metrics.get(supplier.id) ?? emptyMetric;
                    const isSelected = selectedSupplier?.id === supplier.id;

                    return (
                      <tr
                        key={supplier.id}
                        onClick={() => setSelectedSupplierId(supplier.id)}
                        className={`cursor-pointer transition hover:bg-slate-50 ${
                          isSelected ? "bg-blue-50/60" : "bg-white"
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <SupplierAvatar name={supplier.name} />
                            <span className="font-semibold text-slate-900">{supplier.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {supplier.contact_person ?? "—"}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-slate-600">
                          {supplier.phone ?? "—"}
                        </td>
                        <td className="max-w-52 truncate px-3 py-3 text-slate-600">
                          {supplier.email ?? "—"}
                        </td>
                        <td className="px-3 py-3">
                          <StatusPill active={supplier.is_active} />
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-slate-600">
                          {supplierMetric.lastOrderDate
                            ? formatDate(supplierMetric.lastOrderDate)
                            : "—"}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-slate-800">
                          {formatCurrency(supplierMetric.openValue)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <SupplierActionMenu supplier={supplier} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-slate-500">
              Showing {startRecord} to {endRecord} of {filteredSuppliers.length} suppliers
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={safePage <= 1}
                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 disabled:opacity-35"
                aria-label="Previous page"
              >
                <ChevronLeft size={17} />
              </button>
              <span className="grid h-9 min-w-9 place-items-center rounded-lg bg-blue-600 px-3 font-semibold text-white">
                {safePage}
              </span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                disabled={safePage >= pageCount}
                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 disabled:opacity-35"
                aria-label="Next page"
              >
                <ChevronRight size={17} />
              </button>
              <span className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">
                10 / page
              </span>
            </div>
          </div>
        </div>

        <SupplierDetailsPanel
          supplier={selectedSupplier}
          metric={selectedSupplier ? metrics.get(selectedSupplier.id) ?? emptyMetric : emptyMetric}
        />
      </section>
    </main>
  );
}

function AddSupplierPanel() {
  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-4">
      <div>
        <h2 className="text-lg font-bold text-slate-950">Add Supplier</h2>
        <p className="mt-1 text-sm text-slate-500">Create a new supplier record.</p>
      </div>

      <form action={createSupplier} className="mt-5 space-y-4">
        <FormField label="Supplier name" required>
          <input name="name" required placeholder="e.g. ABC Trading Co." className={inputClass} />
        </FormField>
        <FormField label="Contact person">
          <input name="contactPerson" placeholder="e.g. Dara Lim" className={inputClass} />
        </FormField>
        <FormField label="Phone">
          <input name="phone" type="tel" placeholder="e.g. 012 345 678" className={inputClass} />
        </FormField>
        <FormField label="Email">
          <input name="email" type="email" placeholder="supplier@example.com" className={inputClass} />
        </FormField>
        <FormField label="Address">
          <textarea
            name="address"
            rows={2}
            placeholder="Supplier address"
            className={`${inputClass} resize-none`}
          />
        </FormField>
        <FormField label="Notes">
          <textarea
            name="notes"
            rows={3}
            placeholder="Optional notes"
            className={`${inputClass} resize-none`}
          />
        </FormField>
        <button
          type="submit"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          <Plus size={17} />
          Create Supplier
        </button>
      </form>
    </aside>
  );
}

function SupplierDetailsPanel({
  supplier,
  metric,
}: {
  supplier: Supplier | null;
  metric: SupplierMetric;
}) {
  if (!supplier) {
    return (
      <aside className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm xl:sticky xl:top-4">
        <Building2 size={38} className="mx-auto text-slate-300" />
        <h2 className="mt-3 font-bold text-slate-900">Supplier Details</h2>
        <p className="mt-1 text-sm text-slate-500">Select a supplier to view details.</p>
      </aside>
    );
  }

  return (
    <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-4">
      <div className="border-b border-slate-200 p-5">
        <h2 className="text-lg font-bold text-slate-950">Supplier Details</h2>
      </div>

      <div className="p-5">
        <div className="flex items-start gap-4">
          <SupplierAvatar name={supplier.name} large />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-bold text-slate-950">{supplier.name}</h3>
              <StatusPill active={supplier.is_active} />
            </div>
            <p className="mt-1 text-sm text-slate-500">Supplier account</p>
          </div>
        </div>

        <div className="mt-6 space-y-4 text-sm">
          <DetailRow icon={<UserRound size={17} />} value={supplier.contact_person ?? "No contact person"} />
          <DetailRow icon={<Phone size={17} />} value={supplier.phone ?? "No phone"} />
          <DetailRow icon={<Mail size={17} />} value={supplier.email ?? "No email"} />
          <DetailRow icon={<MapPin size={17} />} value={supplier.address ?? "No address"} />
          <DetailRow
            icon={<CalendarDays size={17} />}
            value={metric.lastOrderDate ? formatDate(metric.lastOrderDate) : "No purchase orders yet"}
            secondary="Last order date"
          />
        </div>

        {supplier.notes ? (
          <div className="mt-5 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Notes</p>
            {supplier.notes}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 border-y border-slate-200">
        <MetricBox label="Total Purchased" value={formatCurrency(metric.receivedTotal)} helper={`${metric.orderCount} POs`} />
        <MetricBox label="Open PO Value" value={formatCurrency(metric.openValue)} helper="Not fully received" />
      </div>

      <div className="grid grid-cols-3 gap-2 p-4">
        <Link
          href="/dashboard/purchase-orders"
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-blue-700"
        >
          <Eye size={15} />
          View POs
        </Link>
        <Link
          href={`/dashboard/suppliers/${supplier.id}/edit`}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <Pencil size={15} />
          Edit
        </Link>
        <Link
          href="/dashboard/purchase-orders/new"
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <ShoppingCart size={15} />
          New PO
        </Link>
      </div>
    </aside>
  );
}

function SupplierActionMenu({ supplier }: { supplier: Supplier }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  function updatePosition() {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const menuWidth = 176;
    const menuHeight = 132;
    const margin = 8;
    const left = Math.min(window.innerWidth - menuWidth - margin, Math.max(margin, rect.right - menuWidth));
    const top =
      rect.bottom + menuHeight + margin <= window.innerHeight
        ? rect.bottom + 6
        : Math.max(margin, rect.top - menuHeight - 6);
    setPosition({ top, left });
  }

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const reposition = () => updatePosition();

    document.addEventListener("mousedown", close);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  function confirmDelete(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(`Delete ${supplier.name}? This action cannot be undone.`)) {
      event.preventDefault();
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Actions for ${supplier.name}`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        className="inline-grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"
      >
        <MoreHorizontal size={17} />
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              style={{ top: position.top, left: position.left }}
              className="fixed z-[100] w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <Link
                href={`/dashboard/suppliers/${supplier.id}/edit`}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Pencil size={15} />
                Edit
              </Link>

              <form action={toggleSupplierStatus}>
                <input type="hidden" name="supplierId" value={supplier.id} />
                <input type="hidden" name="currentStatus" value={String(supplier.is_active)} />
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <CheckCircle2 size={15} />
                  {supplier.is_active ? "Disable" : "Enable"}
                </button>
              </form>

              <form action={deleteSupplier} onSubmit={confirmDelete}>
                <input type="hidden" name="supplierId" value={supplier.id} />
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={15} />
                  Delete
                </button>
              </form>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function SummaryCard({
  icon,
  title,
  value,
  helper,
  tone,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  helper?: string;
  tone: "blue" | "green" | "violet" | "amber";
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-emerald-50 text-emerald-600",
    violet: "bg-violet-50 text-violet-600",
    amber: "bg-amber-50 text-amber-600",
  } as const;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tones[tone]}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{title}</p>
          <p className="mt-0.5 truncate text-xl font-bold text-slate-950">{value}</p>
          {helper ? <p className="mt-0.5 truncate text-[11px] text-slate-400">{helper}</p> : null}
        </div>
      </div>
    </div>
  );
}

function SupplierAvatar({ name, large = false }: { name: string; large?: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "S";

  return (
    <div
      className={`grid shrink-0 place-items-center rounded-full bg-blue-50 font-bold text-blue-600 ${
        large ? "h-14 w-14 text-lg" : "h-8 w-8 text-xs"
      }`}
    >
      {initials}
    </div>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-slate-400"}`} />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function DetailRow({
  icon,
  value,
  secondary,
}: {
  icon: ReactNode;
  value: string;
  secondary?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-slate-500">{icon}</span>
      <div className="min-w-0">
        <p className="break-words font-medium text-slate-700">{value}</p>
        {secondary ? <p className="text-xs text-slate-400">{secondary}</p> : null}
      </div>
    </div>
  );
}

function MetricBox({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="p-4 first:border-r first:border-slate-200">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-950">{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-400">{helper}</p>
    </div>
  );
}

function FormField({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function buildSupplierMetrics(purchaseOrders: PurchaseOrder[]) {
  const map = new Map<string, SupplierMetric>();

  for (const order of purchaseOrders) {
    if (!order.supplier_id) continue;
    const current = map.get(order.supplier_id) ?? { ...emptyMetric };
    const total = numberValue(order.total);
    current.orderCount += 1;

    if (order.status === "received") {
      current.receivedTotal += total;
    }
    if (OPEN_PO_STATUSES.has(order.status)) {
      current.openValue += total;
    }
    if (!current.lastOrderDate || order.order_date > current.lastOrderDate) {
      current.lastOrderDate = order.order_date;
    }

    map.set(order.supplier_id, current);
  }

  return map;
}

const emptyMetric: SupplierMetric = {
  orderCount: 0,
  receivedTotal: 0,
  openValue: 0,
  lastOrderDate: null,
};

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

function numberValue(value: number | string | null) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDate(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function isThisMonth(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getUTCFullYear() === now.getUTCFullYear() && date.getUTCMonth() === now.getUTCMonth();
}
