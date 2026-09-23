"use client";
import FullExportPanel from './full-export-panel';
import SafeImportPanel from './safe-import-panel';
import type { ProductMode } from '@/lib/business/types';

import { useMemo, useState, type ComponentType } from "react";
import {
  Archive,
  Boxes,
  Clock3,
  CreditCard,
  Download,
  FileJson,
  FileSpreadsheet,
  Package,
  ReceiptText,
  RefreshCw,
  ShoppingCart,
  Truck,
  Users,
  XCircle,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import {
  buildExport,
  buildExportAll,
  type ExportEntity,
} from "./actions";

type RecentJob = {
  id: string;
  direction: string;
  entity: string;
  format: string;
  mode: string | null;
  filename: string | null;
  row_count: number;
  status: string;
  error_message: string | null;
  created_at: string;
};

type EntityCard = {
  id: ExportEntity;
  label: string;
  description: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  tone: string;
};

const entities: EntityCard[] = [
  { id: "products", label: "Products", description: "Product details, prices, SKUs and catalogue data.", icon: Package, tone: "bg-emerald-50 text-emerald-600" },
  { id: "inventory", label: "Branch Inventory", description: "Inventory by branch with SKU and stock levels.", icon: Boxes, tone: "bg-violet-50 text-violet-600" },
  { id: "customers", label: "Customers", description: "Customer contact details and profile information.", icon: Users, tone: "bg-blue-50 text-blue-600" },
  { id: "orders", label: "Orders", description: "Order records, payments and current statuses.", icon: ShoppingCart, tone: "bg-blue-50 text-blue-600" },
  { id: "expenses", label: "Expenses", description: "Expense records, categories and payment details.", icon: ReceiptText, tone: "bg-rose-50 text-rose-600" },
  { id: "suppliers", label: "Suppliers", description: "Supplier information and contact details.", icon: Truck, tone: "bg-amber-50 text-amber-600" },
  { id: "shifts", label: "Register Shifts", description: "Register shifts, cash activity and reconciliation.", icon: Clock3, tone: "bg-cyan-50 text-cyan-600" },
  { id: "credit", label: "Customer Credit", description: "Customer credit ledger transactions and balances.", icon: CreditCard, tone: "bg-pink-50 text-pink-600" },
];

function downloadText(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function dateLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

export default function ExportClient({ recentJobs, isOwner, productMode }: { recentJobs: RecentJob[]; isOwner: boolean; productMode: ProductMode }) {
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState<"export" | "import" | "history">("export");
  const [importMessage, setImportMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const jobs = useMemo(() => recentJobs, [recentJobs]);

  async function runExport(entity: ExportEntity, format: "csv" | "json") {
    const key = `${entity}-${format}`;
    setBusy(key);
    try {
      const output = await buildExport(entity, format);
      if (!output.ok) {
        setImportMessage({ ok: false, text: output.message });
        return;
      }
      downloadText(output.filename, output.mime, output.content);
      setImportMessage({ ok: true, text: `${output.rowCount.toLocaleString()} rows exported.` });
    } catch (error) {
      setImportMessage({ ok: false, text: error instanceof Error ? error.message : "Export failed." });
    } finally {
      setBusy("");
    }
  }

  async function runExportAll() {
    setBusy("all");
    try {
      const output = await buildExportAll();
      if (!output.ok) {
        setImportMessage({ ok: false, text: output.message });
        return;
      }
      downloadText(output.filename, output.mime, output.content);
      setImportMessage({ ok: true, text: `Business backup created with ${output.rowCount.toLocaleString()} total rows.` });
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-white">Backup &amp; Export</h1><p className="mt-1 text-slate-500">Export or import your business data. Download portable CSV or JSON files for use in other systems.</p></div>
        <button type="button" aria-pressed={tab === "history"} onClick={() => setTab(tab === "history" ? "export" : "history")} className={`inline-flex shrink-0 items-center gap-3 self-start rounded-xl border px-5 py-3 text-left transition ${tab === "history" ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
          <Clock3 size={20}/><span><span className="block font-semibold">History</span><span className="block text-xs">{tab === "history" ? "Click to return to your data" : "View transfer records"}</span></span>
        </button>
      </div>

      <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 shrink-0" size={18} />
        <p>Exports and imports transfer business data only. Authentication secrets, service-role keys, OAuth credentials and full database backups are intentionally excluded.</p>
      </div>

      {importMessage ? (
        <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${importMessage.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          {importMessage.ok ? <CheckCircle2 className="mt-0.5 shrink-0" size={18} /> : <XCircle className="mt-0.5 shrink-0" size={18} />}
          <span>{importMessage.text}</span>
        </div>
      ) : null}

      {tab === "history" ? (
        <HistoryPanel jobs={jobs} />
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
          {isOwner ? <FullExportPanel /> : <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-950">Export Data</h2>
                <p className="mt-1 text-sm text-slate-500">Download tenant-scoped CSV or JSON files. Exports are capped at 10,000 rows per data type.</p>
              </div>
              <button type="button" onClick={() => void runExportAll()} disabled={!!busy} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50">
                <Archive size={17} /> {busy === "all" ? "Preparing..." : "Export All"}
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {entities.map((entity) => {
                const Icon = entity.icon;
                return (
                  <article key={entity.id} className="rounded-2xl border border-slate-200 p-4 transition hover:border-blue-200 hover:shadow-sm">
                    <div className="flex gap-3">
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${entity.tone}`}><Icon size={22} /></div>
                      <div className="min-w-0"><h3 className="font-bold text-slate-950">{entity.label}</h3><p className="mt-1 text-sm leading-5 text-slate-500">{entity.description}</p></div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button onClick={() => void runExport(entity.id, "csv")} disabled={!!busy} className={buttonClass}>
                        <FileSpreadsheet size={16} /> {busy === `${entity.id}-csv` ? "..." : "CSV"}
                      </button>
                      <button onClick={() => void runExport(entity.id, "json")} disabled={!!busy} className={buttonClass}>
                        <FileJson size={16} /> {busy === `${entity.id}-json` ? "..." : "JSON"}
                      </button>
                    </div>
                  </article>
                );
              })}

              <article className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
                <div className="flex gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><Archive size={22} /></div>
                  <div><h3 className="font-bold text-blue-950">Need everything?</h3><p className="mt-1 text-sm leading-5 text-blue-700">Export every supported data type in one structured JSON backup.</p></div>
                </div>
                <button type="button" onClick={() => void runExportAll()} disabled={!!busy} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">
                  <Download size={16} /> Export All Data
                </button>
              </article>
            </div>
          </section>}

          <SafeImportPanel isOwner={isOwner} productMode={productMode} />
        </div>
      )}

      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm shadow-sm md:grid-cols-3">
        <div className="flex gap-3"><CheckCircle2 className="shrink-0 text-emerald-600" size={20} /><div><h3 className="font-bold text-slate-900">Included</h3><p className="mt-1 text-slate-500">Business products, inventory, customers, orders and operational records for the current tenant.</p></div></div>
        <div className="flex gap-3"><XCircle className="shrink-0 text-red-500" size={20} /><div><h3 className="font-bold text-slate-900">Not included</h3><p className="mt-1 text-slate-500">Passwords, authentication secrets, service-role keys, OAuth credentials and full database internals.</p></div></div>
        <div className="flex gap-3"><FileSpreadsheet className="shrink-0 text-blue-600" size={20} /><div><h3 className="font-bold text-slate-900">Safe import rules</h3><p className="mt-1 text-slate-500">Validate and confirm every import. Changed financial history is blocked; failed imports save no changes.</p></div></div>
      </section>
    </div>
  );
}

function HistoryPanel({ jobs }: { jobs: RecentJob[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Clock3 className="text-slate-500" size={19} /><h2 className="font-bold text-slate-950">History</h2></div></div>
      {jobs.length ? <div className="divide-y divide-slate-100">{jobs.map((job) => (
        <div key={job.id} className="grid gap-1 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
          <div className="min-w-0"><p className="truncate font-semibold text-slate-800">{job.direction === "import" ? "Import" : "Export"} · {job.entity.replaceAll("_", " ")}</p><p className="truncate text-xs text-slate-500">{job.filename ?? `${job.row_count} rows`} · {dateLabel(job.created_at)}</p></div>
          <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-semibold ${job.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{job.status === "completed" ? "Completed" : "Failed"}</span>
        </div>
      ))}</div> : <div className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500"><RefreshCw className="mx-auto mb-2" size={20} />No transfer activity yet.</div>}
    </section>
  );
}

const buttonClass = "inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
