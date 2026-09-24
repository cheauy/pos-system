"use client";

import Link from "next/link";
import ReturnItemsForm from "./[id]/return-items-form";
import OrderPrintMenu from "@/components/order-print-menu";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronLeft, ChevronRight,
  Clock3, CreditCard, DollarSign, Ellipsis, Eye, FileText, Loader2, Mail, MapPin,
  Package, Pencil, Phone, Plus, Printer, QrCode, RefreshCw, RotateCcw,
  Search, ShieldCheck, ShoppingBag, ShoppingCart, Store, Trash2, X,
} from "lucide-react";
import {
  changeOrderWorkspaceStatus, deleteOrderWorkspaceOrder, getOrderWorkspaceDetail, saveOrderWorkspaceDetails,
} from "./order-workspace-actions";
import {
  dateText, deleteReason, fulfillmentLabels, methodLabel, money, nextStatuses,
  paymentLabels, sourceLabels, statusLabels,
  type ActionResult, type EditOrderInput, type OrderDetail, type OrderRow,
  type WorkspaceData, type WorkspaceFilters, type WorkspacePermissions,
} from "./order-workspace-types";
import styles from "./orders-workspace.module.css";

type Props = { businessId: string; businessName: string; showTableQr?: boolean; data: WorkspaceData; filters: WorkspaceFilters; permissions: WorkspacePermissions };
type ActionDialog = { type: "edit" | "status" | "delete"; order: OrderRow };
type QueueItem = { id: string; number: string };
const statusTabs = ["all", "new", "pending", "completed", "cancelled", "refunded"];
const receiptHref = (id: string) => `/dashboard/orders/${encodeURIComponent(id)}/receipt`;
const orderHref = (id: string) => `/dashboard/orders/${encodeURIComponent(id)}`;

