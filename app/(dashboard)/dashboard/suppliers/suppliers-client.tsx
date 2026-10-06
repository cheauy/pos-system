"use client";

import MobileListCard, { MobileList } from "@/components/mobile-list-card";
import { ButtonSpinner } from "@/components/pending-submit-button";
import Link from "next/link";
import { usePagedWorkspace } from "@/lib/use-paged-workspace";
import { loadSuppliers, type SupplierWorkspace, type SupplierMetric } from "./list-actions";
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
  X,
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
import { toast } from "sonner";

import {
  createSupplier,
  deleteSupplier,
  toggleSupplierStatus,
  updateSupplier,
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

const PAGE_SIZE = 15;

export default function SuppliersClient({workspace}:{workspace:SupplierWorkspace}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  // Phones: Add Supplier and Supplier Details open as full-screen sheets.
  const [sheet, setSheet] = useState<"add" | "detail" | null>(null);
  useEffect(() => {
    if (!sheet) return;
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !document.querySelector("dialog[open]")) setSheet(null); };
    const wide = window.matchMedia("(min-width: 640px)"); const onWide = () => { if (wide.matches) setSheet(null); };
    window.addEventListener("keydown", onKey); wide.addEventListener("change", onWide);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", onKey); wide.removeEventListener("change", onWide); };
  }, [sheet]);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [editingBusy, setEditingBusy] = useState(false);
  const [deleting, setDeleting] = useState<Supplier | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const deleteLock = useRef(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState(
    workspace.suppliers[0]?.id ?? "",
  );

  const {data,busy,error:loadError}=usePagedWorkspace(workspace,{page,query,statusFilter},loadSuppliers,"query");
  const {suppliers,stats}=data;
  const metrics=useMemo(()=>new Map(Object.entries(data.metrics)),[data.metrics]);
  const filteredSuppliers=suppliers;


  const pageCount = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const safePage = data.page;
  const visibleSuppliers = suppliers;

  const selectedSupplier =
    suppliers.find((supplier) => supplier.id === selectedSupplierId) ??
    filteredSuppliers[0] ??
    suppliers[0] ??
    null;

  const activeSuppliers=stats.active;
  const thisMonthOrders=stats.thisMonthOrders;
  const openPoValue=stats.openPoValue;
  const startRecord=data.total===0?0:(safePage-1)*PAGE_SIZE+1;
  const endRecord=Math.min(safePage*PAGE_SIZE,data.total);

  return (
    <main className="space-y-5" aria-busy={busy}>
      {editing && <SupplierDialog title="Edit Supplier" side busy={editingBusy} close={() => setEditing(null)}>
        <SupplierForm supplier={editing} onBusyChange={setEditingBusy} onSaved={() => setEditing(null)} />
      </SupplierDialog>}
      {deleting && <SupplierDialog title="Delete supplier?" busy={deletingBusy} close={() => setDeleting(null)}>
        <p className="text-sm text-slate-600">Delete <strong>{deleting.name}</strong>? This cannot be undone. Suppliers with purchase history cannot be deleted; disable them instead to keep their records.</p>
        {deleteError && <p role="alert" className="mt-3 text-sm text-red-600">{deleteError}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button autoFocus type="button" disabled={deletingBusy} onClick={() => setDeleting(null)} className="rounded-xl border px-4 py-2 text-sm font-semibold">Cancel</button>
          <button type="button" disabled={deletingBusy} onClick={async () => {
            if (deleteLock.current) return;
            deleteLock.current = true; setDeletingBusy(true); setDeleteError("");
            try { const data = new FormData(); data.set("supplierId", deleting.id); await deleteSupplier(data); setDeleting(null); toast.success("Supplier deleted successfully.", { position: "top-right" }); }
            catch (error) { setDeleteError(error instanceof Error ? error.message : "Unable to delete supplier. Please try again."); }
            finally { deleteLock.current = false; setDeletingBusy(false); }
          }} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{deletingBusy ? "Deleting…" : "Delete supplier"}</button>
        </div>
      </SupplierDialog>}
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
          value={String(stats.total)}
          tone="blue"
        />
        <SummaryCard
          icon={<CheckCircle2 size={22} />}
          title="Active Suppliers"
          value={String(activeSuppliers)}
          helper={`${stats.total ? Math.round((activeSuppliers / stats.total) * 100) : 0}% of total`}
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
        <div role={sheet === "add" ? "dialog" : undefined} aria-modal={sheet === "add" || undefined} aria-label="Add supplier" data-sheet="full" className={`${sheet === "add" ? "fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-slate-100 p-3 pt-16" : "max-sm:hidden"} sm:contents`}>
          {sheet === "add" && <button type="button" aria-label="Close add supplier" onClick={() => setSheet(null)} className="absolute right-3 top-3 z-10 grid h-11 w-11 place-items-center rounded-xl bg-white text-slate-700 shadow sm:hidden"><X size={20} /></button>}
          <AddSupplierPanel />
        </div>

        <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Supplier List ({data.total})
                </h2>
                <p className="text-sm text-slate-500">View and manage your suppliers.</p>
              </div>

              <div className="flex flex-row gap-2">
                <label className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={query}
                    onChange={(event) => { setQuery(event.target.value); setPage(1); }}
                    placeholder="Search suppliers..."
                    className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </label>

                <select
                  value={statusFilter}
                  onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}
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
              <MobileList>{visibleSuppliers.map((supplier) => { const m = metrics.get(supplier.id) ?? emptyMetric; return <MobileListCard key={supplier.id} selected={selectedSupplier?.id === supplier.id} onClick={() => { setSelectedSupplierId(supplier.id); if (window.matchMedia("(max-width: 639px)").matches) setSheet("detail"); }} media={<SupplierAvatar name={supplier.name} />} title={supplier.name} date={m.lastOrderDate ? `Last order ${formatDate(m.lastOrderDate)}` : "No orders yet"} primary={supplier.contact_person ?? supplier.phone ?? "No contact"} secondary={[supplier.phone, supplier.email].filter(Boolean).join(" · ") || undefined} amount={formatCurrency(m.openValue)} status={{ label: supplier.is_active ? "Active" : "Inactive" }} />; })}</MobileList>
              <table data-phone-layout="custom" className="max-lg:hidden w-full min-w-[930px] text-sm">
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
                        onClick={() => { setSelectedSupplierId(supplier.id); if (window.matchMedia("(max-width: 639px)").matches) setSheet("detail"); }}
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
                          <SupplierActionMenu supplier={supplier} onEdit={() => setEditing(supplier)} onDelete={() => { setDeleteError(""); setDeleting(supplier); }} />
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
              Showing {startRecord} to {endRecord} of {data.total} suppliers
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, safePage - 1))}
                disabled={busy || safePage <= 1}
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
                onClick={() => setPage(Math.min(pageCount, safePage + 1))}
                disabled={busy || safePage >= pageCount}
                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 disabled:opacity-35"
                aria-label="Next page"
              >
                <ChevronRight size={17} />
              </button>
              <span className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">
                15 / page
              </span>
            </div>
          </div>
        </div>

        <div role={sheet === "detail" ? "dialog" : undefined} aria-modal={sheet === "detail" || undefined} aria-label="Supplier details" data-sheet="full" className={`${sheet === "detail" ? "fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-slate-100 p-3 pt-16" : "max-sm:hidden"} sm:contents`}>
        {sheet === "detail" && <button type="button" aria-label="Close supplier details" onClick={() => setSheet(null)} className="absolute right-3 top-3 z-10 grid h-11 w-11 place-items-center rounded-xl bg-white text-slate-700 shadow sm:hidden"><X size={20} /></button>}
        <SupplierDetailsPanel
          onEdit={() => { setSheet(null); if (selectedSupplier) setEditing(selectedSupplier); }}
          supplier={selectedSupplier}
          metric={selectedSupplier ? metrics.get(selectedSupplier.id) ?? emptyMetric : emptyMetric}
        />
        </div>
      </section>
      {!sheet && <button type="button" onClick={() => setSheet("add")} className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-full bg-blue-600 px-5 text-sm font-semibold text-white shadow-lg sm:hidden"><Plus size={18} />Add Supplier</button>}
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

      <SupplierForm />
    </aside>
  );
}

