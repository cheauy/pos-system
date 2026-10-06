"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cancelReturn } from "./actions";
import {
  ArrowRightLeft,
  BarChart3,
  Clock3,
  DollarSign,
  PackageOpen,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
  XCircle,
} from "lucide-react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export type ReturnWorkspaceRecord = {
  id: string;
  returnNumber: string;
  orderId: string;
  orderNumber: string;
  paymentMethod: string | null;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  reason: string;
  refundAmount: number;
  createdAt: string;
  status: "pending" | "approved" | "refunded" | "exchanged" | "rejected" | "cancelled";
  cancelledAt: string | null;
  cancelReason: string | null;
  returnType: "refund" | "exchange";
  source: "system" | "import";
  refundMethod: string | null;
  restockStatus: string | null;
  items: {
    id: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }[];
};

type Props = {
  initialRecords: ReturnWorkspaceRecord[];
  completedOrderCount: number;
  accentColor: string;
  canManage: boolean;
  canCancel: boolean;
};

const PAGE_SIZE = 15;
const pieColors = ["#2563eb", "#60a5fa", "#8b5cf6", "#f97316", "#ef4444", "#94a3b8"];

export default function ReturnsWorkspace({ initialRecords, completedOrderCount, accentColor, canCancel }: Props) {
  const records = initialRecords;
  const activeRecords = useMemo(() => records.filter((record) => record.status !== "cancelled"), [records]);
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(initialRecords[0]?.id ?? null);
  const [message, setMessage] = useState<string | null>(null);
  // Phones: detail and stats open as full-screen sheets.
  const [sheet, setSheet] = useState<"detail" | "stats" | "filter" | null>(null);
  useEffect(() => {
    if (!sheet) return;
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setSheet(null); };
    const wide = window.matchMedia("(min-width: 640px)"); const onWide = () => { if (wide.matches) setSheet(null); };
    window.addEventListener("keydown", onKey); wide.addEventListener("change", onWide);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", onKey); wide.removeEventListener("change", onWide); };
  }, [sheet]);
  const sheetClose = (label: string) => <button type="button" aria-label={label} onClick={() => setSheet(null)} className="absolute right-3 top-3 z-10 grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-700 sm:hidden"><X size={20} /></button>;

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59.999`) : null;

    return records.filter((record) => {
      const created = new Date(record.createdAt);
      return (
        (!normalized || [record.returnNumber, record.orderNumber, record.customerName, record.reason, ...record.items.map((item) => item.productName)].some((value) => value.toLowerCase().includes(normalized))) &&
        (!from || created >= from) &&
        (!to || created <= to)
      );
    });
  }, [records, query, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRecords = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const selected = records.find((record) => record.id === selectedId) ?? null;

  const totalRefunded = activeRecords.reduce((sum, record) => sum + record.refundAmount, 0);
  const pendingCount = activeRecords.filter((record) => record.status === "pending").length;
  const exchangeCount = activeRecords.filter((record) => record.returnType === "exchange").length;
  const returnedOrderCount = new Set(activeRecords.map((record) => record.orderId)).size;
  const returnRate = completedOrderCount > 0 ? (returnedOrderCount / completedOrderCount) * 100 : 0;

  const reasonData = useMemo(() => {
    const counts = new Map<string, number>();
    activeRecords.forEach((record) => counts.set(record.reason, (counts.get(record.reason) ?? 0) + 1));
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = ranked.slice(0, 5).map(([name, value]) => ({ name, value }));
    const rest = ranked.slice(5).reduce((sum, [, value]) => sum + value, 0);
    if (rest) top.push({ name: "Other", value: rest });
    return top;
  }, [activeRecords]);

  const productData = useMemo(() => {
    const counts = new Map<string, number>();
    activeRecords.forEach((record) => record.items.forEach((item) => counts.set(item.productName, (counts.get(item.productName) ?? 0) + item.quantity)));
    return [...counts.entries()]
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
  }, [activeRecords]);

  function resetPage() {
    setPage(1);
  }

  return (
    <main className="space-y-4 pb-8">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Returns</h1>
          <p className="mt-1 hidden text-sm text-slate-500 sm:block">Track customer returns, exchanges, refund activity, and return trends.</p>
        </div>
      </div>

      {message && (
        <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <span>{message}</span><button onClick={() => setMessage(null)}><X size={16} /></button>
        </div>
      )}

      <div className="hidden gap-3 sm:grid sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={<PackageOpen size={20} />} label="Total Returns" value={String(activeRecords.length)} helper="Recorded returns, excluding cancelled" />
        <MetricCard icon={<DollarSign size={20} />} label="Total Refunded" value={formatCurrency(totalRefunded)} helper="Recorded refund value" />
        <MetricCard icon={<Clock3 size={20} />} label="Pending Review" value={String(pendingCount)} helper="Awaiting review" />
        <MetricCard icon={<ArrowRightLeft size={20} />} label="Exchanges" value={String(exchangeCount)} helper="Exchange-type returns" />
        <MetricCard icon={<RefreshCw size={20} />} label="Return Rate" value={`${returnRate.toFixed(1)}%`} helper={`${returnedOrderCount} returned orders`} />
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 space-y-4">
          <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-1 md:grid-cols-[minmax(220px,1fr)_160px_160px]">
            <label className="relative">
              <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => { setQuery(event.target.value); resetPage(); }} placeholder="Search returns, customers, orders…" className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-blue-400 max-sm:pr-11" />
              <button type="button" aria-label="Open filters" onClick={() => setSheet("filter")} className="absolute right-1 top-1/2 grid h-8 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 sm:hidden"><SlidersHorizontal size={17} /></button>
            </label>
            {/* Phones: date range opens as a bottom sheet. */}
            {sheet === "filter" && <button type="button" aria-label="Close filters" onClick={() => setSheet(null)} className="fixed inset-0 z-40 bg-slate-950/40 sm:hidden" />}
            <div role={sheet === "filter" ? "dialog" : undefined} aria-modal={sheet === "filter" || undefined} aria-label="Return filters" data-sheet="bottom" className={`${sheet === "filter" ? "fixed inset-x-0 bottom-0 z-50 grid gap-3 rounded-t-3xl bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl" : "max-sm:hidden"} sm:contents`}>
            {sheet === "filter" && <div className="sm:hidden"><div className="mx-auto h-1.5 w-12 rounded-full bg-slate-200" /><div className="mt-4 flex items-center justify-between"><h2 className="text-xl font-bold text-slate-900">Filter Returns</h2><button type="button" aria-label="Close filters" onClick={() => setSheet(null)} className="grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-600"><X size={20} /></button></div></div>}
            <input type="date" aria-label="From date" value={fromDate} onChange={(event) => { setFromDate(event.target.value); resetPage(); }} className="h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-700" />
            <input type="date" aria-label="To date" value={toDate} onChange={(event) => { setToDate(event.target.value); resetPage(); }} className="h-10 rounded-xl border border-slate-200 px-3 text-sm text-slate-700" />
            {sheet === "filter" && <button type="button" onClick={() => setSheet(null)} className="min-h-12 rounded-xl bg-blue-600 font-semibold text-white sm:hidden">Apply</button>}
            </div>
          </div>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div><h2 className="font-bold text-slate-900">Return Records</h2><p className="text-xs text-slate-500">{filtered.length} matching returns</p></div>
            </div>
            {pageRecords.length === 0 ? (
              <div className="p-14 text-center text-sm text-slate-500"><RotateCcw className="mx-auto mb-3 text-slate-300" size={38} />No return records match these filters.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 text-left">Return ID</th><th className="px-4 py-3 text-left">Customer</th><th className="px-4 py-3 text-left">Order</th><th className="px-4 py-3 text-left">Items</th><th className="px-4 py-3 text-left">Type</th><th className="px-4 py-3 text-left">Reason</th><th className="px-4 py-3 text-right">Refund</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Date</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {pageRecords.map((record) => (
                      <tr key={record.id} onClick={() => { setSelectedId(record.id); setSheet("detail"); }} className={`cursor-pointer transition hover:bg-slate-50 ${selectedId === record.id ? "bg-blue-50/70" : ""}`}>
                        <td className="px-4 py-3 font-bold text-blue-600">{record.returnNumber}</td><td className="px-4 py-3 font-medium text-slate-800">{record.customerName}</td><td className="px-4 py-3 text-blue-600">{record.orderNumber}</td><td className="px-4 py-3"><div className="max-w-[190px] truncate font-medium text-slate-800">{record.items[0]?.productName ?? "—"}</div><div className="text-xs text-slate-400">{record.items.reduce((sum, item) => sum + item.quantity, 0)} item(s)</div></td><td className="px-4 py-3 capitalize text-slate-600">{record.returnType}</td><td className="max-w-[170px] truncate px-4 py-3 text-slate-600">{record.reason}</td><td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(record.refundAmount)}</td><td className="px-4 py-3"><StatusBadge status={record.status} /></td><td className="px-4 py-3 text-slate-500">{formatDate(record.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm text-slate-500">
              <span>Showing {pageRecords.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
              <div className="flex gap-2"><button disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Previous</button><span className="rounded-lg bg-slate-100 px-3 py-1.5 font-semibold text-slate-700">{safePage} / {totalPages}</span><button disabled={safePage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Next</button></div>
            </div>
          </section>

          <div role={sheet === "stats" ? "dialog" : undefined} aria-modal={sheet === "stats" || undefined} aria-label="Return stats" className={`${sheet === "stats" ? "fixed inset-0 z-50 grid content-start overflow-y-auto overscroll-contain bg-slate-100 p-3 pt-16" : "hidden"} gap-4 sm:static sm:z-auto sm:grid sm:overflow-visible sm:bg-transparent sm:p-0 lg:grid-cols-2`}>
            {sheet === "stats" && sheetClose("Close return stats")}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-bold text-slate-900">Return Reasons Breakdown</h2><p className="mt-1 text-xs text-slate-500">Why customers are returning products</p>
              <div className="mt-4 grid items-center gap-3 sm:grid-cols-[210px_1fr]">
                <div className="h-52"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={reasonData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={82} paddingAngle={2}>{reasonData.map((item, index) => <Cell key={item.name} fill={pieColors[index % pieColors.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>
                <div className="space-y-2">{reasonData.map((item, index) => <div key={item.name} className="flex items-center justify-between gap-3 text-sm"><span className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: pieColors[index % pieColors.length] }} /><span className="truncate text-slate-600">{item.name}</span></span><span className="font-semibold text-slate-900">{item.value}</span></div>)}</div>
              </div>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-bold text-slate-900">Most Returned Products</h2><p className="mt-1 text-xs text-slate-500">Products with the highest returned quantity</p>
              <div className="mt-5 space-y-4">{productData.length === 0 ? <div className="py-12 text-center text-sm text-slate-400">No returned product data yet.</div> : productData.map((product) => { const max = productData[0]?.quantity || 1; return <div key={product.name}><div className="mb-1.5 flex items-center justify-between text-sm"><span className="truncate font-medium text-slate-700">{product.name}</span><span className="font-bold text-slate-900">{product.quantity}</span></div><div className="h-2 rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${Math.max(6, (product.quantity / max) * 100)}%`, backgroundColor: accentColor }} /></div></div>; })}</div>
            </section>
          </div>
        </section>

        {sheet === "detail" && <button type="button" aria-label="Close return details" onClick={() => setSheet(null)} className="fixed inset-0 z-40 bg-slate-950/40 sm:hidden" />}
        <aside role={sheet === "detail" ? "dialog" : undefined} aria-modal={sheet === "detail" || undefined} aria-label="Return details" data-sheet="right" className={`${sheet === "detail" ? "fixed inset-y-0 right-0 z-50 w-[88%] max-w-sm overflow-y-auto overscroll-contain pt-12 shadow-2xl" : "hidden"} rounded-none border border-slate-200 bg-white shadow-sm sm:static sm:h-fit sm:block sm:rounded-2xl sm:pt-0 2xl:sticky 2xl:top-4`}>
          {sheet === "detail" && sheetClose("Close return details")}
          {!selected ? <div className="p-10 text-center text-sm text-slate-400">Select a return to view details.</div> : <ReturnDetail key={selected.id} record={selected} accentColor={accentColor} canCancel={canCancel} />}
        </aside>
      </div>
      {!sheet && <button type="button" onClick={() => setSheet("stats")} className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-full bg-blue-600 px-5 font-semibold text-white shadow-lg sm:hidden"><BarChart3 size={18} />Stats</button>}
    </main>
  );
}

