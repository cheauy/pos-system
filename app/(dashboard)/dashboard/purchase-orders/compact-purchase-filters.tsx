"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Filter, Search, X } from "lucide-react";
import { dateRangeError } from "@/lib/date-range";
import type { PurchaseFilters } from "./list-actions";
import type { PurchaseOrderSupplier } from "./purchase-orders-client";
import styles from "./purchase-orders-responsive.module.css";

type Filters = Omit<PurchaseFilters, "page" | "search">;

export default function CompactPurchaseFilters({ search, onSearch, filters, suppliers, busy, onApply }: {
  search: string; onSearch: (value: string) => void; filters: Filters;
  suppliers: PurchaseOrderSupplier[]; busy: boolean; onApply: (filters: Filters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const active = filters.supplierFilter !== "all" || filters.statusFilter !== "all" || filters.sortMode !== "newest" || !!filters.fromDate || !!filters.toDate;
  useEffect(() => {
    if (!open) return;
    const node = dialog.current;
    const button = trigger.current;
    node?.showModal();
    return () => { node?.close(); button?.focus(); };
  }, [open]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = Object.fromEntries(data) as Filters;
    const validation = dateRangeError(next.fromDate, next.toDate);
    if (validation) { setError(validation); return; }
    onApply(next);
    setOpen(false);
  }

  return <div className={styles.compactToolbar}>
    <label className={styles.compactSearch}>
      <Search size={17} />
      <input aria-label="Search purchase orders" placeholder="Search PO, supplier or reference..." value={search} onChange={event => onSearch(event.target.value)} />
    </label>
    <button ref={trigger} type="button" className={active ? styles.activeFilter : ""} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setError(""); setOpen(true); }}><Filter size={17} />Filter{active && <span aria-hidden="true" className={styles.filterDot} />}</button>
    {open && <dialog ref={dialog} aria-labelledby="purchase-filter-title" className={styles.filterDialog} onCancel={event => { event.preventDefault(); setOpen(false); }} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setOpen(false); } }}>
      <div className={styles.filterHeading}><h2 id="purchase-filter-title">Filters</h2><button type="button" aria-label="Close purchase order filters" onClick={() => setOpen(false)}><X size={20} /></button></div>
      <form onSubmit={apply} className={styles.filterForm}>
        <label>Supplier<select name="supplierFilter" defaultValue={filters.supplierFilter}><option value="all">All Suppliers</option>{suppliers.map(supplier => <option key={supplier.id} value={supplier.id} data-i18n-ignore="true">{supplier.name}</option>)}</select></label>
        <label>Status<select name="statusFilter" defaultValue={filters.statusFilter}><option value="all">All Statuses</option><option value="draft">Draft</option><option value="sent">Sent</option><option value="partial">Partially Received</option><option value="received">Completed</option><option value="cancelled">Cancelled</option></select></label>
        <label>Sort by<select name="sortMode" defaultValue={filters.sortMode}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="highest">Highest total</option><option value="lowest">Lowest total</option></select></label>
        <div className={styles.filterDates}><label>From<input name="fromDate" type="date" defaultValue={filters.fromDate} /></label><label>To<input name="toDate" type="date" defaultValue={filters.toDate} /></label></div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className={styles.filterActions}><button type="button" onClick={event => { const form = event.currentTarget.form!; for (const [name, value] of Object.entries({ supplierFilter: "all", statusFilter: "all", sortMode: "newest", fromDate: "", toDate: "" })) (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement).value = value; setError(""); }}>Reset</button><button type="submit" className={styles.primary} disabled={busy}>Apply</button></div>
      </form>
    </dialog>}
  </div>;
}