export default function OrdersWorkspace({ businessId, businessName, showTableQr = false, data, filters, permissions }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(data.rows[0]?.id ?? null);
  const [panelClosed, setPanelClosed] = useState(false);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailReload, setDetailReload] = useState(0);
  const [narrow, setNarrow] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selected, setSelected] = useState<QueueItem[]>([]);
  const [queueOpen, setQueueOpen] = useState(false);
  const [menu, setMenu] = useState<{ row: OrderRow; rect: DOMRect; trigger: HTMLButtonElement } | null>(null);
  const [dialog, setDialog] = useState<ActionDialog | null>(null);
  const [notice, setNotice] = useState("");
  const filterForm = useRef<HTMLFormElement>(null);
  const allCheckbox = useRef<HTMLInputElement>(null);
  const visibleId = data.rows.some((row) => row.id === selectedId) ? selectedId : data.rows[0]?.id ?? null;
  const allChecked = data.rows.length > 0 && data.rows.every((row) => selected.some((item) => item.id === row.id));
  const someChecked = data.rows.some((row) => selected.some((item) => item.id === row.id));

  useEffect(() => {
    const query = window.matchMedia("(max-width: 1279px)");
    const update = () => setNarrow(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => { if (allCheckbox.current) allCheckbox.current.indeterminate = someChecked && !allChecked; }, [someChecked, allChecked]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 6500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    let active = true;
    if (!visibleId || panelClosed || (narrow && !mobileOpen)) { setDetail(null); setDetailLoading(false); return; }
    setDetailLoading(true); setDetailError(""); setDetail(null);
    getOrderWorkspaceDetail(visibleId, businessId).then((result) => {
      if (!active) return;
      if (result.success) setDetail(result.data); else setDetailError(result.message);
    }).catch(() => { if (active) setDetailError("Could not load the order. Check your connection and try again."); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [visibleId, businessId, data, detailReload, panelClosed, narrow, mobileOpen]);

  function navigate(changes: Partial<WorkspaceFilters>) {
    const next = { ...filters, ...changes };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value === "" || value === "all" || (key === "page" && value === 1) || (key === "limit" && value === 10) || (key === "sort" && value === "newest")) continue;
      params.set(key, String(value));
    }
    setMenu(null);
    startTransition(() => router.push(`/dashboard/orders${params.size ? `?${params}` : ""}`, { scroll: false }));
  }
  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form.entries()) as Record<string, string>;
    navigate({ search: values.search?.trim() ?? "", from: values.from ?? "", to: values.to ?? "", branch: values.branch || "all", source: values.source || "all", fulfillment: values.fulfillment || "all", payment: values.payment || "all", status: values.status || "all", page: 1 });
  }
  function refresh() { setMenu(null); startTransition(() => router.refresh()); }
  function selectRow(row: OrderRow) { setSelectedId(row.id); setPanelClosed(false); setMobileOpen(true); }
  function toggleSelected(row: OrderRow) {
    setSelected((items) => items.some((item) => item.id === row.id) ? items.filter((item) => item.id !== row.id) : items.length < 50 ? [...items, { id: row.id, number: row.orderNumber }] : items);
  }
  function toggleAll() {
    setSelected((items) => allChecked ? items.filter((item) => !data.rows.some((row) => row.id === item.id)) : [...items, ...data.rows.filter((row) => !items.some((item) => item.id === row.id)).map((row) => ({ id: row.id, number: row.orderNumber }))].slice(0, 50));
  }
  function openAction(type: ActionDialog["type"], order: OrderRow) { setMenu(null); setDialog({ type, order }); }
  function actionSuccess(message: string, deletedId?: string) {
    setDialog(null); setNotice(message);
    if (deletedId) { setSelected((items) => items.filter((item) => item.id !== deletedId)); setSelectedId(data.rows.find((row) => row.id !== deletedId)?.id ?? null); setMobileOpen(false); }
    refresh();
  }
  const firstShown = data.total === 0 ? 0 : (data.page - 1) * filters.limit + 1;
  const lastShown = Math.min(data.page * filters.limit, data.total);
  const activeFilters = !!(filters.search || filters.from || filters.to || [filters.branch, filters.source, filters.fulfillment, filters.payment, filters.status].some((value) => value !== "all"));
  const detailContent = <DetailPanel detail={detail} loading={detailLoading} error={detailError} currency={data.currency} timezone={data.timezone} permissions={permissions}
    onClose={() => { setPanelClosed(true); setMobileOpen(false); }} onRetry={() => setDetailReload((value) => value + 1)} onAction={openAction} onReturned={() => { setDetailReload(value => value + 1); refresh(); }} />;

  return <div className={styles.workspace}>
    <header className={styles.header}>
      <div><h1>Orders</h1><p>Review all orders, track statuses, manage payments, and print receipts.</p></div>
      <div className={styles.headerActions}>
        <button className={styles.button} type="button" onClick={refresh} disabled={pending}><RefreshCw size={15} className={pending ? styles.spin : ""} />Refresh</button>
        <button className={styles.button} type="button" onClick={() => setQueueOpen(true)} disabled={!selected.length}><Printer size={15} />Print Queue<span className={styles.counter}>{selected.length}</span></button>
        {permissions.create ? <Link className={`${styles.button} ${styles.primary}`} href="/dashboard/pos"><Plus size={17} />Create Order</Link>
          : <button type="button" className={`${styles.button} ${styles.primary}`} disabled title="POS access is required to create an order."><Plus size={17} />Create Order</button>}
      </div>
    </header>
    {notice && <div className={styles.toast} role="status"><Check size={18} />{notice}<button type="button" aria-label="Dismiss notification" onClick={() => setNotice("")}><X size={15} /></button></div>}
    <div className={styles.workspaceGrid}>
      <div className={styles.mainColumn}>
        <div className={styles.metrics}>
          <Metric title="Total Orders Today" value={String(data.metrics.today)} tone="blue" icon={<ShoppingCart size={23} />}
            footer={data.metrics.yesterday > 0 ? <span className={data.metrics.today >= data.metrics.yesterday ? styles.positive : styles.negative}>{data.metrics.today >= data.metrics.yesterday ? <ArrowUp size={12} /> : <ArrowDown size={12} />}{Math.abs((data.metrics.today - data.metrics.yesterday) / data.metrics.yesterday * 100).toFixed(0)}% <small>vs. yesterday</small></span> : <span>Today · {data.timezone}</span>} />
          <Metric title="Completed Sales" value={money(data.metrics.completed, data.currency)} tone="green" icon={<DollarSign size={23} />} footer={<span>Completed orders · filtered period</span>} />
          <Metric title="Pending Orders" value={String(data.metrics.pending)} tone="orange" icon={<Clock3 size={23} />} footer={<span>{money(data.metrics.pendingValue, data.currency)} · New + Pending</span>} />
          <Metric title="Refunded" value={String(data.metrics.refunds)} tone="red" icon={<RotateCcw size={22} />} footer={<span>{money(data.metrics.refundedAmount, data.currency)} · Recorded refunds</span>} />
        </div>
        <form ref={filterForm} key={JSON.stringify(filters)} onSubmit={applyFilters} className={styles.filters} aria-label="Filter orders">
          <div className={styles.filterTop}>
            <div className={styles.search}><Search size={16} /><input name="search" defaultValue={filters.search} maxLength={120} placeholder="Search by order number, customer name or phone…" aria-label="Search orders" /><button type="submit" aria-label="Apply search"><ChevronRight size={17} /></button></div>
            <div className={styles.dateRange}><label><span>From</span><input name="from" type="date" defaultValue={filters.from} aria-label="Start date" onChange={() => filterForm.current?.requestSubmit()} /></label><span className={styles.dateDash}>—</span><label><span>To</span><input name="to" type="date" defaultValue={filters.to} aria-label="End date" onChange={() => filterForm.current?.requestSubmit()} /></label></div>
          </div>
          <div className={styles.filterBottom}>
            <select name="branch" defaultValue={filters.branch} aria-label="Filter by branch" onChange={() => filterForm.current?.requestSubmit()}><option value="all">All Branches</option>{data.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
            <select name="fulfillment" defaultValue={filters.fulfillment} aria-label="Filter by fulfillment" onChange={() => filterForm.current?.requestSubmit()}><option value="all">All Fulfillment Types</option>{Object.entries(fulfillmentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select name="source" defaultValue={filters.source} aria-label="Filter by source" onChange={() => filterForm.current?.requestSubmit()}><option value="all">All Sources</option>{Object.entries(sourceLabels).filter(([value]) => value !== 'qr' || showTableQr).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select name="payment" defaultValue={filters.payment} aria-label="Filter by payment status" onChange={() => filterForm.current?.requestSubmit()}><option value="all">All Payment Statuses</option>{Object.entries(paymentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select name="status" defaultValue={filters.status} aria-label="Filter by order status" onChange={() => filterForm.current?.requestSubmit()}>{statusTabs.map((status) => <option key={status} value={status}>{status === "all" ? "All Order Statuses" : statusLabels[status]}</option>)}</select>
          </div>
        </form>
        <div className={styles.tabsRow}>
          <div className={styles.tabs} aria-label="Order status filters">{statusTabs.map((status) => <button key={status} type="button" disabled={pending} className={filters.status === status ? styles.activeTab : ""} onClick={() => navigate({ status, page: 1 })} aria-pressed={filters.status === status}>{statusLabels[status]} <span>({data.counts[status] ?? 0})</span></button>)}</div>
          {activeFilters && <button className={styles.textButton} type="button" onClick={() => navigate({ search: "", branch: "all", source: "all", fulfillment: "all", payment: "all", status: "all", from: "", to: "", page: 1 })}>Clear filters</button>}
        </div>
        <section className={styles.tableCard} aria-label="Orders list" aria-busy={pending}>
          {selected.length > 0 && <div className={styles.selectionBar}><Printer size={14} /><span>{selected.length} selected for printing <small>(up to 50)</small></span><button type="button" onClick={() => setSelected([])}>Clear selection</button></div>}
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead><tr>
                <th className={styles.checkColumn}><input type="checkbox" ref={allCheckbox} checked={allChecked} onChange={toggleAll} disabled={!data.rows.length} aria-label="Select all orders on this page for printing" /></th>
                <th>Order ID</th><th>Customer</th><th>Items</th><th>Source</th><th>Payment</th><th>Total</th><th>Status</th>
                <th><button type="button" className={styles.sortButton} onClick={() => navigate({ sort: filters.sort === "newest" ? "oldest" : "newest", page: 1 })} aria-label={`Sort by date, currently ${filters.sort}`}>Date/Time <ArrowUpDown size={12} /></button></th>
                <th>Branch</th><th className={styles.actionColumn}>Actions</th>
              </tr></thead>
              <tbody>{data.rows.map((row) => <tr key={row.id} className={!panelClosed && visibleId === row.id ? styles.selectedRow : ""} onClick={() => selectRow(row)}>
                <td className={styles.checkColumn}><input type="checkbox" checked={selected.some((item) => item.id === row.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggleSelected(row)} aria-label={`Select order ${row.orderNumber} for printing`} /></td>
                <td><button className={styles.orderLink} type="button" onClick={(event) => { event.stopPropagation(); selectRow(row); }}>{row.orderNumber}</button></td>
                <td className={styles.customerCell}><span title={row.customerName}>{row.customerName}</span><small>{row.customerPhone || "No phone"}</small></td>
                <td>{row.itemCount} {row.itemCount === 1 ? "item" : "items"}</td>
                <td><span className={styles.source}><SourceIcon source={row.source} />{sourceLabels[row.source] || row.source}</span></td>
                <td><Badge value={row.paymentState} payment /></td>
                <td className={styles.total}>{money(row.total, data.currency)}</td>
                <td><Badge value={row.status} />{row.status === "pending" && row.onlineStatus && <small className={styles.subStatus}>{statusLabels[row.onlineStatus] || row.onlineStatus}</small>}</td>
                <td className={styles.dateCell}>{dateText(row.createdAt, data.timezone)}<small>{dateText(row.createdAt, data.timezone, true)}</small></td>
                <td className={styles.branchCell} title={row.branchName}>{row.branchName}</td>
                <td className={styles.actionColumn}><button type="button" className={styles.iconButton} aria-label={`Actions for order ${row.orderNumber}`} aria-haspopup="menu" aria-expanded={menu?.row.id === row.id} onClick={(event) => { event.stopPropagation(); const trigger = event.currentTarget; setMenu({ row, rect: trigger.getBoundingClientRect(), trigger }); }}><Ellipsis size={17} /></button></td>
              </tr>)}</tbody>
            </table>
          </div>
          {!data.rows.length && <div className={styles.empty}><ShoppingBag size={40} /><h3>{activeFilters ? "No orders match your filters" : "No orders yet"}</h3><p>{activeFilters ? "Try a different customer, date range, branch, or status." : (showTableQr ? "Orders from your POS, public store, and table QR codes appear here." : "Orders from your POS and online store appear here.")}</p>{activeFilters && <button type="button" className={styles.button} onClick={() => navigate({ search: "", branch: "all", source: "all", fulfillment: "all", payment: "all", status: "all", from: "", to: "", page: 1 })}>Reset filters</button>}</div>}
          <footer className={styles.pagination}>
            <span>{pending ? "Updating orders…" : `Showing ${firstShown}–${lastShown} of ${data.total} orders`}</span>
            <div><button type="button" className={styles.pageButton} disabled={data.page <= 1 || pending} onClick={() => navigate({ page: data.page - 1 })} aria-label="Previous page"><ChevronLeft size={14} /></button>
              {pageButtons(data.page, data.pages).map((page, index) => page === "gap" ? <span key={`gap-${index}`} className={styles.ellipsis}>…</span> : <button key={page} type="button" className={`${styles.pageButton} ${page === data.page ? styles.currentPage : ""}`} disabled={pending} onClick={() => navigate({ page })} aria-current={page === data.page ? "page" : undefined}>{page}</button>)}
              <button type="button" className={styles.pageButton} disabled={data.page >= data.pages || pending} onClick={() => navigate({ page: data.page + 1 })} aria-label="Next page"><ChevronRight size={14} /></button>
              <select aria-label="Orders per page" value={filters.limit} onChange={(event) => navigate({ limit: Number(event.target.value), page: 1 })}>{[10, 20, 50].map((limit) => <option key={limit} value={limit}>{limit} / page</option>)}</select>
            </div>
          </footer>
        </section>
        <p className={styles.scopeNote}><ShieldCheck size={12} />{businessName} · Sales, pending amounts, refunds, and tab counts follow your filters. Today’s count covers the business day.</p>
      </div>
      {!narrow && <aside className={styles.detailColumn}>{panelClosed || !visibleId ? <div className={styles.detailPlaceholder}><FileText size={32} /><h3>Select an order</h3><p>Review customer details, items, payments, and activity.</p>{panelClosed && visibleId && <button className={styles.button} type="button" onClick={() => setPanelClosed(false)}>Show details</button>}</div> : detailContent}</aside>}
    </div>
    {narrow && mobileOpen && !panelClosed && visibleId && <Modal title="Order details" onClose={() => setMobileOpen(false)} wide>{detailContent}</Modal>}
    {menu && <RowMenu menu={menu} permissions={permissions} onClose={() => setMenu(null)} onAction={openAction} onView={() => { selectRow(menu.row); setMenu(null); }} />}
    {dialog && <ManageOrderDialog action={dialog} businessId={businessId} permissions={permissions} onClose={() => setDialog(null)} onSuccess={actionSuccess} />}
    {queueOpen && <Modal title={`Print Queue (${selected.length})`} onClose={() => setQueueOpen(false)}>
      <p className={styles.modalHelp}>Choose a receipt or shipping label for each order, review the preview, then print using your saved settings.</p>
      <div className={styles.printQueue}>{selected.map((item) => <div key={item.id}><span>{item.number}</span><OrderPrintMenu orderId={item.id} className={styles.button}/><button className={styles.iconButton} type="button" aria-label={`Remove ${item.number} from print queue`} onClick={() => setSelected((items) => items.filter((entry) => entry.id !== item.id))}><X size={14} /></button></div>)}</div>
      {!selected.length && <p className={styles.modalHelp}>The queue is empty. Select orders using the table checkboxes.</p>}
    </Modal>}
  </div>;
}

function Metric({ title, value, icon, tone, footer }: { title: string; value: string; icon: ReactNode; tone: string; footer: ReactNode }) {
  return <section className={styles.metric}><div className={`${styles.metricIcon} ${styles[tone]}`}>{icon}</div><div><h2>{title}</h2><strong title={value}>{value}</strong><div className={styles.metricFooter}>{footer}</div></div></section>;
}
function Badge({ value, payment = false }: { value: string; payment?: boolean }) {
  const tone = ["completed", "paid"].includes(value) ? "green" : ["pending", "partial", "pending_verification", "preparing"].includes(value) ? "orange" : ["refunded"].includes(value) ? "red" : ["cancelled", "rejected"].includes(value) ? "neutral" : "blue";
  return <span className={`${styles.badge} ${styles[tone]}`}>{(payment ? paymentLabels : statusLabels)[value] || value}</span>;
}
function SourceIcon({ source }: { source: string }) { return source === "qr" ? <QrCode size={14} /> : source === "online" ? <ShoppingBag size={14} /> : <Store size={14} />; }
function pageButtons(current: number, total: number): (number | "gap")[] {
  const pages = [...new Set([1, current - 1, current, current + 1, total].filter((value) => value > 0 && value <= total))].sort((a, b) => a - b);
  const output: (number | "gap")[] = [];
  pages.forEach((value, index) => { if (index && value - pages[index - 1] > 1) output.push("gap"); output.push(value); });
  return output;
}

function DetailPanel({ detail, loading, error, currency, timezone, permissions, onClose, onRetry, onAction, onReturned }: {
  onReturned: () => void;
  detail: OrderDetail | null; loading: boolean; error: string; currency: string; timezone: string; permissions: WorkspacePermissions;
  onClose: () => void; onRetry: () => void; onAction: (type: ActionDialog["type"], row: OrderRow) => void;
}) {
  if (loading) return <div className={styles.detailCard} aria-busy="true" aria-label="Loading order details"><div className={styles.skeletonTitle} /><div className={styles.skeletonLine} /><div className={styles.skeletonBlock} /><div className={styles.skeletonBlock} /><div className={styles.skeletonLine} /></div>;
  if (error) return <div className={styles.detailCard}><div className={styles.error} role="alert"><AlertCircle size={19} />{error}</div><button className={styles.button} type="button" onClick={onRetry}>Try again</button></div>;
  if (!detail) return <div className={styles.detailPlaceholder}><FileText size={30} /><p>Select an order to view its details.</p></div>;
  const order = detail;
  const initials = order.customerName.split(/\s+/).slice(0, 2).map((name) => name[0]).join("").toUpperCase();
  const canStatus = permissions.edit && nextStatuses(order, permissions.cancel).length > 0;
  const blockedDelete = deleteReason(order);
  const paid = Math.max(0, order.amountPaid - order.changeAmount);
  const returnedQuantity = order.items.reduce((total, item) => total + item.returnedQuantity, 0);
  const allReturned = order.items.length > 0 && order.items.every(item => item.returnedQuantity >= item.quantity);
  return <section className={styles.detailCard} aria-label={`Order ${order.orderNumber} details`}>
    <div className={styles.detailHeading}><div><h2>Order {order.orderNumber}</h2><div><Badge value={order.status} />{returnedQuantity > 0 && <span className={`${styles.badge} ${styles.orange}`}>{allReturned ? "Items returned" : "Partially returned"} · Refund recorded</span>}<small>{dateText(order.createdAt, timezone)} at {dateText(order.createdAt, timezone, true)}</small></div></div><button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close order details"><X size={16} /></button></div>
    <div className={styles.detailActions}>
      <Link className={styles.miniButton} href={orderHref(order.id)}><Eye size={13} />View</Link>
      <OrderPrintMenu orderId={order.id} className={styles.miniButton}/>
      {permissions.refund && !order.returnsUnavailable && ["new", "pending", "completed"].includes(order.status) && <ReturnItemsForm key={order.id} orderId={order.id} orderNumber={order.orderNumber} triggerClassName={styles.miniButton} onReturned={onReturned} currency={currency} items={order.items.map(item => ({ id: item.id, product_name: [item.name, item.variant, ...item.options].filter(Boolean).join(" · "), quantity: item.quantity, unit_price: item.unitPrice, returned_quantity: item.returnedQuantity }))} />}
    </div>
    <div className={styles.manageActions}>
      <button type="button" className={styles.miniButton} disabled={!permissions.edit} title={!permissions.edit ? "Order update permission is required." : "Edit order details"} onClick={() => onAction("edit", order)}><Pencil size={13} />Edit</button>
      <button type="button" className={styles.miniButton} disabled={!canStatus} title={!canStatus ? "No available status changes for this order." : "Change order status"} onClick={() => onAction("status", order)}><ArrowUpDown size={13} />Change Status</button>
      <button type="button" className={`${styles.miniButton} ${styles.dangerText}`} disabled={!permissions.delete || !!blockedDelete} title={blockedDelete || (!permissions.delete ? "Delete permission is required." : "Delete unpaid order")} onClick={() => onAction("delete", order)}><Trash2 size={13} />Delete</button>
    </div>
    <section className={styles.detailSection}><h3>Customer</h3><div className={styles.customerProfile}><div className={styles.avatar}>{initials}</div><div><strong>{order.customerName}</strong>{order.customerPhone && <a href={`tel:${order.customerPhone.replace(/[^\d+]/g, "")}`}><Phone size={11} />{order.customerPhone}</a>}{order.customerEmail && <a href={`mailto:${order.customerEmail}`}><Mail size={11} />{order.customerEmail}</a>}{!order.customerPhone && !order.customerEmail && <small>No contact information</small>}</div></div>{order.customerAddress && <p className={styles.address}><MapPin size={13} />{order.customerAddress}</p>}</section>
    <div className={styles.orderContext}><span><SourceIcon source={order.source} />{sourceLabels[order.source] || order.source}</span>{order.fulfillment && <span>{fulfillmentLabels[order.fulfillment] || order.fulfillment}</span>}<span><Store size={12} />{order.branchName}</span>{order.tableName && <span><QrCode size={12} />{order.tableName}</span>}{order.onlineStatus && <span>{statusLabels[order.onlineStatus] || order.onlineStatus}</span>}</div>
    {order.requestedFor && <p className={styles.scheduled}><Clock3 size={13} />Scheduled: {dateText(order.requestedFor, timezone)} · {dateText(order.requestedFor, timezone, true)}</p>}
    <section className={styles.detailSection}><h3>Items ({order.items.length})</h3><div className={styles.items}>{order.items.map((item) => <div key={item.id} className={styles.item}>
      <div className={styles.itemImage}>{item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <Package size={19} />}</div>
      <div className={styles.itemText}><strong>{item.name}</strong>{item.variant && <small>{item.variant}</small>}{item.options.length > 0 && <small>{item.options.join(", ")}</small>}<small>{money(item.unitPrice, currency)} × {item.quantity}</small>{item.returnedQuantity > 0 && <small>Returned: {item.returnedQuantity} · Refund recorded</small>}</div><span>{money(item.subtotal, currency)}</span>
    </div>)}</div></section>
    <div className={styles.totals}><div><span>Subtotal</span><span>{money(order.subtotal, currency)}</span></div><div><span>Discount{order.couponCode ? ` · ${order.couponCode}` : ""}</span><span>−{money(order.discount, currency)}</span></div><div><span>Delivery fee</span><span>{money(order.deliveryFee, currency)}</span></div><div className={styles.grandTotal}><strong>Total</strong><strong>{money(order.total, currency)}</strong></div></div>
    <section className={styles.detailSection}><div className={styles.sectionHeading}><h3>Payment</h3><Badge value={order.paymentState} payment /></div><div className={styles.paymentRow}><CreditCard size={20} /><div><strong>{methodLabel(order.paymentMethod)}</strong>{order.paymentReference && <small>Reference: {order.paymentReference}</small>}</div><strong>{money(paid, currency)}</strong></div>{order.changeAmount > 0 && <p className={styles.paymentExtra}>Change given <span>{money(order.changeAmount, currency)}</span></p>}{order.remainingBalance > 0 && <p className={styles.paymentExtra}>Balance due <strong>{money(order.remainingBalance, currency)}</strong></p>}</section>
    <section className={styles.detailSection}><div className={styles.sectionHeading}><h3>Notes</h3>{permissions.edit && <button className={styles.textButton} type="button" onClick={() => onAction("edit", order)}><Pencil size={12} />Edit</button>}</div><p className={styles.note}>{order.note || "No special notes for this order."}</p></section>
    <section className={styles.detailSection}><h3>Order Timeline</h3><ol className={styles.timeline}>{order.activity.map((activity) => <li key={activity.id}><strong>{activity.description}</strong><small>{dateText(activity.createdAt, timezone)} · {dateText(activity.createdAt, timezone, true)}</small></li>)}</ol>{order.activityUnavailable && <p className={styles.warningText}>Additional activity could not be loaded.</p>}</section>
  </section>;
}

function RowMenu({ menu, permissions, onClose, onAction, onView }: {
  menu: { row: OrderRow; rect: DOMRect; trigger: HTMLButtonElement }; permissions: WorkspacePermissions;
  onClose: () => void; onAction: (type: ActionDialog["type"], row: OrderRow) => void; onView: () => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = element.current;
    root?.querySelector<HTMLElement>("button:not(:disabled),a")?.focus();
    const outside = (event: PointerEvent) => { if (!root?.contains(event.target as Node)) onClose(); };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); menu.trigger.focus(); }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault(); const items = Array.from(root?.querySelectorAll<HTMLElement>("button:not(:disabled),a") ?? []);
        const index = items.indexOf(document.activeElement as HTMLElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }
      if (event.key === "Tab") onClose();
    };
    const scroll = () => onClose();
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape); window.addEventListener("resize", scroll); window.addEventListener("scroll", scroll, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); window.removeEventListener("resize", scroll); window.removeEventListener("scroll", scroll, true); };
    // Menu lifetime is tied to its trigger; callbacks operate on that row snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const top = Math.max(8, menu.rect.bottom + 6 + 232 < window.innerHeight ? menu.rect.bottom + 6 : menu.rect.top - 238);
  const left = Math.max(8, Math.min(menu.rect.right - 214, window.innerWidth - 222));
  const blocked = deleteReason(menu.row);
  return createPortal(<div ref={element} role="menu" aria-label={`Order ${menu.row.orderNumber} actions`} className={styles.rowMenu} style={{ top, left }}>
    <div className={styles.menuLabel}>{menu.row.orderNumber}</div>
    <button role="menuitem" type="button" onClick={onView}><Eye size={15} />View details</button>
    <a role="menuitem" href={`/dashboard/orders/${encodeURIComponent(menu.row.id)}/shipping-label`} target="_blank" rel="noopener noreferrer" onClick={onClose}><Printer size={15} />Print shipping label</a>
    <a role="menuitem" href={receiptHref(menu.row.id)} target="_blank" rel="noopener noreferrer" onClick={onClose}><Printer size={15} />Print receipt</a>
    <button role="menuitem" type="button" disabled={!permissions.edit || !nextStatuses(menu.row, permissions.cancel).length} onClick={() => onAction("status", menu.row)}><ArrowUpDown size={15} />Change status</button>
    <button role="menuitem" type="button" disabled={!permissions.edit} onClick={() => onAction("edit", menu.row)}><Pencil size={15} />Edit</button>
    <div className={styles.menuDivider} />
    <button role="menuitem" type="button" className={styles.dangerText} disabled={!permissions.delete || !!blocked} title={blocked || (!permissions.delete ? "Delete permission required." : "Delete order")} onClick={() => onAction("delete", menu.row)}><Trash2 size={15} />Delete</button>
  </div>, document.body);
}

function Modal({ title, onClose, children, busy = false, wide = false }: { title: string; onClose: () => void; children: ReactNode; busy?: boolean; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); if (prior?.isConnected) prior.focus(); };
  }, []);
  return createPortal(<dialog ref={ref} className={`${styles.modal} ${wide ? styles.wideModal : ""}`} aria-label={title} onCancel={(event) => { event.preventDefault(); if (!busy) closeRef.current(); }} onClick={(event) => { const element = ref.current; if (!busy && element && event.target === element) { const rect = element.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeRef.current(); } }}>
    <div className={styles.modalHeader}><h2>{title}</h2><button className={styles.iconButton} type="button" onClick={onClose} disabled={busy} aria-label="Close dialog"><X size={18} /></button></div>
    <div className={styles.modalBody}>{children}</div>
  </dialog>, document.body);
}