function ReturnDetail({ record, accentColor, canCancel }: { record: ReturnWorkspaceRecord; accentColor: string; canCancel: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ success: boolean; message: string } | null>(null);

  async function submitCancel() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await cancelReturn(record.id, reason);
      setNotice(result);
      if (result.success) {
        setConfirming(false);
        router.refresh();
      }
    } catch {
      setNotice({ success: false, message: "The cancellation result could not be confirmed. Refresh before trying again." });
    } finally {
      setBusy(false);
    }
  }

  return <div>
    <div className="border-b border-slate-200 p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-bold text-slate-900">Return #{record.returnNumber}</h2><StatusBadge status={record.status} /></div><p className="mt-1 text-xs text-slate-500">{formatDateTime(record.createdAt)}{record.source === "import" ? " · Imported history" : ""}</p></div>
    <div className="space-y-5 p-5">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Returned item</p><p className="mt-1 font-bold text-slate-900">{record.items[0]?.productName ?? "Return record"}</p><p className="mt-1 text-sm text-slate-500">{record.items.reduce((sum, item) => sum + item.quantity, 0)} item(s) · {formatCurrency(record.refundAmount)}</p></div>
      <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Customer information</p><p className="mt-2 font-bold text-slate-900">{record.customerName}</p>{record.customerEmail && <p className="text-sm text-slate-500">{record.customerEmail}</p>}{record.customerPhone && <p className="text-sm text-slate-500">{record.customerPhone}</p>}</div>
      <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-sm"><dt className="text-slate-400">Order Number</dt><dd className="font-semibold text-blue-600">{record.orderNumber}</dd><dt className="text-slate-400">Return Reason</dt><dd className="text-slate-700">{record.reason}</dd><dt className="text-slate-400">Return Type</dt><dd className="capitalize text-slate-700">{record.returnType}</dd><dt className="text-slate-400">Refund Method</dt><dd className="text-slate-700">{formatLabel(record.refundMethod ?? record.paymentMethod ?? "—")}</dd><dt className="text-slate-400">Restock Status</dt><dd className="text-slate-700">{formatLabel(record.restockStatus ?? "Completed")}</dd></dl>
      <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Timeline</p><div className="mt-3 space-y-3"><TimelineDot color={accentColor} title="Return created" subtitle={formatDateTime(record.createdAt)} /><TimelineDot color={record.status === "rejected" ? "#ef4444" : accentColor} title={formatLabel(record.status)} subtitle={record.status === "pending" ? "Awaiting review" : "Current return status"} /></div></div>
      {record.status === "cancelled" && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600"><p className="font-semibold text-slate-800">Cancelled{record.cancelledAt ? ` · ${formatDateTime(record.cancelledAt)}` : ""}</p>{record.cancelReason && <p className="mt-1">{record.cancelReason}</p>}</div>}
      {notice && <p role={notice.success ? "status" : "alert"} className={`rounded-xl px-3 py-2 text-sm ${notice.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{notice.message}</p>}
      {canCancel && record.status !== "cancelled" && (confirming ? <div className="space-y-3 rounded-xl border border-red-200 bg-red-50/60 p-3">
        <p className="text-sm font-semibold text-red-800">Cancel return {record.returnNumber}?</p>
        <p className="text-xs leading-5 text-red-700">{record.source === "import" ? "This imported record is marked as cancelled. Stock and cash are not affected." : "The returned items are taken back out of stock, the order total is restored, and any cash refund is added back to the open register."}</p>
        <label className="block text-xs font-semibold text-slate-700">Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={500} placeholder="Why is this return being cancelled?" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400" /></label>
        <div className="flex gap-2"><button type="button" disabled={busy} onClick={() => { setConfirming(false); setNotice(null); }} className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700">Keep return</button><button type="button" disabled={busy || reason.trim().length < 3} onClick={submitCancel} className="flex-1 rounded-xl bg-red-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">{busy ? "Cancelling…" : "Confirm cancel"}</button></div>
      </div> : <button type="button" onClick={() => { setConfirming(true); setNotice(null); }} className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50"><XCircle size={16} /> Cancel Return</button>)}
    </div>
  </div>;
}

function TimelineDot({ color, title, subtitle }: { color: string; title: string; subtitle: string }) { return <div className="flex gap-3"><span className="mt-1 h-3 w-3 rounded-full border-2 border-white shadow ring-1 ring-slate-200" style={{ backgroundColor: color }} /><div><p className="text-sm font-semibold text-slate-800">{title}</p><p className="text-xs text-slate-400">{subtitle}</p></div></div>; }
function MetricCard({ icon, label, value, helper }: { icon: React.ReactNode; label: string; value: string; helper: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><div className="rounded-xl bg-blue-50 p-2 text-blue-600">{icon}</div><div><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-0.5 text-2xl font-bold text-slate-950">{value}</p></div></div><p className="mt-2 text-xs text-slate-400">{helper}</p></div>; }
function StatusBadge({ status }: { status: ReturnWorkspaceRecord["status"] }) { const classes = status === "cancelled" ? "bg-slate-100 text-slate-600" : status === "pending" ? "bg-amber-50 text-amber-700" : status === "rejected" ? "bg-red-50 text-red-700" : status === "exchanged" ? "bg-violet-50 text-violet-700" : status === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"; return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${classes}`}>{status}</span>; }

function formatCurrency(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function formatLabel(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
