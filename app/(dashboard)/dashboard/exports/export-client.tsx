"use client";

import { useMemo, useRef, useState, type ComponentType } from "react";
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
  Upload,
  Users,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import {
  buildExport,
  buildExportAll,
  commitCsvImport,
  previewCsvImport,
  type ExportEntity,
  type ImportEntity,
  type ImportMode,
  type ImportPreviewResult,
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

const importTemplates: Record<ImportEntity, string> = {
  products: "name,sku,barcode,description,cost_price,selling_price,low_stock_quantity,is_active\nClassic Tee,TEE-001,TEE-001,Example product,5,12,5,true\n",
  customers: "name,email,phone,address,note\nExample Customer,customer@example.com,+85512345678,Phnom Penh,VIP\n",
  suppliers: "name,contact_person,phone,email,address,notes\nExample Supplier,Mr. Dara,+85512345678,supplier@example.com,Phnom Penh,Primary supplier\n",
  inventory: "branch_code,sku,quantity,low_stock_threshold\nMAIN,TEE-001,25,5\n",
};

const importLabels: Record<ImportEntity, string> = {
  products: "Products",
  customers: "Customers",
  suppliers: "Suppliers",
  inventory: "Branch Inventory",
};

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

export default function ExportClient({ recentJobs }: { recentJobs: RecentJob[] }) {
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState<"export" | "import" | "history">("export");
  const [importEntity, setImportEntity] = useState<ImportEntity>("products");
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [importMessage, setImportMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

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

  async function selectFile(nextFile: File | null) {
    setPreview(null);
    setImportMessage(null);
    if (!nextFile) {
      setFile(null);
      setCsvText("");
      return;
    }
    if (!nextFile.name.toLowerCase().endsWith(".csv")) {
      setImportMessage({ ok: false, text: "Only CSV files can be imported." });
      return;
    }
    if (nextFile.size > 750_000) {
      setImportMessage({ ok: false, text: "Keep each CSV import below 750 KB and 1,000 rows." });
      return;
    }
    const text = await nextFile.text();
    setFile(nextFile);
    setCsvText(text);
  }

  async function validateImport() {
    if (!csvText || !file) {
      setImportMessage({ ok: false, text: "Choose a CSV file first." });
      return;
    }
    setBusy("validate");
    try {
      const result = await previewCsvImport(importEntity, csvText);
      setPreview(result);
      setImportMessage({ ok: result.ok, text: result.message });
    } finally {
      setBusy("");
    }
  }

  async function runImport() {
    if (!file || !csvText) return;
    setBusy("import");
    try {
      const checked = preview?.ok ? preview : await previewCsvImport(importEntity, csvText);
      setPreview(checked);
      if (!checked.ok) {
        setImportMessage({ ok: false, text: checked.errors[0] ?? checked.message });
        return;
      }
      const result = await commitCsvImport(importEntity, importMode, csvText, file.name);
      setImportMessage({ ok: result.ok, text: result.message });
      if (result.ok) {
        setFile(null);
        setCsvText("");
        setPreview(null);
        if (fileInput.current) fileInput.current.value = "";
      }
    } finally {
      setBusy("");
    }
  }

  function downloadTemplate() {
    downloadText(`tenh-${importEntity}-import-template.csv`, "text/csv;charset=utf-8", importTemplates[importEntity]);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="grid gap-2 md:grid-cols-3">
          {(["export", "import", "history"] as const).map((item) => (
            <button key={item} type="button" onClick={() => setTab(item)} className={`flex items-center gap-3 rounded-xl border px-5 py-3 text-left transition ${tab === item ? "border-blue-300 bg-blue-50 text-blue-700" : "border-transparent text-slate-600 hover:bg-slate-50"}`}>
              {item === "export" ? <Download size={20} /> : item === "import" ? <Upload size={20} /> : <Clock3 size={20} />}
              <span><span className="block font-semibold capitalize">{item}</span><span className="block text-xs text-slate-500">{item === "export" ? "Download your data" : item === "import" ? "Import validated CSV files" : "View transfer records"}</span></span>
            </button>
          ))}
        </div>
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
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
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
          </section>

          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Upload size={22} /></div>
                <div><h2 className="text-xl font-bold text-slate-950">Import Data</h2><p className="text-sm text-slate-500">Validated CSV import into this business only.</p></div>
              </div>

              <label className="block text-sm font-semibold text-slate-700">Data type
                <select value={importEntity} onChange={(event) => { setImportEntity(event.target.value as ImportEntity); setPreview(null); setImportMessage(null); }} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5">
                  {(Object.keys(importLabels) as ImportEntity[]).map((entity) => <option key={entity} value={entity}>{importLabels[entity]}</option>)}
                </select>
              </label>

              <div
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.preventDefault(); void selectFile(event.dataTransfer.files[0] ?? null); }}
                className="mt-4 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-5 text-center"
              >
                <Upload className="mx-auto text-blue-600" size={28} />
                <p className="mt-2 text-sm font-semibold text-slate-800">Choose a CSV file or drag and drop</p>
                <p className="mt-1 text-xs text-slate-500">Up to 750 KB / 1,000 rows</p>
                <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => void selectFile(event.target.files?.[0] ?? null)} />
                <button type="button" onClick={() => fileInput.current?.click()} className="mt-3 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Browse Files</button>
                {file ? <p className="mt-3 truncate text-xs font-medium text-blue-700">{file.name}</p> : null}
              </div>

              <button type="button" onClick={downloadTemplate} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"><Download size={15} /> Download {importLabels[importEntity]} template</button>

              <div className="my-4 border-t border-slate-100" />
              <h3 className="font-semibold text-slate-900">Import Options</h3>
              <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm">
                <input type="radio" checked={importMode === "merge"} onChange={() => setImportMode("merge")} className="mt-1" />
                <span><span className="block font-medium text-slate-800">Merge with existing data</span><span className="text-slate-500">Update matching records and add new records.</span></span>
              </label>
              <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm">
                <input type="radio" checked={importMode === "update"} onChange={() => setImportMode("update")} className="mt-1" />
                <span><span className="block font-medium text-slate-800">Update matching only</span><span className="text-slate-500">Never add new records and never delete existing data.</span></span>
              </label>
              <label className="mt-4 flex items-start gap-3 rounded-xl bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                <input type="checkbox" checked readOnly className="mt-1" />
                <span><span className="block font-semibold">Validate data before import</span><span className="text-emerald-700">Always on for safety. Cross-business IDs are ignored.</span></span>
              </label>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => void validateImport()} disabled={!file || !!busy} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><ShieldCheck size={16} /> Validate</button>
                <button type="button" onClick={() => void runImport()} disabled={!file || !!busy || (preview !== null && !preview.ok)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40"><Upload size={16} /> {busy === "import" ? "Importing..." : "Import Data"}</button>
              </div>

              {preview ? <ImportPreview preview={preview} /> : null}
            </section>

            <HistoryPanel jobs={jobs.slice(0, 5)} compact />
          </div>
        </div>
      )}

      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm shadow-sm md:grid-cols-3">
        <div className="flex gap-3"><CheckCircle2 className="shrink-0 text-emerald-600" size={20} /><div><h3 className="font-bold text-slate-900">Included</h3><p className="mt-1 text-slate-500">Business products, inventory, customers, orders and operational records for the current tenant.</p></div></div>
        <div className="flex gap-3"><XCircle className="shrink-0 text-red-500" size={20} /><div><h3 className="font-bold text-slate-900">Not included</h3><p className="mt-1 text-slate-500">Passwords, authentication secrets, service-role keys, OAuth credentials and full database internals.</p></div></div>
        <div className="flex gap-3"><FileSpreadsheet className="shrink-0 text-blue-600" size={20} /><div><h3 className="font-bold text-slate-900">Safe import rules</h3><p className="mt-1 text-slate-500">Products, customers, suppliers and branch inventory only. Orders and financial history remain export-only.</p></div></div>
      </section>
    </div>
  );
}

