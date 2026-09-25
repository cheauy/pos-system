"use client";

import Link from "next/link";
import {
  BadgeDollarSign,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Download,
  Eye,
  FileText,
  Link2,
  Search,
  Store,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import BusinessChangePaymentReview from "@/components/super-admin/business-change-payment-review";

export type ManualPaymentViewRow = {
  creditPurchase?: boolean;
  id: string;
  businessId: string;
  businessName: string;
  customerName: string;
  customerEmail: string;
  status: "waiting" | "approved" | "rejected";
  changeUrl: boolean;
  changeBusinessMode: boolean;
  oldUrl: string;
  requestedUrl: string;
  oldBusinessType: string;
  requestedBusinessType: string;
  unitPrice: number;
  amount: number;
  currency: string;
  paymentProvider: string;
  paymentReference: string;
  paymentNote: string;
  proofAvailable: boolean;
  proofUrl: string | null;
  proofFileName: string | null;
  proofMimeType: string | null;
  proofSizeBytes: number | null;
  proofUploadedAt: string | null;
  submittedAt: string;
  createdAt: string;
  reviewedAt: string | null;
  reviewedByEmail: string | null;
  reviewNote: string | null;
};

type StatusFilter = "all" | "waiting" | "approved" | "rejected";
type TypeFilter = "all" | "url" | "mode" | "both";
type DateFilter = "7" | "30" | "90" | "all";

const PAGE_SIZE = 10;
const DISPLAY_TIME_ZONE = "Asia/Phnom_Penh";

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: DISPLAY_TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: DISPLAY_TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
});

const shortTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: DISPLAY_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function formatMoney(value: number, currency: string) {
  return currency === "USD"
    ? `$${value.toFixed(2)}`
    : `${value.toFixed(2)} ${currency}`;
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return dateTimeFormatter.format(date);
}

function shortDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "—", time: "" };

  return {
    date: shortDateFormatter.format(date),
    time: shortTimeFormatter.format(date),
  };
}

function requestType(row: ManualPaymentViewRow) {
  if (row.changeUrl && row.changeBusinessMode) return "Store URL + mode";
  if (row.changeUrl) return "Store URL change";
  return "Business mode switch";
}

function requestSubtext(row: ManualPaymentViewRow) {
  if(row.creditPurchase)return `${Number(row.changeUrl)+Number(row.changeBusinessMode)} permanent change credit(s) · Apply later`;
  if (row.changeUrl && row.changeBusinessMode) {
    return `${row.requestedUrl} · ${row.requestedBusinessType}`;
  }
  if (row.changeUrl) return row.requestedUrl;
  return `${row.oldBusinessType} → ${row.requestedBusinessType}`;
}