function ManageOrderDialog({ action, businessId, permissions, onClose, onSuccess }: { action: ActionDialog; businessId: string; permissions: WorkspacePermissions; onClose: () => void; onSuccess: (message: string, deletedId?: string) => void }) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError(""); setOrder(null);
    getOrderWorkspaceDetail(action.order.id, businessId).then((result) => {
      if (!active) return;
      if (!result.success) { setError(result.message); return; }
      setOrder(result.data); setNote(result.data.note || ""); setName(result.data.guestName || ""); setPhone(result.data.guestPhone || ""); setAddress(result.data.guestAddress || "");
      setStatus(nextStatuses(result.data, permissions.cancel)[0]?.value || "");
    }).catch(() => { if (active) setError("The order could not be loaded. Please try again."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [action.order.id, businessId, permissions.cancel, reload]);
  const contactEditable = !!order && !order.customerId && ["new", "pending"].includes(order.status);
  const options = order ? nextStatuses(order, permissions.cancel) : [];
  const blockedDelete = order ? deleteReason(order) : "";
  const title = action.type === "edit" ? "Edit Order Details" : action.type === "status" ? "Change Order Status" : "Delete Order";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!order || saving) return;
    setError(""); setSaving(true);
    try {
      let result: ActionResult;
      if (action.type === "edit") {
        const input: EditOrderInput = { note };
        if (contactEditable) Object.assign(input, { guestName: name, guestPhone: phone, guestAddress: address });
        result = await saveOrderWorkspaceDetails(order.id, order.updatedAt, input, businessId);
      } else if (action.type === "status") {
        result = await changeOrderWorkspaceStatus(order.id, order.updatedAt, status, reason, businessId);
      } else {
        if (confirm.trim() !== order.orderNumber) { setError("Type the exact order number to confirm deletion."); return; }
        result = await deleteOrderWorkspaceOrder(order.id, order.updatedAt, reason, businessId);
      }
      if (!result.success) setError(result.message); else onSuccess(result.message || "Order updated.", action.type === "delete" ? order.id : undefined);
    } catch { setError("Unable to confirm the result. Check your connection, then refresh the order before retrying."); }
    finally { setSaving(false); }
  }
  return <Modal title={title} onClose={onClose} busy={saving}>
    {loading ? <p className={styles.modalLoading}><Loader2 className={styles.spin} size={20} />Loading the latest order…</p> : <form onSubmit={submit}>
      {error && <div role="alert" className={styles.error}><AlertCircle size={18} /><div>{error}<button type="button" className={styles.textButton} onClick={() => setReload((value) => value + 1)} disabled={saving}>Reload latest order</button></div></div>}
      {order && <><div className={styles.modalOrder}><strong>{order.orderNumber}</strong><span>{order.customerName}</span><Badge value={order.status} /></div>
        {action.type === "edit" && <>
          <p className={styles.modalHelp}>Edit the order note{contactEditable ? " and guest contact details" : ""}. Products, quantities, totals, payments, and stock are not changed here.</p>
          {contactEditable ? <div className={styles.formFields}>
            <label>Customer name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required={["online", "qr"].includes(order.source)} disabled={saving} /></label>
            <label>Phone<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={60} required={["online", "qr"].includes(order.source)} disabled={saving} /></label>
            <label className={styles.fullWidth}>Address<textarea value={address} onChange={(event) => setAddress(event.target.value)} maxLength={500} rows={2} required={order.fulfillment === "delivery"} disabled={saving} /></label>
          </div> : <div className={styles.info}><ShieldCheck size={17} />{order.customerId ? "This order is linked to a customer record. Contact changes belong in Customers, not on the saved sale." : "Contact information is locked on a finalized order."}</div>}
          <label className={styles.fieldLabel}>Order note <span>{note.length}/1000</span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={4} placeholder="Add a note for this order…" disabled={saving} /></label>
          <p className={styles.fieldHelp}>This is the order note, not a private staff note. It may appear on order details and receipts.</p>
        </>}
        {action.type === "status" && <>
          <p className={styles.modalHelp}>Choose the next step. A status change does not collect or refund payment.</p>
          {options.length ? <label className={styles.fieldLabel}>New status<select value={status} onChange={(event) => setStatus(event.target.value)} disabled={saving}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label> : <div className={styles.info}><ShieldCheck size={18} />This order has no available status changes. Completed, cancelled, and refunded orders cannot be reopened here.</div>}
          {status === "cancelled" && <><div className={styles.warning}><AlertCircle size={18} />Cancellation uses the existing stock-restoration procedure. This cannot be undone here.</div><label className={styles.fieldLabel}>Cancellation reason<textarea required value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} disabled={saving} /></label></>}
        </>}
        {action.type === "delete" && <>
          {blockedDelete ? <div className={styles.warning}><ShieldCheck size={18} />{blockedDelete}</div> : <>
            <div className={styles.warning}><AlertCircle size={20} /><div><strong>Delete this unpaid order from the Orders list?</strong><p>{order.status === "cancelled" ? "The order is already cancelled. Stock will not be restored twice." : "The order will first be cancelled using the existing stock-restoration procedure."} The transaction, items, and audit history remain stored; they are not permanently erased.</p></div></div>
            <label className={styles.fieldLabel}>Deletion reason<textarea required value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} disabled={saving} placeholder="Why is this order being removed?" /></label>
            <label className={styles.fieldLabel}>Type <strong>{order.orderNumber}</strong> to confirm<input required value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="off" disabled={saving} /></label>
          </>}
        </>}
        <div className={styles.modalFooter}><button type="button" className={styles.button} onClick={onClose} disabled={saving}>Cancel</button><button type="submit" className={`${styles.button} ${action.type === "delete" ? styles.dangerButton : styles.primary}`} disabled={saving || (action.type === "delete" && (!!blockedDelete || confirm.trim() !== order.orderNumber || !reason.trim())) || (action.type === "status" && (!options.length || (status === "cancelled" && !reason.trim())))}>{saving ? <Loader2 size={16} className={styles.spin} /> : action.type === "delete" ? <Trash2 size={15} /> : <Check size={16} />}{action.type === "delete" ? "Delete Order" : action.type === "edit" ? "Save Changes" : "Update Status"}</button></div>
      </>}
    </form>}
  </Modal>;
}