function ImportPreview({ preview }: { preview: ImportPreviewResult }) {
  return (
    <div className={`mt-4 rounded-xl border p-3 text-sm ${preview.ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
      <div className="flex items-center gap-2 font-semibold">{preview.ok ? <CheckCircle2 className="text-emerald-600" size={17} /> : <XCircle className="text-red-600" size={17} />}{preview.message}</div>
      {preview.errors.length ? <ul className="mt-2 space-y-1 text-xs text-red-700">{preview.errors.map((error) => <li key={error}>• {error}</li>)}</ul> : null}
      {preview.ok && preview.preview.length ? (
        <div className="mt-3 overflow-x-auto rounded-lg border border-emerald-200 bg-white">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-slate-500"><tr>{Object.keys(preview.preview[0]).map((key) => <th key={key} className="px-2 py-2 text-left font-semibold">{key}</th>)}</tr></thead>
            <tbody>{preview.preview.map((row, index) => <tr key={index} className="border-t">{Object.keys(preview.preview[0]).map((key) => <td key={key} className="max-w-40 truncate px-2 py-2 text-slate-700">{String(row[key] ?? "")}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function HistoryPanel({ jobs, compact = false }: { jobs: RecentJob[]; compact?: boolean }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Clock3 className="text-slate-500" size={19} /><h2 className="font-bold text-slate-950">Recent Backup Activity</h2></div>{compact ? <span className="text-xs text-slate-400">Last {jobs.length}</span> : null}</div>
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
