"use client";

import Link from "next/link";
import ReturnItemsForm from "./[id]/return-items-form";
import { CancelOrderItem } from "./[id]/order-detail-controls";
import OrderPrintMenu from "@/components/order-print-menu";
import ProductPhoto from "@/components/product-photo";
import OrderPrintPreview, {type OrderPrintKind} from "@/components/order-print-preview";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle, ArrowUpDown, Check, ChevronLeft, ChevronRight,
  Clock3, CreditCard, Ellipsis, Eye, FileText, Loader2, Mail, MapPin,
  Package, Pencil, Phone, Plus, Printer, QrCode, RefreshCw,
  Search, ShieldCheck, ShoppingBag, Store, Trash2, X,
  Bell, BellRing, Volume2, VolumeX, Ban, ExternalLink, SlidersHorizontal,
  CalendarDays, CheckCircle2, Coins, ReceiptText, RotateCcw, Truck, UserRound, Wallet,
} from "lucide-react";
import {
  changeOrderWorkspaceStatus, deleteOrderWorkspaceOrder, deleteOrderWorkspaceOrders, getOrderWorkspaceDetail, saveOrderWorkspaceDetails,
} from "./order-workspace-actions";
import {
  dateText, deleteReason, fulfillmentLabels, methodLabel, money as plainMoney, nextStatuses,
  paymentLabels, sourceLabels, statusLabels,
  type ActionResult, type EditOrderInput, type OrderDetail, type OrderRow,
  type WorkspaceData, type WorkspaceFilters, type WorkspacePermissions,
} from "./order-workspace-types";
import styles from "./orders-workspace.module.css";
import { formatStoreMoney, type CurrencyFormat } from "@/lib/currency-format";
import { setIncomingOrderScope, updateOnlinePaymentStatus } from "../online-orders/actions";
import { createClient } from "@/lib/supabase/client";
import { realtimeTopic } from "@/lib/supabase/realtime-topic";
import { createOrdersRefreshScheduler, ORDERS_REFRESH_EVENT } from "@/lib/orders/workspace-refresh";
import { ORDER_ALERTS_KEY, ORDER_SOUND_KEY } from "@/components/online-order-listener";
import { toast } from "sonner";
import CancelOrderForm from "@/components/cancel-order-form";

function money(value: number, currency: string, format?: CurrencyFormat) {
  return format ? formatStoreMoney(Number(value) || 0, format) : plainMoney(value, currency);
}

const PREFS_EVENT = "tenh-order-prefs";
function subscribePrefs(callback: () => void) {
  window.addEventListener("storage", callback); window.addEventListener(PREFS_EVENT, callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener(PREFS_EVENT, callback); };
}
function readPref(key: string) { try { return localStorage.getItem(key); } catch { return null; } }
function useOrderPreference(key: string) {
  return useSyncExternalStore(subscribePrefs, () => readPref(key), () => null);
}
function setOrderPreference(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* Preferences are optional. */ }
  window.dispatchEvent(new Event(PREFS_EVENT));
}

type Props = { businessId: string; branchId: string; businessName: string; showTableQr?: boolean; data: WorkspaceData; filters: WorkspaceFilters; permissions: WorkspacePermissions };
type ActionDialog = { type: "edit" | "status" | "delete"; order: OrderRow };
// The row snapshot lets bulk delete reuse per-order eligibility and version checks.
type QueueItem = { id: string; number: string; row: OrderRow };
const statusTabs = ["all", "new", "pending", "in_progress", "completed", "cancelled", "refunded"];

const orderHref = (id: string) => `/dashboard/orders/${encodeURIComponent(id)}`;