function initials(row: ManualPaymentViewRow) {
  const source = row.businessName.trim() || row.customerName.trim() || "B";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function statusStyles(status: ManualPaymentViewRow["status"]) {
  if (status === "waiting") {
    return {
      label: "Waiting review",
      pill: "bg-amber-50 text-amber-700 ring-amber-100",
      dot: "bg-amber-500",
    };
  }
  if (status === "approved") {
    return {
      label: "Approved",
      pill: "bg-emerald-50 text-emerald-700 ring-emerald-100",
      dot: "bg-emerald-500",
    };
  }
  return {
    label: "Rejected",
    pill: "bg-red-50 text-red-700 ring-red-100",
    dot: "bg-red-500",
  };
}

function rowMatchesType(row: ManualPaymentViewRow, filter: TypeFilter) {
  if (filter === "all") return true;
  if (filter === "both") return row.changeUrl && row.changeBusinessMode;
  if (filter === "url") return row.changeUrl && !row.changeBusinessMode;
  return row.changeBusinessMode && !row.changeUrl;
}

function rowMatchesDate(
  row: ManualPaymentViewRow,
  filter: DateFilter,
  referenceNow: number,
) {
  if (filter === "all") return true;
  const date = new Date(row.submittedAt);
  if (Number.isNaN(date.getTime())) return false;
  const cutoff = referenceNow - Number(filter) * 24 * 60 * 60 * 1000;
  return date.getTime() >= cutoff;
}

export default function ManualPaymentApprovalDashboard({
  rows,
  referenceNow,
}: {
  rows: ManualPaymentViewRow[];
  referenceNow: number;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("30");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const detailsPanelRef = useRef<HTMLDivElement | null>(null);

  const counts = useMemo(() => {
    const waiting = rows.filter((row) => row.status === "waiting").length;
    const approved = rows.filter((row) => row.status === "approved").length;
    const rejected = rows.filter((row) => row.status === "rejected").length;
    const approvedRevenue = rows
      .filter((row) => row.status === "approved")
      .reduce((sum, row) => sum + row.amount, 0);

    return {
      waiting,
      approved,
      rejected,
      total: rows.length,
      approvedRevenue,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!rowMatchesType(row, typeFilter)) return false;
      if (!rowMatchesDate(row, dateFilter, referenceNow)) return false;

      if (!normalizedSearch) return true;

      const haystack = [
        row.id,
        row.businessName,
        row.customerName,
        row.customerEmail,
        row.paymentReference,
        row.paymentNote,
        row.proofFileName ?? "",
        row.oldUrl,
        row.requestedUrl,
        row.oldBusinessType,
        row.requestedBusinessType,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [rows, statusFilter, typeFilter, dateFilter, search, referenceNow]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const selected = selectedId
    ? rows.find((row) => row.id === selectedId) ?? null
    : null;

  useEffect(() => {
    if (!selectedId) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedId(null);
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      if (detailsPanelRef.current?.contains(target)) return;

      if (target instanceof Element && target.closest("[data-payment-view-toggle]")) {
        return;
      }

      setSelectedId(null);
    };

    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [selectedId]);

  function toggleDetails(rowId: string) {
    setSelectedId((current) => (current === rowId ? null : rowId));
  }

  function changeStatus(next: StatusFilter) {
    setStatusFilter(next);
    setPage(1);
  }

  function exportCsv() {
    const header = [
      "Business",
      "Customer",
      "Email",
      "Request",
      "Amount",
      "Currency",
      "Status",
      "Payment provider",
      "Payment reference",
      "Customer note",
      "Proof file",
      "Submitted",
      "Reviewed",
      "Review note",
    ];

    const csvRows = filtered.map((row) => [
      row.businessName,
      row.customerName,
      row.customerEmail,
      requestType(row),
      row.amount.toFixed(2),
      row.currency,
      row.status,
      row.paymentProvider,
      row.paymentReference,
      row.paymentNote,
      row.proofFileName ?? "",
      row.submittedAt,
      row.reviewedAt ?? "",
      row.reviewNote ?? "",
    ]);

    const csv = [header, ...csvRows]
      .map((cells) =>
        cells
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tenh-pos-manual-payments-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="w-full">
      <div className="w-full">
        <div className="mb-3 flex items-center justify-between gap-3">
          <Link
            href="/super-admin/businesses"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 transition hover:text-blue-600"
          >
            <ChevronLeft size={15} />
            Back to Businesses
          </Link>
        </div>

        <section className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
              <FileText size={21} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-950">
                Business changes
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Review customer-submitted payments for Store URL and Business Mode changes.
              </p>
            </div>
          </div>

        </section>

        <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            icon={Clock3}
            title="Waiting review"
            value={counts.waiting}
            subtitle="Needs your action"
            tone="amber"
          />
          <MetricCard
            icon={CheckCircle2}
            title="Approved"
            value={counts.approved}
            subtitle="All reviewed"
            tone="emerald"
          />
          <MetricCard
            icon={XCircle}
            title="Rejected"
            value={counts.rejected}
            subtitle="All reviewed"
            tone="red"
          />
          <MetricCard
            icon={BadgeDollarSign}
            title="Total payments"
            value={counts.total}
            subtitle="All time"
            tone="blue"
          />
          <MetricCard
            icon={CircleDollarSign}
            title="Total revenue"
            value={`$${counts.approvedRevenue.toFixed(2)}`}
            subtitle="From approved payments"
            tone="blue"
          />
        </section>

        <section className="overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.05)]">
          <div className="border-b border-slate-100 p-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap gap-2">
                <StatusTab
                  label="All"
                  count={counts.total}
                  active={statusFilter === "all"}
                  onClick={() => changeStatus("all")}
                />
                <StatusTab
                  label="Waiting"
                  count={counts.waiting}
                  active={statusFilter === "waiting"}
                  onClick={() => changeStatus("waiting")}
                />
                <StatusTab
                  label="Approved"
                  count={counts.approved}
                  active={statusFilter === "approved"}
                  onClick={() => changeStatus("approved")}
                />
                <StatusTab
                  label="Rejected"
                  count={counts.rejected}
                  active={statusFilter === "rejected"}
                  onClick={() => changeStatus("rejected")}
                />
              </div>

              <div className="flex flex-1 flex-col gap-2 lg:flex-row xl:max-w-[950px]">
                <label className="relative min-w-0 flex-1">
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
                    placeholder="Search business, customer, reference ID..."
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                  />
                </label>

                <select
                  value={typeFilter}
                  onChange={(event) => {
                    setTypeFilter(event.target.value as TypeFilter);
                    setPage(1);
                  }}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                >
                  <option value="all">All types</option>
                  <option value="url">Store URL change</option>
                  <option value="mode">Business mode switch</option>
                  <option value="both">URL + mode</option>
                </select>

                <label className="relative">
                  <CalendarDays
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <select
                    value={dateFilter}
                    onChange={(event) => {
                      setDateFilter(event.target.value as DateFilter);
                      setPage(1);
                    }}
                    className="h-10 rounded-xl border border-slate-200 bg-white pl-9 pr-8 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                  >
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                    <option value="all">All time</option>
                  </select>
                </label>

                <button
                  type="button"
                  onClick={exportCsv}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-50 px-4 text-xs font-bold text-blue-700 transition hover:bg-blue-100"
                >
                  <Download size={15} />
                  Export
                </button>
              </div>
            </div>
          </div>

          <div>
            <div className="min-w-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left">
                  <thead className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Business / Customer</th>
                      <th className="px-2 py-3">Request type</th>
                      <th className="px-2 py-3">Amount</th>
                      <th className="px-2 py-3">Status</th>
                      <th className="px-2 py-3">Submitted</th>
                      <th className="px-3 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pageRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-16 text-center">
                          <BadgeDollarSign size={32} className="mx-auto text-slate-300" />
                          <p className="mt-3 text-sm font-bold text-slate-700">
                            No payments match these filters
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            Try another status, type, date range, or search.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      pageRows.map((row) => {
                        const badge = statusStyles(row.status);
                        const submitted = shortDateTime(row.submittedAt);
                        const selectedRow = selected?.id === row.id;

                        return (
                          <tr
                            key={row.id}
                            className={`transition ${
                              selectedRow ? "bg-blue-50/45" : "hover:bg-slate-50/70"
                            }`}
                          >


                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-2.5">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-[10px] font-extrabold text-violet-700 ring-1 ring-violet-100">
                                  {initials(row)}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-bold text-slate-900">
                                    {row.businessName}
                                  </p>
                                  <p className="truncate text-[10px] text-slate-500">
                                    {row.customerName}
                                  </p>
                                  <p className="truncate text-[10px] text-slate-400">
                                    {row.customerEmail || "—"}
                                  </p>
                                </div>
                              </div>
                            </td>

                            <td className="px-2 py-3.5">
                              <div className="flex items-start gap-2">
                                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                                  {row.changeUrl ? <Link2 size={13} /> : <Store size={13} />}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[11px] font-bold text-slate-800">
                                    {requestType(row)}
                                  </p>
                                  <p className="mt-0.5 max-w-[170px] truncate text-[10px] text-slate-500">
                                    {requestSubtext(row)}
                                  </p>
                                </div>
                              </div>
                            </td>

                            <td className="px-2 py-3.5 text-xs font-extrabold text-slate-900">
                              {formatMoney(row.amount, row.currency)}
                            </td>

                            <td className="px-2 py-3.5">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold ring-1 ${badge.pill}`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                                {badge.label}
                              </span>
                            </td>

                            <td className="px-2 py-3.5">
                              <p className="text-[10px] font-semibold text-slate-600">
                                {submitted.date}
                              </p>
                              <p className="text-[10px] text-slate-400">{submitted.time}</p>
                            </td>

                            <td className="px-3 py-3.5">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  data-payment-view-toggle
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggleDetails(row.id);
                                  }}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-bold text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
                                >
                                  <Eye size={12} />
                                  {selectedRow ? "Hide" : "View"}
                                </button>

                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[10px] text-slate-500">
                  Showing {filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}–
                  {Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length} payments
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  {Array.from({ length: Math.min(pageCount, 3) }, (_, index) => {
                    const pageNumber = index + 1;
                    return (
                      <button
                        key={pageNumber}
                        type="button"
                        onClick={() => setPage(pageNumber)}
                        className={`h-8 min-w-8 rounded-lg px-2 text-[10px] font-bold transition ${
                          safePage === pageNumber
                            ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100"
                            : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {pageNumber}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    disabled={safePage >= pageCount}
                    onClick={() =>
                      setPage((current) => Math.min(pageCount, current + 1))
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronRight size={14} />
                  </button>
                  <span className="ml-1 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-semibold text-slate-600">
                    10 per page
                  </span>
                </div>
              </div>
            </div>

          </div>
        </section>
      </div>

      {selected ? (
        <div
          ref={detailsPanelRef}
          className="fixed bottom-4 right-4 top-4 z-[90] w-[calc(100%-2rem)] max-w-[460px] overflow-y-auto rounded-[22px] border border-slate-200 bg-[#f7f9fc] p-3 shadow-[-18px_0_60px_rgba(15,23,42,0.18)] sm:p-4"
        >
          <PaymentDetails row={selected} onClose={() => setSelectedId(null)} />
        </div>
      ) : null}

    </section>
  );
}

function formatFileSize(value: number | null) {
  if (!value || value <= 0) return "Size unavailable";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function PaymentDetails({
  row,
  onClose,
}: {
  row: ManualPaymentViewRow;
  onClose: () => void;
}) {
  const badge = statusStyles(row.status);
  const [showProofViewer, setShowProofViewer] = useState(false);

  return (
    <aside>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-extrabold text-slate-900">Payment Details</h2>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold ring-1 ${badge.pill}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
              {badge.label}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
              aria-label="Close payment details"
              title="Close"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-xs font-extrabold text-violet-700 ring-1 ring-violet-100">
            {initials(row)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">{row.businessName}</p>
            <p className="truncate text-[11px] text-slate-500">{row.customerName}</p>
            <p className="truncate text-[10px] text-slate-400">{row.customerEmail || "—"}</p>
          </div>
        </div>

        <dl className="mt-5 space-y-2.5 text-[11px]">
          <Detail label="Request type" value={requestType(row)} />
          {row.changeUrl ? <Detail label="Current URL" value={row.oldUrl} /> : null}
          {row.changeUrl && !row.creditPurchase ? <Detail label="New URL" value={row.requestedUrl} /> : null}
          {row.changeBusinessMode ? (
            <Detail label="Current mode" value={row.oldBusinessType} />
          ) : null}
          {row.changeBusinessMode && !row.creditPurchase ? (
            <Detail label="New mode" value={row.requestedBusinessType} />
          ) : null}
          {row.creditPurchase&&<Detail label="Approval adds" value={`${Number(row.changeUrl)} Store URL credit · ${Number(row.changeBusinessMode)} Business mode credit · No expiry`}/>}
          <Detail label="Amount" value={formatMoney(row.amount, row.currency)} strong />
          <Detail label="Payment method" value={row.paymentProvider || "Manual payment"} />
          <Detail label="Customer note" value={row.paymentNote || "—"} />
          <Detail label="Submitted" value={formatDateTime(row.submittedAt)} />
          {row.reviewedAt ? <Detail label="Reviewed" value={formatDateTime(row.reviewedAt)} /> : null}
          {row.reviewNote ? <Detail label="Review note" value={row.reviewNote} /> : null}
        </dl>

        <div className="mt-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-extrabold text-slate-800">Payment proof</p>
            {row.proofUrl ? (
              <button
                type="button"
                onClick={() => setShowProofViewer(true)}
                className="text-[10px] font-bold text-blue-600 hover:text-blue-700"
              >
                View full size
              </button>
            ) : null}
          </div>

          {row.proofAvailable && row.proofUrl ? (
            <button
              type="button"
              onClick={() => setShowProofViewer(true)}
              className="mt-2 grid w-full grid-cols-[110px_minmax(0,1fr)] gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/40"
              title="Click to view payment proof"
            >
              <div className="flex min-h-[125px] items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
                {row.proofMimeType?.startsWith("image/") ? (
                  <img
                    src={row.proofUrl}
                    alt="Customer payment proof"
                    className="h-[125px] w-full object-contain"
                  />
                ) : (
                  <div className="text-center">
                    <FileText size={28} className="mx-auto text-blue-600" />
                    <p className="mt-2 text-[10px] font-extrabold text-slate-700">PDF proof</p>
                  </div>
                )}
              </div>

              <div className="min-w-0 text-[10px] leading-5 text-slate-500">
                <p className="font-bold text-slate-800">{row.proofFileName || "Payment proof"}</p>
                <p className="mt-1">
                  {formatFileSize(row.proofSizeBytes)}
                  {row.proofUploadedAt
                    ? ` · Uploaded ${formatDateTime(row.proofUploadedAt)}`
                    : ""}
                </p>
                <p className="mt-2 font-semibold text-blue-600">Click proof to view full screen</p>
              </div>
            </button>
          ) : (
            <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold leading-5 text-amber-800">
              No payment proof is attached. This request cannot be approved until the customer uploads proof.
            </div>
          )}
        </div>

        <div className="mt-4 border-t border-slate-100 pt-4">
          {row.status === "waiting" ? (
            <BusinessChangePaymentReview
              orderId={row.id}
              businessName={row.businessName}
              amount={row.amount}
              currency={row.currency}
              approvalBlockedReason={
                !row.paymentNote.trim()
                  ? "Customer payment note is required before approval."
                  : !row.proofAvailable
                    ? "Customer payment proof is required before approval."
                    : null
              }
            />
          ) : (
            <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] font-semibold leading-5 text-slate-500">
              This payment review is complete.
              {row.reviewedByEmail ? ` Reviewed by ${row.reviewedByEmail}.` : ""}
            </div>
          )}
        </div>

        {showProofViewer && row.proofUrl ? (
          <div
            className="fixed inset-0 z-[240] flex items-center justify-center bg-[#111827]/90 p-3 backdrop-blur-[2px] sm:p-5"
            role="dialog"
            aria-modal="true"
            aria-label="Payment proof viewer"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setShowProofViewer(false);
              }
            }}
          >
            {row.proofMimeType?.startsWith("image/") ? (
              <div
                className="relative flex max-h-[94vh] max-w-[94vw] items-center justify-center overflow-hidden rounded-2xl bg-black shadow-[0_28px_90px_rgba(0,0,0,0.55)] ring-1 ring-white/10"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <img
                  src={row.proofUrl}
                  alt="Customer payment proof full screen"
                  className="block max-h-[94vh] max-w-[94vw] select-none object-contain"
                  draggable={false}
                />

                <button
                  type="button"
                  onClick={() => setShowProofViewer(false)}
                  className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/65 text-white shadow-lg ring-1 ring-white/20 backdrop-blur-sm transition hover:bg-black/85"
                  aria-label="Close payment proof"
                  title="Close"
                >
                  <X size={22} strokeWidth={2.4} />
                </button>

                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent px-4 pb-3 pt-10 text-white">
                  <p className="truncate text-xs font-bold">
                    {row.proofFileName || "Payment proof"}
                  </p>
                  <p className="mt-0.5 text-[10px] text-white/70">
                    {formatFileSize(row.proofSizeBytes)}
                    {row.proofUploadedAt ? ` · ${formatDateTime(row.proofUploadedAt)}` : ""}
                  </p>
                </div>
              </div>
            ) : (
              <div
                className="relative h-[92vh] w-[min(94vw,1100px)] overflow-hidden rounded-2xl bg-white shadow-[0_28px_90px_rgba(0,0,0,0.55)] ring-1 ring-white/10"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <iframe
                  src={row.proofUrl}
                  title="Customer payment proof PDF"
                  className="h-full w-full bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowProofViewer(false)}
                  className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white shadow-lg ring-1 ring-white/20 backdrop-blur-sm transition hover:bg-black/90"
                  aria-label="Close payment proof"
                  title="Close"
                >
                  <X size={22} strokeWidth={2.4} />
                </button>
              </div>
            )}
          </div>
        ) : null}

      </div>
    </aside>
  );
}

function Detail({
  label,
  value,
  strong = false,
  mono = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[105px_minmax(0,1fr)] gap-3">
      <dt className="text-slate-400">{label}</dt>
      <dd
        className={`min-w-0 break-words text-slate-700 ${strong ? "font-extrabold text-slate-950" : "font-semibold"} ${mono ? "font-mono text-[10px]" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function StatusTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[10px] font-bold transition ${
        active
          ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100"
          : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label}
      <span className="text-[9px] opacity-70">({count})</span>
    </button>
  );
}

function MetricCard({
  icon: Icon,
  title,
  value,
  subtitle,
  tone,
}: {
  icon: typeof Clock3;
  title: string;
  value: number | string;
  subtitle: string;
  tone: "amber" | "emerald" | "red" | "blue";
}) {
  const styles = {
    amber: {
      shell: "border-amber-100 bg-amber-50/70",
      icon: "bg-amber-100 text-amber-700",
      title: "text-amber-800",
    },
    emerald: {
      shell: "border-emerald-100 bg-emerald-50/70",
      icon: "bg-emerald-100 text-emerald-700",
      title: "text-emerald-800",
    },
    red: {
      shell: "border-red-100 bg-red-50/70",
      icon: "bg-red-100 text-red-700",
      title: "text-red-800",
    },
    blue: {
      shell: "border-blue-100 bg-white",
      icon: "bg-blue-50 text-blue-600",
      title: "text-slate-600",
    },
  }[tone];

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${styles.shell}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${styles.icon}`}>
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <p className={`text-[10px] font-bold ${styles.title}`}>{title}</p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950">{value}</p>
          <p className="mt-0.5 text-[10px] text-slate-400">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