function SupplierForm({ supplier, onSaved, onBusyChange }: { supplier?: Supplier; onSaved?: () => void; onBusyChange?: (busy: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const form = event.currentTarget;
    lock.current = true; setBusy(true); onBusyChange?.(true); setError("");
    try {
      const data = new FormData(form);
      if (supplier) await updateSupplier(data, false); else await createSupplier(data);
      toast.success(supplier ? "Supplier updated successfully." : "Supplier created successfully.", { position: "top-right" });
      if (supplier) onSaved?.(); else form.reset();
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to save supplier. Please try again."); }
    finally { lock.current = false; setBusy(false); onBusyChange?.(false); }
  }
  return <form onSubmit={submit} className="mt-5 space-y-4" aria-busy={busy}>
      {supplier && <input type="hidden" name="supplierId" value={supplier.id} />}
      <fieldset disabled={busy} className="space-y-4">
        <FormField label="Supplier name" required>
          <input name="name" required defaultValue={supplier?.name ?? ""} placeholder="e.g. ABC Trading Co." className={inputClass} />
        </FormField>
        <FormField label="Contact person" required>
          <input name="contactPerson" required defaultValue={supplier?.contact_person ?? ""} placeholder="e.g. Dara Lim" className={inputClass} />
        </FormField>
        <FormField label="Phone" required>
          <input name="phone" required type="tel" defaultValue={supplier?.phone ?? ""} placeholder="e.g. 012 345 678" className={inputClass} />
        </FormField>
        <FormField label="Email">
          <input name="email" type="email" defaultValue={supplier?.email ?? ""} placeholder="supplier@example.com" className={inputClass} />
        </FormField>
        <FormField label="Address" required>
          <textarea
            name="address" required
            defaultValue={supplier?.address ?? ""}
            rows={2}
            placeholder="Supplier address"
            className={`${inputClass} resize-none`}
          />
        </FormField>
        <FormField label="Notes">
          <textarea
            name="notes"
            defaultValue={supplier?.notes ?? ""}
            rows={3}
            placeholder="Optional notes"
            className={`${inputClass} resize-none`}
          />
        </FormField>
        <button
          type="submit"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          {supplier ? <Pencil size={17} /> : <Plus size={17} />}
          {busy ? <span className="inline-flex items-center justify-center gap-2"><ButtonSpinner />{supplier ? "Saving…" : "Creating…"}</span> : supplier ? "Save Changes" : "Create Supplier"}
        </button>
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </form>;
}

function SupplierDetailsPanel({
  supplier,
  metric,
  onEdit,
}: {
  supplier: Supplier | null;
  metric: SupplierMetric;
  onEdit: () => void;
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
        <button
          type="button" onClick={onEdit}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <Pencil size={15} />
          Edit
        </button>
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

function SupplierActionMenu({ supplier, onEdit, onDelete }: { supplier: Supplier; onEdit: () => void; onDelete: () => void }) {
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
              <button
                type="button" onClick={() => { setOpen(false); onEdit(); }}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Pencil size={15} />
                Edit
              </button>

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

                <button
                  type="button" onClick={() => { setOpen(false); onDelete(); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={15} />
                  Delete
                </button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function SupplierDialog({ title, side = false, busy = false, close, children }: { title: string; side?: boolean; busy?: boolean; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return createPortal(<dialog ref={ref} role={side ? "dialog" : "alertdialog"} aria-label={title}
    onCancel={event => { event.preventDefault(); if (!busy) close(); }}
    onClick={event => { if (busy || event.target !== event.currentTarget) return; const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); }}
    style={side ? { position: "fixed", inset: "0 0 0 auto", margin: 0, width: "min(520px, 100vw)", maxWidth: "100vw", height: "100dvh", maxHeight: "100dvh", borderRadius: 0 } : { width: "min(420px, calc(100vw - 2rem))" }}
    className="m-auto overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/30">
    <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><h2 className="text-lg font-bold">{title}</h2><button type="button" disabled={busy} onClick={close} aria-label="Close dialog" className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-50"><X size={20} /></button></header>
    <div className="p-5">{children}</div>
  </dialog>, document.body);
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

const emptyMetric: SupplierMetric = {
  orderCount: 0,
  receivedTotal: 0,
  openValue: 0,
  lastOrderDate: null,
};

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

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