export default function OrdersWorkspace({ businessId, branchId, businessName, showTableQr = false, data, filters, permissions }: Props) {
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
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [printPreview,setPrintPreview]=useState<{id:string;kind:OrderPrintKind}|null>(null);
  const [menu, setMenu] = useState<{ row: OrderRow; rect: DOMRect; trigger: HTMLButtonElement } | null>(null);
  const [dialog, setDialog] = useState<ActionDialog | null>(null);
  const [notice, setNotice] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterForm = useRef<HTMLFormElement>(null);
  const loadedId = useRef<string | null>(null);
  const allCheckbox = useRef<HTMLInputElement>(null);
  // New rows can push the selected order off this page. Keep its mounted
  // detail/return draft until the user selects another order or closes it.
  const visibleId = selectedId ?? data.rows[0]?.id ?? null;
  const detailRevision = JSON.stringify([data.rows.find(row => row.id === visibleId) ?? null, permissions, data.receiveAllOnline]);
  const detailSnapshot = useRef({ id: visibleId, revision: detailRevision });
  const currentDetailFormat = { id: visibleId, viewingBranch: filters.branch, currency: data.currency, currencyFormat: data.currencyFormat, timezone: data.timezone };
  const [detailFormat, setDetailFormat] = useState(currentDetailFormat);
  // Adjust on every selection transition, including deletion/empty-list fallback.
  // Same-scope settings stay current; a retained order keeps its original units
  // while another branch's list is shown. This does not remount its return form.
  if (detailFormat.id !== visibleId || (detailFormat.viewingBranch === filters.branch &&
    (detailFormat.currency !== data.currency || detailFormat.timezone !== data.timezone || JSON.stringify(detailFormat.currencyFormat) !== JSON.stringify(data.currencyFormat)))) {
    setDetailFormat(currentDetailFormat);
  }
  const pendingDetailRefresh = useRef(false);
  const visibleIdRef = useRef(visibleId);
  const refreshScheduler = useRef<ReturnType<typeof createOrdersRefreshScheduler> | null>(null);
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
  const [live, setLive] = useState(false);
  const alertsPref = useOrderPreference(ORDER_ALERTS_KEY);
  const soundOn = useOrderPreference(ORDER_SOUND_KEY) !== "0";
  const alertsOn = alertsPref === "1" && typeof Notification !== "undefined" && Notification.permission === "granted";
  const [scopeBusy, setScopeBusy] = useState(false);
  // Live list: any order insert/update in this business refreshes the page data (debounced).
  // New-order alerts themselves come from the dashboard-wide OnlineOrderListener.
  useEffect(() => {
    const supabase = createClient();
    const scheduler = createOrdersRefreshScheduler((detailNeeded) => {
      pendingDetailRefresh.current ||= detailNeeded;
      startTransition(() => router.refresh());
    }, () => document.visibilityState === "visible");
    refreshScheduler.current = scheduler;
    const channel = supabase
      .channel(realtimeTopic(`orders-workspace:${businessId}`))
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `business_id=eq.${businessId}` }, (payload) => {
        const id = (payload.new as { id?: string }).id ?? (payload.old as { id?: string }).id;
        scheduler.request(id === visibleIdRef.current);
      })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    // No timed polling: refresh only on real order changes or the Refresh button.
    const onVisible = () => { if (document.visibilityState === "visible") scheduler.resume(); };
    const onIncoming = (event: Event) => {
      const request = event as CustomEvent<{ businessId: string; branchId: string }>;
      if (request.detail.businessId !== businessId || request.detail.branchId !== branchId) return;
      event.preventDefault(); scheduler.request();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(ORDERS_REFRESH_EVENT, onIncoming);
    return () => {
      scheduler.dispose(); refreshScheduler.current = null;
      document.removeEventListener("visibilitychange", onVisible); window.removeEventListener(ORDERS_REFRESH_EVENT, onIncoming);
      void supabase.removeChannel(channel);
    };
  }, [businessId, branchId, router]);
  useEffect(() => { visibleIdRef.current = visibleId; }, [visibleId]);
  useEffect(() => {
    const changed = detailSnapshot.current.id === visibleId && detailSnapshot.current.revision !== detailRevision;
    detailSnapshot.current = { id: visibleId, revision: detailRevision };
    // Consume a forced refresh with the new route payload, so a changed row and
    // a periodic/mutation invalidation trigger one detail request together.
    if (changed || pendingDetailRefresh.current) {
      pendingDetailRefresh.current = false;
      setDetailReload(value => value + 1);
    }
  }, [data, visibleId, detailRevision]);
  async function toggleAlerts() {
    if (alertsOn) { setOrderPreference(ORDER_ALERTS_KEY, "0"); toast.success("Desktop alerts turned off."); return; }
    if (!("Notification" in window)) { toast.error("This browser does not support desktop notifications."); return; }
    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permission !== "granted") { toast.error("Notifications are blocked. Allow them for this site in your browser settings."); return; }
    setOrderPreference(ORDER_ALERTS_KEY, "1");
    toast.success("Desktop alerts on. You'll be notified of new online orders even in another tab.");
  }
  function toggleSound() { setOrderPreference(ORDER_SOUND_KEY, soundOn ? "0" : "1"); }
  async function toggleScope(receiveAll: boolean) {
    setScopeBusy(true);
    try {
      const result = await setIncomingOrderScope(receiveAll);
      if (result.success) { toast.success(result.message); refresh(); } else toast.error(result.message);
    } catch { toast.error("Unable to save the order scope. Try again."); }
    finally { setScopeBusy(false); }
  }
  useEffect(() => {
    let active = true;
    if (!visibleId || panelClosed || (narrow && !mobileOpen)) { setDetail(null); setDetailLoading(false); loadedId.current = null; return; }
    // Live refreshes of the same order update in place instead of flashing a skeleton.
    const sameOrder = loadedId.current === visibleId;
    if (!sameOrder) { setDetailLoading(true); setDetail(null); }
    setDetailError("");
    getOrderWorkspaceDetail(visibleId, businessId).then((result) => {
      if (!active) return;
      if (result.success) { setDetail(result.data); loadedId.current = visibleId; } else setDetailError(result.message);
    }).catch(() => { if (active) setDetailError("Could not load the order. Check your connection and try again."); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [visibleId, businessId, detailReload, panelClosed, narrow, mobileOpen]);

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
    // Status comes from the tabs, not this form, so keep the current tab when filtering.
    navigate({ search: values.search?.trim() ?? "", from: values.from ?? "", to: values.to ?? "", source: values.source || "all", fulfillment: values.fulfillment || "all", payment: values.payment || "all", page: 1 });
  }
  function refresh() { setMenu(null); refreshScheduler.current?.request(true, true); }
  function selectRow(row: OrderRow) {
    setDetailFormat({ id: row.id, viewingBranch: filters.branch, currency: data.currency, currencyFormat: data.currencyFormat, timezone: data.timezone });
    setSelectedId(row.id); setPanelClosed(false); setMobileOpen(true);
  }
  function toggleSelected(row: OrderRow) {
    setSelected((items) => items.some((item) => item.id === row.id) ? items.filter((item) => item.id !== row.id) : items.length < 50 ? [...items, { id: row.id, number: row.orderNumber, row }] : items);
  }
  function toggleAll() {
    setSelected((items) => allChecked ? items.filter((item) => !data.rows.some((row) => row.id === item.id)) : [...items, ...data.rows.filter((row) => !items.some((item) => item.id === row.id)).map((row) => ({ id: row.id, number: row.orderNumber, row }))].slice(0, 50));
  }
  function openAction(type: ActionDialog["type"], order: OrderRow) { setMenu(null); setDialog({ type, order }); }
  function actionSuccess(message: string, deletedId?: string) {
    setDialog(null); setNotice(message);
    if (deletedId) { setSelected((items) => items.filter((item) => item.id !== deletedId)); setSelectedId(data.rows.find((row) => row.id !== deletedId)?.id ?? null); setMobileOpen(false); }
    // A status action's revalidatePath already returned the fresh list; refreshing again doubled the page fetch.
    if (dialog?.type !== "status") refresh();
  }
  function bulkDeleted(deleted: string[], failed: number) {
    if (!deleted.length) return;
    setSelected((items) => items.filter((item) => !deleted.includes(item.id)));
    if (visibleId && deleted.includes(visibleId)) { setSelectedId(data.rows.find((row) => !deleted.includes(row.id))?.id ?? null); setMobileOpen(false); }
    setNotice(`${deleted.length} ${deleted.length === 1 ? "order" : "orders"} deleted.${failed ? ` ${failed} could not be deleted and remain selected.` : ""}`);
  }
  const firstShown = data.total === 0 ? 0 : (data.page - 1) * filters.limit + 1;
  const lastShown = Math.min(data.page * filters.limit, data.total);
  const activeFilters = !!(filters.search || filters.from || filters.to || [filters.branch, filters.source, filters.fulfillment, filters.payment, filters.status].some((value) => value !== "all"));
  const filterCount = [filters.from || filters.to, filters.source !== "all", filters.fulfillment !== "all", filters.payment !== "all", filters.branch !== "all"].filter(Boolean).length;
  const detailContent = <DetailPanel onPrint={(id,kind)=>setPrintPreview({id,kind})} detail={detail} loading={detailLoading} error={detailError} currency={detailFormat.currency} currencyFormat={detailFormat.currencyFormat} timezone={detailFormat.timezone} permissions={permissions} businessId={businessId}
    onClose={() => { setPanelClosed(true); setMobileOpen(false); }} onRetry={() => setDetailReload((value) => value + 1)} onAction={openAction} onReturned={refresh} />;

  return <div className={styles.workspace}>
    <header className={styles.header}>
      <div className={styles.hidePhone}><h1>Orders</h1><p>POS, online store{showTableQr ? " and table QR" : ""} orders in one place. Confirm new online orders, track statuses, manage payments, and print receipts.</p></div>
      <div className={styles.headerActions}>
        <span className={styles.liveBadge} data-live={live} title={live ? "Connected: orders update when they change" : "Connecting… use Refresh to load the latest orders"}><span />{live ? "Live" : "Connecting"}</span>
        <button className={styles.button} type="button" onClick={() => void toggleAlerts()} aria-pressed={alertsOn} title="Desktop notification for new online orders">{alertsOn ? <BellRing size={15} /> : <Bell size={15} />}{alertsOn ? "Alerts On" : "Enable Alerts"}</button>
        <button className={styles.button} type="button" onClick={toggleSound} aria-pressed={soundOn} aria-label={soundOn ? "Mute new-order sound" : "Turn on new-order sound"} title={soundOn ? "New-order sound on" : "New-order sound off"}>{soundOn ? <Volume2 size={15} /> : <VolumeX size={15} />}</button>
        <button className={`${styles.button} ${styles.hidePhone}`} type="button" onClick={refresh} disabled={pending}><RefreshCw size={15} className={pending ? styles.spin : ""} />Refresh</button>
        <button className={styles.button} type="button" onClick={() => setQueueOpen(true)} disabled={!selected.length}><Printer size={15} />Print Queue<span className={styles.counter}>{selected.length}</span></button>
        {permissions.create ? <Link className={`${styles.button} ${styles.primary} ${styles.hidePhone}`} href="/dashboard/pos"><Plus size={17} />Create Order</Link>
          : <button type="button" className={`${styles.button} ${styles.primary} ${styles.hidePhone}`} disabled title="POS access is required to create an order."><Plus size={17} />Create Order</button>}
      </div>
    </header>
    {notice && <div className={styles.toast} role="status"><Check size={18} />{notice}<button type="button" aria-label="Dismiss notification" onClick={() => setNotice("")}><X size={15} /></button></div>}
    <div className={styles.workspaceGrid}>
      <div className={styles.mainColumn}>
        <form ref={filterForm} key={JSON.stringify(filters)} onSubmit={applyFilters} className={styles.filters} aria-label="Filter orders">
          <div className={styles.filterTop}>
            <div className={styles.search}><Search size={16} /><input name="search" defaultValue={filters.search} maxLength={120} placeholder="Search by order number, customer name or phone…" aria-label="Search orders" /><button type="submit" aria-label="Apply search"><ChevronRight size={17} /></button></div>
            <button type="button" className={`${styles.filterToggle} ${filterCount ? styles.filterToggleActive : ""}`} aria-expanded={filtersOpen} aria-controls="order-filter-panel" onClick={() => setFiltersOpen((open) => !open)}>
              <SlidersHorizontal size={15} />Filter{filterCount > 0 && <span className={styles.counter}>{filterCount}</span>}
            </button>
          </div>
          {filtersOpen && <button type="button" aria-label="Close filters" className={styles.sheetBackdrop} onClick={() => setFiltersOpen(false)} />}
          <div id="order-filter-panel" className={styles.filterPanel} hidden={!filtersOpen}>
            <button type="button" className={styles.sheetClose} aria-label="Close order filters" onClick={() => setFiltersOpen(false)}><X size={20} /></button>
            <div className={styles.dateRange}><label><span>From</span><input name="from" type="date" defaultValue={filters.from} aria-label="Start date" onChange={() => filterForm.current?.requestSubmit()} /></label><span className={styles.dateDash}>—</span><label><span>To</span><input name="to" type="date" defaultValue={filters.to} aria-label="End date" onChange={() => filterForm.current?.requestSubmit()} /></label></div>
            <select name="source" defaultValue={filters.source} aria-label="Filter by source" onChange={() => filterForm.current?.requestSubmit()}><option value="all">All Sources</option>{Object.entries(sourceLabels).filter(([value]) => value !== 'qr' || showTableQr).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select name="fulfillment" defaultValue={filters.fulfillment} aria-label="Filter by fulfillment" onChange={() => filterForm.current?.requestSubmit()}><option value="all">All Fulfillment Types</option>{Object.entries(fulfillmentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <select name="payment" defaultValue={filters.payment} aria-label="Filter by payment status" onChange={() => filterForm.current?.requestSubmit()}><option value="all">All Payment Statuses</option>{Object.entries(paymentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            {filterCount > 0 && <button type="button" className={styles.textButton} onClick={() => navigate({ source: "all", fulfillment: "all", payment: "all", from: "", to: "", branch: "all", page: 1 })}>Clear filters</button>}
          </div>
        </form>
        <div className={styles.tabsRow}>
          <div className={styles.tabs} aria-label="Order status filters">{statusTabs.map((status) => <button key={status} type="button" disabled={pending} className={filters.status === status ? styles.activeTab : ""} onClick={() => navigate({ status, page: 1 })} aria-pressed={filters.status === status}>{statusLabels[status]} <span>({data.counts[status] ?? 0})</span></button>)}</div>
          {activeFilters && <button className={styles.textButton} type="button" onClick={() => navigate({ search: "", branch: "all", source: "all", fulfillment: "all", payment: "all", status: "all", from: "", to: "", page: 1 })}>Clear filters</button>}
        </div>
        <section className={styles.tableCard} aria-label="Orders list" aria-busy={pending}>
          {selected.length > 0 && <div className={styles.selectionBar} role="toolbar" aria-label="Selected orders"><Check size={14} /><span>{selected.length} selected <small>(up to 50)</small></span><button type="button" onClick={() => setSelected([])}>Clear selection</button>{permissions.delete && <button type="button" className={styles.selectionDelete} onClick={() => setBulkDeleteOpen(true)}><Trash2 size={13} />Delete ({selected.length})</button>}</div>}
          <div className={styles.tableScroll}>
            <table className={styles.table} data-phone-layout="custom">
              <thead><tr>
                <th className={styles.checkColumn}><input type="checkbox" ref={allCheckbox} checked={allChecked} onChange={toggleAll} disabled={!data.rows.length} aria-label="Select all orders on this page" /></th>
                <th>Order ID</th><th>Customer</th><th>Items</th><th>Source</th><th>Payment</th><th>Total</th><th>Status</th>
                <th><button type="button" className={styles.sortButton} onClick={() => navigate({ sort: filters.sort === "newest" ? "oldest" : "newest", page: 1 })} aria-label={`Sort by date, currently ${filters.sort}`}>Date/Time <ArrowUpDown size={12} /></button></th>
                <th>Branch</th><th className={styles.actionColumn}>Actions</th>
              </tr></thead>
              <tbody>{data.rows.map((row) => <tr key={row.id} className={!panelClosed && visibleId === row.id ? styles.selectedRow : ""} onClick={() => selectRow(row)}>
                <td className={styles.checkColumn}><input type="checkbox" checked={selected.some((item) => item.id === row.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggleSelected(row)} aria-label={`Select order ${row.orderNumber}`} /></td>
                <td><button className={styles.orderLink} type="button" onClick={(event) => { event.stopPropagation(); selectRow(row); }}>{row.orderNumber}</button></td>
                <td className={styles.customerCell}><span title={row.customerName}>{row.customerName}</span><small>{row.customerPhone || "No phone"}</small></td>
                <td><Package size={17} className={styles.phoneIcon} />{row.itemCount} {row.itemCount === 1 ? "item" : "items"}</td>
                <td><span className={styles.source}><SourceIcon source={row.source} />{sourceLabels[row.source] || row.source}</span></td>
                <td><Badge value={row.paymentState} payment /></td>
                <td className={styles.total}>{money(row.total, data.currency, data.currencyFormat)}</td>
                <td><Badge value={row.status} />{row.status === "pending" && row.onlineStatus && <small className={styles.subStatus}>{statusLabels[row.onlineStatus] || row.onlineStatus}</small>}</td>
                <td className={styles.dateCell}><CalendarDays size={18} className={styles.phoneIcon} />{dateText(row.createdAt, data.timezone)}<small>{dateText(row.createdAt, data.timezone, true)}</small></td>
                <td className={styles.branchCell} title={row.branchName}><MapPin size={18} className={styles.phoneIcon} />{row.branchName}</td>
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
        {data.branches.length > 1 && <label className={styles.scopeToggle}><input type="checkbox" role="switch" checked={data.receiveAllOnline === true} disabled={scopeBusy} onChange={(event) => void toggleScope(event.target.checked)} />Receive online-order alerts from all branches<span>{data.receiveAllOnline ? "All branches" : "Current branch only"}</span></label>}
      </div>
      {!narrow && <aside className={styles.detailColumn}>{panelClosed || !visibleId ? <div className={styles.detailPlaceholder}><FileText size={32} /><h3>Select an order</h3><p>Review customer details, items, payments, and activity.</p>{panelClosed && visibleId && <button className={styles.button} type="button" onClick={() => setPanelClosed(false)}>Show details</button>}</div> : detailContent}</aside>}
    </div>
    {narrow && mobileOpen && !panelClosed && visibleId && <Modal title="Order details" onClose={() => setMobileOpen(false)} wide drawer>{detailContent}</Modal>}
    {printPreview&&<OrderPrintPreview orderId={printPreview.id} kind={printPreview.kind} onClose={()=>setPrintPreview(null)}/>}
    {menu && <RowMenu onPrint={kind=>{setPrintPreview({id:menu.row.id,kind});setMenu(null);}} menu={menu} permissions={permissions} onClose={() => setMenu(null)} onAction={openAction} onView={() => { selectRow(menu.row); setMenu(null); }} />}
    {bulkDeleteOpen && selected.length > 0 && <BulkDeleteDialog items={selected.map((item) => ({ ...item, row: data.rows.find((row) => row.id === item.id) ?? item.row }))} businessId={businessId} onClose={() => setBulkDeleteOpen(false)} onDeleted={bulkDeleted} />}
    {dialog && <ManageOrderDialog action={dialog} businessId={businessId} permissions={permissions} onClose={() => setDialog(null)} onSuccess={actionSuccess} />}
    {queueOpen && <Modal title={`Print Queue (${selected.length})`} onClose={() => setQueueOpen(false)}>
      <p className={styles.modalHelp}>Choose a receipt or shipping label for each order, review the preview, then print using your saved settings.</p>
      <div className={styles.printQueue}>{selected.map((item) => <div key={item.id}><span>{item.number}</span><OrderPrintMenu orderId={item.id} className={styles.button} onPreview={kind=>setPrintPreview({id:item.id,kind})}/><button className={styles.iconButton} type="button" aria-label={`Remove ${item.number} from print queue`} onClick={() => setSelected((items) => items.filter((entry) => entry.id !== item.id))}><X size={14} /></button></div>)}</div>
      {!selected.length && <p className={styles.modalHelp}>The queue is empty. Select orders using the table checkboxes.</p>}
    </Modal>}
  </div>;
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

function DetailPanel({ detail, loading, error, currency, currencyFormat, timezone, permissions, businessId, onClose, onRetry, onAction, onReturned, onPrint }: {
  onPrint: (id:string,kind:OrderPrintKind)=>void;
  onReturned: () => void;
  detail: OrderDetail | null; loading: boolean; error: string; currency: string; currencyFormat?: CurrencyFormat; timezone: string; permissions: WorkspacePermissions; businessId: string;
  onClose: () => void; onRetry: () => void; onAction: (type: ActionDialog["type"], row: OrderRow) => void;
}) {
  // Pending stays tied to the detail it was started from, so the button cannot be
  // clicked again with a stale version before the revalidated detail arrives.
  const [statusBusyFor,setStatusBusyFor]=useState<OrderDetail|null>(null);
  const statusLock=useRef(false);
  const [statusError,setStatusError]=useState("");
  const statusBusy=statusBusyFor!==null && statusBusyFor===detail;
  if (loading) return <div className={styles.detailCard} aria-busy="true" aria-label="Loading order details"><div className={styles.skeletonTitle} /><div className={styles.skeletonLine} /><div className={styles.skeletonBlock} /><div className={styles.skeletonBlock} /><div className={styles.skeletonLine} /></div>;
  if (error) return <div className={styles.detailCard}><div className={styles.error} role="alert"><AlertCircle size={19} />{error}</div><button className={styles.button} type="button" onClick={onRetry}>Try again</button></div>;
  if (!detail) return <div className={styles.detailPlaceholder}><FileText size={30} /><p>Select an order to view its details.</p></div>;
  const order = detail;
  const initials = order.customerName.split(/\s+/).slice(0, 2).map((name) => name[0]).join("").toUpperCase();
  const nextStatus = permissions.edit ? nextStatuses(order, permissions.cancel)[0] : undefined;
  const paid =Math.max(0, order.amountPaid - order.changeAmount);
  const returnedQuantity = order.items.reduce((total, item) => total + item.returnedQuantity, 0);
  const allReturned = order.items.length > 0 && order.items.every(item => item.returnedQuantity >= item.quantity);
  const canCancelItem = permissions.cancel && ["online","qr"].includes(order.source) && ["new","pending","in_progress"].includes(order.status) && !order.deleteBlocked && !order.discount && !order.couponCode && !order.returnsUnavailable;
  async function advanceStatus() {
    if (!nextStatus || !order.updatedAt || statusBusy || statusLock.current) return;
    statusLock.current = true; setStatusBusyFor(order); setStatusError("");
    try {
      const result = await changeOrderWorkspaceStatus(order.id, order.updatedAt, nextStatus.value, "", businessId);
      // Success: the action's revalidatePath returns the fresh list, whose changed
      // row reloads this detail once. No extra full-page refresh is requested.
      if (!result.success) { setStatusError(result.message); setStatusBusyFor(null); }
    } catch { setStatusError("Refresh the order before trying again."); setStatusBusyFor(null); }
    finally { statusLock.current = false; }
  }
  const canReturn = permissions.refund && !order.returnsUnavailable && ["new", "pending", "in_progress", "completed"].includes(order.status);
  const online = ["online", "qr"].includes(order.source);
  const openOrder = online ? ONLINE_OPEN.includes(order.onlineStatus ?? "new") && !["completed", "cancelled", "refunded"].includes(order.status) : ["new", "pending", "in_progress"].includes(order.status);
  // Paid or refunded POS sales are reversed with Return Items, not cancelled.
  const canCancelOrder = permissions.cancel && openOrder && (online || !order.deleteBlocked);
  const cancelBlockedReason = !permissions.cancel ? "Cancel permission is required." : !openOrder ? "Completed, cancelled and returned orders cannot be cancelled." : "This order has a payment or return. Use Return Items instead.";
  return <section className={`${styles.detailCard} ${styles.od}`} aria-label={`Order ${order.orderNumber} details`}>
    <header className={styles.odHead}>
      <div>
        <h2>Order {order.orderNumber}</h2>
        <div className={styles.odMeta}><Badge value={order.status} />{returnedQuantity > 0 && <span className={`${styles.badge} ${styles.orange}`}>{allReturned ? "Items returned" : "Partially returned"}</span>}<span><CalendarDays size={14} />{dateText(order.createdAt, timezone)} at {dateText(order.createdAt, timezone, true)}</span></div>
      </div>
      <button type="button" className={styles.odClose} onClick={onClose} aria-label="Close order details"><X size={17} /></button>
    </header>

    <div className={styles.odToolbar}>
      <Link className={styles.odTool} href={orderHref(order.id)}><Eye size={17} />View</Link>
      <OrderPrintMenu orderId={order.id} className={styles.odTool} onPreview={kind=>onPrint(order.id,kind)}/>
      {canReturn ? <ReturnItemsForm key={order.id} orderId={order.id} orderNumber={order.orderNumber} triggerClassName={styles.odTool} onReturned={onReturned} currency={currency} items={order.items.map(item => ({ id: item.id, product_name: [item.name, item.variant, ...item.options].filter(Boolean).join(" · "), quantity: item.quantity, unit_price: item.unitPrice, returned_quantity: item.returnedQuantity, image_url: item.imageUrl }))} />
        : <button type="button" className={styles.odTool} disabled title="Returns are not available for this order."><RotateCcw size={17} />Return Items</button>}
      <button type="button" className={styles.odTool} disabled={!permissions.edit} title={!permissions.edit ? "Order update permission is required." : "Edit order details"} onClick={() => onAction("edit", order)}><Pencil size={17} />Edit</button>
      {canCancelOrder
        ? <CancelOrderForm orderId={order.id} orderNumber={order.orderNumber} businessId={businessId} online={online} className={`${styles.odTool} ${styles.odToolDanger}`} onCancelled={() => onReturned()} />
        : <button type="button" className={`${styles.odTool} ${styles.odToolDanger}`} disabled title={cancelBlockedReason}><Ban size={17} />Cancel Order</button>}
    </div>

    {nextStatus && <button type="button" className={styles.odProgress} disabled={statusBusy||!order.updatedAt} onClick={()=>void advanceStatus()}><CheckCircle2 size={22}/>{statusBusy?"Updating…":nextStatus.label}</button>}
    {statusError && <p role="alert" className={styles.error}>{statusError}</p>}
    {["online", "qr"].includes(order.source) && <OnlineOrderActions order={order} permissions={permissions} onChanged={onReturned} />}

    <OdCard icon={<UserRound size={17} />} title="Customer" aside={<div className={styles.odPills}>
      <span data-tone="blue"><SourceIcon source={order.source} />{sourceLabels[order.source] || order.source}</span>
      {order.fulfillment && <span data-tone="green">{order.fulfillment === "delivery" ? <Truck size={13} /> : <Package size={13} />}{fulfillmentLabels[order.fulfillment] || order.fulfillment}</span>}
      <span data-tone="violet"><Store size={13} />{order.branchName}</span>
      {order.tableName && <span data-tone="blue"><QrCode size={13} />{order.tableName}</span>}
    </div>}>
      <div className={styles.odCustomer}>
        <div className={styles.odAvatar}>{initials}</div>
        <div>
          <strong>{order.customerName}</strong>
          {order.customerPhone && <a href={`tel:${order.customerPhone.replace(/[^\d+]/g, "")}`}><Phone size={13} />{order.customerPhone}</a>}
          {order.customerEmail && <a href={`mailto:${order.customerEmail}`}><Mail size={13} />{order.customerEmail}</a>}
          {order.customerAddress && <span><MapPin size={13} />{order.customerAddress}</span>}
          {!order.customerPhone && !order.customerEmail && !order.customerAddress && <small>No contact information</small>}
        </div>
      </div>
      {order.requestedFor && <p className={styles.scheduled}><Clock3 size={13} />Scheduled: {dateText(order.requestedFor, timezone)} · {dateText(order.requestedFor, timezone, true)}</p>}
    </OdCard>

    <OdCard icon={<ShoppingBag size={17} />} title={`Items (${order.items.length})`}>
      <div className={styles.odItems}>{order.items.map((item) => <div key={item.id} className={styles.odItem}>
        <div className={styles.odItemImage}>{item.imageUrl ? <ProductPhoto src={item.imageUrl} alt="" width={104} height={104} sizes="52px" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <Package size={19} />}</div>
        <div className={styles.odItemText}><strong>{item.name}</strong>{item.variant && <small>{item.variant}</small>}{item.options.length > 0 && <small>{item.options.join(", ")}</small>}<small>{money(item.unitPrice, currency, currencyFormat)} × {item.quantity}</small>{item.returnedQuantity > 0 && <small className={styles.odReturned}>Returned: {item.returnedQuantity}</small>}{canCancelItem && <CancelOrderItem orderId={order.id} itemId={item.id} name={item.name} updatedAt={order.updatedAt} businessId={businessId} onCancelled={onReturned}/>}</div>
        <span className={styles.odItemTotal}>{money(item.subtotal, currency, currencyFormat)}</span>
      </div>)}</div>
    </OdCard>

    <OdCard icon={<ReceiptText size={17} />} title="Summary">
      <dl className={styles.odSummary}>
        <div><dt>Subtotal</dt><dd>{money(order.subtotal, currency, currencyFormat)}</dd></div>
        <div><dt>Discount{order.couponCode ? ` · ${order.couponCode}` : ""}</dt><dd>−{money(order.discount, currency, currencyFormat)}</dd></div>
        <div><dt>Delivery fee</dt><dd>{money(order.deliveryFee, currency, currencyFormat)}</dd></div>
        <div className={styles.odTotal}><dt>Total</dt><dd>{money(order.total, currency, currencyFormat)}</dd></div>
      </dl>
    </OdCard>

    <OdCard icon={<CreditCard size={17} />} title="Payment" aside={<Badge value={order.paymentReviewNeeded ? 'Needs review' : order.paymentState} payment />}>
      <p className={styles.odMethod}><CreditCard size={16} />{methodLabel(order.paymentMethod)}{order.paymentReference && !order.paymentReference.startsWith("proof:") && <small>Ref: {order.paymentReference}</small>}</p>
      <div className={styles.odTiles}>
        <div data-tone="green"><Wallet size={20} /><div><small>Amount paid</small><strong>{money(paid, currency, currencyFormat)}</strong></div></div>
        <div data-tone="orange"><Coins size={20} /><div><small>Balance due</small><strong>{order.remainingBalance == null ? 'Unavailable' : money(order.remainingBalance, currency, currencyFormat)}</strong></div></div>
      </div>
      {order.changeAmount > 0 && <p className={styles.paymentExtra}>Change given <span>{money(order.changeAmount, currency, currencyFormat)}</span></p>}
    </OdCard>

    <OdCard icon={<FileText size={17} />} title="Notes" aside={permissions.edit ? <button className={styles.odLink} type="button" onClick={() => onAction("edit", order)}><Pencil size={13} />Edit</button> : null}>
      <p className={styles.odNote}>{order.note || "No special notes for this order."}</p>
    </OdCard>

    <OdCard icon={<Clock3 size={17} />} title="Order Timeline">
      <ol className={styles.odTimeline}>{order.activity.map((activity) => <li key={activity.id}><strong>{activity.description}</strong><small>{dateText(activity.createdAt, timezone)} · {dateText(activity.createdAt, timezone, true)}</small></li>)}</ol>
      {order.activityUnavailable && <p className={styles.warningText}>Additional activity could not be loaded.</p>}
    </OdCard>
  </section>;
}

function OdCard({ icon, title, aside, children }: { icon: ReactNode; title: string; aside?: ReactNode; children: ReactNode }) {
  return <section className={styles.odCard}><div className={styles.odCardHead}><h3>{icon}{title}</h3>{aside}</div>{children}</section>;
}

const ONLINE_OPEN = ["new", "accepted", "preparing", "ready"];

function OnlineOrderActions({ order, permissions, onChanged }: { order: OrderDetail; permissions: WorkspacePermissions; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [showProof, setShowProof] = useState(false);
  const [error, setError] = useState("");
  const khqr = order.paymentMethod === "khqr" && !["cancelled", "refunded"].includes(order.status);
  const paymentStatus = order.paymentStatus ?? "unpaid";
  const hasProof = order.paymentReference?.startsWith("proof:");
  async function run(task: () => Promise<{ success: boolean; message: string }>) {
    setBusy(true); setError("");
    try {
      const result = await task();
      if (result.success) { toast.success(result.message); onChanged(); } else setError(result.message);
    } catch { setError("The result could not be confirmed. Refresh the order before trying again."); }
    finally { setBusy(false); }
  }
  // Rejecting an online order is the panel's Cancel Order button.
  if (!khqr && !hasProof) return null;
  return <section className={styles.odCard}>
    <div className={styles.odCardHead}><h3><CreditCard size={17} />Online payment</h3></div>
    {khqr && <div className={styles.onlinePayment}>
      <span>KHQR payment: <Badge value={paymentStatus === "pending_verification" ? "pending_verification" : paymentStatus === "paid" ? "paid" : "unpaid"} payment /></span>
      {hasProof && <button type="button" className={styles.miniButton} onClick={() => setShowProof(true)}><ExternalLink size={13} />View payment proof</button>}
      {permissions.edit && <div className={styles.onlineButtons}>
        {paymentStatus !== "paid" && <button type="button" className={styles.miniButton} disabled={busy} onClick={() => void run(() => updateOnlinePaymentStatus(order.id, "paid"))}><Check size={13} />Mark paid</button>}
        {paymentStatus !== "unpaid" && <button type="button" className={styles.miniButton} disabled={busy} onClick={() => void run(() => updateOnlinePaymentStatus(order.id, "unpaid"))}><X size={13} />Mark unpaid</button>}
      </div>}
    </div>}
    {!khqr && hasProof && <button type="button" className={styles.miniButton} onClick={() => setShowProof(true)}><ExternalLink size={13} />View payment proof</button>}
    {showProof && <Modal title={`Payment proof · ${order.orderNumber}`} onClose={() => setShowProof(false)} wide><img src={`/api/online-orders/${order.id}/proof`} alt={`Payment proof for order ${order.orderNumber}`} className={styles.proofImage} /></Modal>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </section>;
}

function RowMenu({ menu, permissions, onClose, onAction, onView, onPrint }: {
  onPrint:(kind:OrderPrintKind)=>void;
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
    <button role="menuitem" type="button" onClick={()=>onPrint("shipping-label")}><Printer size={15} />Print shipping label</button>
    <button role="menuitem" type="button" onClick={()=>onPrint("receipt")}><Printer size={15} />Print receipt</button>
    <button role="menuitem" type="button" disabled={!permissions.edit || !nextStatuses(menu.row, permissions.cancel).length} onClick={() => onAction("status", menu.row)}><ArrowUpDown size={15} />Change status</button>
    <button role="menuitem" type="button" disabled={!permissions.edit} onClick={() => onAction("edit", menu.row)}><Pencil size={15} />Edit</button>
    <div className={styles.menuDivider} />
    <button role="menuitem" type="button" className={styles.dangerText} disabled={!permissions.delete || !!blocked} title={blocked || (!permissions.delete ? "Delete permission required." : "Delete order")} onClick={() => onAction("delete", menu.row)}><Trash2 size={15} />Delete</button>
  </div>, document.body);
}

function Modal({ title, onClose, children, busy = false, wide = false, drawer = false }: { title: string; onClose: () => void; children: ReactNode; busy?: boolean; wide?: boolean; drawer?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); if (prior?.isConnected) prior.focus(); };
  }, []);
  return createPortal(<dialog ref={ref} className={`${styles.modal} ${wide ? styles.wideModal : ""} ${drawer ? styles.drawer : ""}`} aria-label={title} onCancel={(event) => { event.preventDefault(); if (!busy) closeRef.current(); }} onClick={(event) => { const element = ref.current; if (!busy && element && event.target === element) { const rect = element.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeRef.current(); } }}>
    <div className={styles.modalHeader}><h2>{title}</h2><button className={styles.iconButton} type="button" onClick={onClose} disabled={busy} aria-label="Close dialog"><X size={18} /></button></div>
    <div className={styles.modalBody}>{children}</div>
  </dialog>, document.body);
}

function BulkDeleteDialog({ items, businessId, onClose, onDeleted }: { items: QueueItem[]; businessId: string; onClose: () => void; onDeleted: (deleted: string[], failed: number) => void }) {
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [failures, setFailures] = useState<{ number: string; message: string }[]>([]);
  const lock = useRef(false);
  const eligible = items.filter((item) => !deleteReason(item.row));
  const blocked = items.filter((item) => deleteReason(item.row));
  const phrase = `DELETE ${eligible.length}`;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !eligible.length || confirm.trim() !== phrase || !reason.trim()) return;
    lock.current = true; setSaving(true); setError(""); setFailures([]);
    try {
      const result = await deleteOrderWorkspaceOrders(eligible.map((item) => ({ id: item.id, updatedAt: item.row.updatedAt })), reason, businessId);
      if (!result.success) { setError(result.message); return; }
      const numbers = new Map(items.map((item) => [item.id, item.number]));
      setFailures(result.data.failed.map((failure) => ({ number: numbers.get(failure.id) ?? failure.id, message: failure.message })));
      onDeleted(result.data.deleted, result.data.failed.length);
      setConfirm("");
      if (!result.data.failed.length && !blocked.length) onClose();
    } catch { setError("The result could not be confirmed. Refresh the list before retrying; some orders may already be deleted."); }
    finally { lock.current = false; setSaving(false); }
  }
  return <Modal title={`Delete ${items.length} selected ${items.length === 1 ? "order" : "orders"}`} onClose={onClose} busy={saving}>
    <form onSubmit={submit}>
      {error && <div role="alert" className={styles.error}><AlertCircle size={18} /><div>{error}</div></div>}
      {failures.length > 0 && <div role="alert" className={styles.error}><AlertCircle size={18} /><div><strong>{failures.length} not deleted (still selected):</strong><ul>{failures.map((failure) => <li key={failure.number}>{failure.number}: {failure.message}</li>)}</ul></div></div>}
      <p className={styles.modalHelp}>Only the orders listed here are submitted. Each one uses the single-order delete checks: unpaid orders are cancelled with the existing stock-restoration procedure first; transactions, items and audit history stay stored.</p>
      {eligible.length > 0 && <div className={styles.modalOrder}><strong>Will delete ({eligible.length})</strong><span>{eligible.map((item) => item.number).join(", ")}</span></div>}
      {blocked.length > 0 && <div className={styles.warning}><ShieldCheck size={18} /><div><strong>Skipped ({blocked.length}), not eligible:</strong><ul>{blocked.map((item) => <li key={item.id}>{item.number}: {deleteReason(item.row)}</li>)}</ul></div></div>}
      {eligible.length > 0 && <>
        <label className={styles.fieldLabel}>Deletion reason<textarea required value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} disabled={saving} placeholder="Why are these orders being removed?" /></label>
        <label className={styles.fieldLabel}>Type <strong>{phrase}</strong> to confirm<input required value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="off" disabled={saving} /></label>
      </>}
      <div className={styles.modalFooter}><button type="button" className={styles.button} onClick={onClose} disabled={saving}>{eligible.length ? "Cancel" : "Close"}</button>{eligible.length > 0 && <button type="submit" className={`${styles.button} ${styles.dangerButton}`} disabled={saving || confirm.trim() !== phrase || !reason.trim()}>{saving ? <Loader2 size={16} className={styles.spin} /> : <Trash2 size={15} />}{saving ? "Deleting…" : `Delete ${eligible.length}`}</button>}</div>
    </form>
  </Modal>;
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
  const contactEditable = !!order && !order.customerId && ["new", "pending", "in_progress"].includes(order.status);
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
          <p className={styles.modalHelp}>Next status: <strong>{options[0]?.label || "Unavailable"}</strong>. This does not collect or refund payment.</p>
          {!options.length && <div className={styles.info}><ShieldCheck size={18} />This order has no available status changes. Completed, cancelled, and refunded orders cannot be reopened here.</div>}
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
