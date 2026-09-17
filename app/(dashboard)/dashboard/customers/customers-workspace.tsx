"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  FileDown,
  Mail,
  Pencil,
  Phone,
  ReceiptText,
  Search,
  Settings2,
  ShoppingBag,
  Trash2,
  Upload,
  UserPlus,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";

import {
  createCustomer,
  deleteCustomer,
  exportCustomersCsv,
  importCustomersCsv,
} from "./actions";

type PurchaseHistoryItem = {
  id: string;
  orderNumber: string;
  total: number;
  status: string;
  orderSource: string;
  createdAt: string;
};

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  address: string | null;
  created_at: string;
  orderCount: number;
  totalSpent: number;
  lastPurchaseAt: string | null;
  isActive: boolean;
  purchaseHistory: PurchaseHistoryItem[];
};

type CustomerFieldSettings = {
  emailEnabled: boolean;
  birthdayEnabled: boolean;
};

const PAGE_SIZE = 15;
const CUSTOMER_TEMPLATE = [
  "name,phone,address,email,birthday",
  'Jane Doe,012345678,"Phnom Penh, Cambodia",jane@example.com,1995-04-21',
].join("\r\n");

export function CustomersWorkspace({
  customers,
  stats,
  currency,
  accentColor,
  fieldSettings,
  canManageSettings,
  canCreate,
  canUpdate,
}: {
  customers: Customer[];
  stats: { total: number; newThisMonth: number; repeat: number; active: number };
  currency: string;
  accentColor: string;
  fieldSettings: CustomerFieldSettings;
  canManageSettings: boolean;
  canCreate: boolean;
  canUpdate: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(customers[0]?.id ?? "");
  const [page, setPage] = useState(1);
  const [panelMode, setPanelMode] = useState<"details" | "history">("details");
  const [deleteCandidate, setDeleteCandidate] = useState<Customer | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState("");
  const [exportBusy, setExportBusy] = useState(false);

  const filteredCustomers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return customers;

    return customers.filter((customer) => {
      const haystack = [
        customer.name,
        customer.phone,
        fieldSettings.emailEnabled ? customer.email : null,
        customer.address,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [customers, query, fieldSettings.emailEnabled]);

  const pageCount = Math.max(1, Math.ceil(filteredCustomers.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visibleCustomers = filteredCustomers.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const selectedCustomer =
    filteredCustomers.find((customer) => customer.id === selectedId) ??
    filteredCustomers[0] ??
    null;

  function updateQuery(value: string) {
    setQuery(value);
    setPage(1);
  }

  function selectCustomer(customerId: string) {
    setSelectedId(customerId);
    setPanelMode("details");
  }

  async function handleExport() {
    setExportBusy(true);
    try {
      const output = await exportCustomersCsv();
      downloadText(output.filename, output.content);
    } finally {
      setExportBusy(false);
    }
  }

  async function handleImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setImportBusy(true);
    setImportError("");
    setImportSuccess("");

    try {
      const formData = new FormData(event.currentTarget);
      const result = await importCustomersCsv(formData);
      setImportSuccess(`${result.imported} customer${result.imported === 1 ? "" : "s"} imported successfully.`);
      event.currentTarget.reset();
      router.refresh();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Unable to import customers.");
    } finally {
      setImportBusy(false);
    }
  }

  return (
    <main className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Customers</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage customer information and purchase history.
          </p>
        </div>

        {canManageSettings ? (
          <Link
            href="/dashboard/settings/customers"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-600"
          >
            <Settings2 size={17} />
            Customer fields
          </Link>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<UsersRound size={20} />} label="Total Customers" value={stats.total} tone="blue" />
        <StatCard icon={<UserPlus size={20} />} label="New This Month" value={stats.newThisMonth} tone="green" />
        <StatCard icon={<ShoppingBag size={20} />} label="Repeat Customers" value={stats.repeat} tone="violet" />
        <StatCard
          icon={<UserRound size={20} />}
          label="Active Customers"
          value={stats.active}
          tone="amber"
          helper="Completed purchase in the last 30 days"
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[290px_minmax(0,1fr)_320px]">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-4">
            <span className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
              <UserPlus size={19} />
            </span>
            <div>
              <h2 className="font-semibold text-slate-900">Add Customer</h2>
              <p className="text-xs text-slate-500">Create a customer profile</p>
            </div>
          </div>

          {canCreate ? (
            <form action={createCustomer} className="space-y-4 p-4">
              <Field label="Name" required>
                <input name="name" minLength={2} required className={inputClass} placeholder="Enter customer name" />
              </Field>
              <Field label="Phone" required>
                <input name="phone" type="tel" required className={inputClass} placeholder="012 345 678" />
              </Field>
              <Field label="Address">
                <textarea name="address" rows={3} className={`${inputClass} resize-none`} placeholder="Enter customer address" />
              </Field>
              {fieldSettings.emailEnabled ? (
                <Field label="Email">
                  <input name="email" type="email" className={inputClass} placeholder="customer@example.com" />
                </Field>
              ) : null}
              {fieldSettings.birthdayEnabled ? (
                <Field label="Birthday">
                  <input name="birthday" type="date" className={inputClass} />
                </Field>
              ) : null}

              <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700">
                <UserPlus size={17} />
                Add Customer
              </button>
            </form>
          ) : (
            <div className="p-5 text-sm text-slate-500">You have view-only customer access.</div>
          )}
        </section>

        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-900">Customer List</h2>
                <p className="text-xs text-slate-500">{filteredCustomers.length} customers</p>
              </div>
              <div className="flex items-center gap-2">
                {canCreate ? (
                  <button
                    type="button"
                    onClick={() => {
                      setImportOpen(true);
                      setImportError("");
                      setImportSuccess("");
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-blue-200 hover:text-blue-600"
                  >
                    <Upload size={15} /> Import
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={exportBusy}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-blue-200 hover:text-blue-600 disabled:opacity-50"
                >
                  <Download size={15} /> {exportBusy ? "Exporting..." : "Export"}
                </button>
              </div>
            </div>
            <div className="relative mt-3 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                value={query}
                onChange={(event) => updateQuery(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50"
                placeholder={fieldSettings.emailEnabled ? "Search name, phone or email..." : "Search name or phone..."}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Phone</th>
                  {fieldSettings.emailEnabled ? <th className="px-4 py-3">Email</th> : null}
                  <th className="px-4 py-3 text-center">Orders</th>
                  <th className="px-4 py-3 text-right">Total spent</th>
                  <th className="px-4 py-3">Last purchase</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={fieldSettings.emailEnabled ? 6 : 5} className="px-4 py-14 text-center text-slate-500">
                      No customers match your search.
                    </td>
                  </tr>
                ) : (
                  visibleCustomers.map((customer) => {
                    const active = selectedCustomer?.id === customer.id;
                    return (
                      <tr
                        key={customer.id}
                        onClick={() => selectCustomer(customer.id)}
                        className={`cursor-pointer transition ${active ? "bg-blue-50/70" : "hover:bg-slate-50"}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Initials name={customer.name} />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900">{customer.name}</p>
                              <p className="truncate text-xs text-slate-400">Customer</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-700">{customer.phone || "—"}</td>
                        {fieldSettings.emailEnabled ? (
                          <td className="max-w-[180px] truncate px-4 py-3 text-slate-600">{customer.email || "—"}</td>
                        ) : null}
                        <td className="px-4 py-3 text-center font-semibold text-slate-700">{customer.orderCount}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatMoney(customer.totalSpent, currency)}</td>
                        <td className="px-4 py-3 text-slate-500">{formatDate(customer.lastPurchaseAt)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
            <span>
              Showing {filteredCustomers.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredCustomers.length)} of {filteredCustomers.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, safePage - 1))}
                disabled={safePage <= 1}
                className="rounded-lg border border-slate-200 p-2 disabled:opacity-40"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="min-w-16 text-center font-semibold text-slate-700">{safePage} / {pageCount}</span>
              <button
                type="button"
                onClick={() => setPage(Math.min(pageCount, safePage + 1))}
                disabled={safePage >= pageCount}
                className="rounded-lg border border-slate-200 p-2 disabled:opacity-40"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
            <div>
              <h2 className="font-semibold text-slate-900">
                {panelMode === "history" ? "Purchase History" : "Customer Details"}
              </h2>
              <p className="text-xs text-slate-500">
                {panelMode === "history" ? "Recent customer orders" : "Selected customer"}
              </p>
            </div>
            {panelMode === "history" ? (
              <button
                type="button"
                onClick={() => setPanelMode("details")}
                className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                aria-label="Back to customer details"
              >
                <ArrowLeft size={16} />
              </button>
            ) : null}
          </div>

          {selectedCustomer ? (
            panelMode === "history" ? (
              <PurchaseHistoryPanel customer={selectedCustomer} currency={currency} />
            ) : (
              <div className="p-4">
                <div className="flex items-center gap-3">
                  <Initials name={selectedCustomer.name} large />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-lg font-bold text-slate-950">{selectedCustomer.name}</h3>
                    {selectedCustomer.isActive ? (
                      <span
                        title="Completed purchase in the last 30 days"
                        className="mt-1 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
                      >
                        Active
                      </span>
                    ) : (
                      <span
                        title="No completed purchase in the last 30 days"
                        className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600"
                      >
                        Inactive
                      </span>
                    )}
                  </div>
                </div>

                {canUpdate ? (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Link href={`/dashboard/customers/${selectedCustomer.id}/edit`} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
                      <Pencil size={16} /> Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() => setDeleteCandidate(selectedCustomer)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={16} /> Delete
                    </button>
                  </div>
                ) : null}

                <div className="mt-5 space-y-3 text-sm">
                  <DetailRow icon={<Phone size={16} />} value={selectedCustomer.phone || "No phone"} />
                  {fieldSettings.emailEnabled ? <DetailRow icon={<Mail size={16} />} value={selectedCustomer.email || "No email"} /> : null}
                  {fieldSettings.birthdayEnabled ? <DetailRow icon={<CalendarDays size={16} />} value={formatBirthday(selectedCustomer.birthday)} /> : null}
                  <DetailRow icon={<UserRound size={16} />} value={selectedCustomer.address || "No address"} />
                  <DetailRow icon={<CalendarDays size={16} />} value={`Customer since ${formatDate(selectedCustomer.created_at)}`} />
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2">
                  <MetricBox icon={<ShoppingBag size={17} />} label="Total Orders" value={String(selectedCustomer.orderCount)} />
                  <MetricBox icon={<WalletCards size={17} />} label="Total Spent" value={formatMoney(selectedCustomer.totalSpent, currency)} />
                </div>

                <button
                  type="button"
                  onClick={() => setPanelMode("history")}
                  style={{ backgroundColor: accentColor }}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 active:brightness-90"
                >
                  <ShoppingBag size={16} />
                  View Purchase History
                </button>
              </div>
            )
          ) : (
            <div className="px-5 py-16 text-center text-sm text-slate-500">
              Select a customer to view details.
            </div>
          )}
        </section>
      </div>

      {importOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[2px]" onMouseDown={() => setImportOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="font-semibold text-slate-950">Import Customers</h3>
                <p className="mt-0.5 text-xs text-slate-500">Use the TENH CSV template. Name and phone are required.</p>
              </div>
              <button type="button" onClick={() => setImportOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X size={17} />
              </button>
            </div>

            <form onSubmit={handleImport} className="space-y-4 p-5">
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                <p className="font-semibold">Template columns</p>
                <p className="mt-1 text-xs text-blue-700">name, phone, address, email, birthday</p>
                <p className="mt-1 text-xs text-blue-700">Birthday format: YYYY-MM-DD. Address, email and birthday are optional.</p>
                <button
                  type="button"
                  onClick={() => downloadText("tenh-customers-import-template.csv", CUSTOMER_TEMPLATE)}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-blue-700 shadow-sm"
                >
                  <FileDown size={14} /> Download template example
                </button>
              </div>

              <label className="block text-sm font-semibold text-slate-700">
                CSV file
                <input
                  name="file"
                  type="file"
                  accept=".csv,text/csv"
                  required
                  className="mt-2 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:font-semibold file:text-blue-700"
                />
              </label>

              {importError ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{importError}</p> : null}
              {importSuccess ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{importSuccess}</p> : null}

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setImportOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">
                  Cancel
                </button>
                <button disabled={importBusy} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                  {importBusy ? "Importing..." : "Import customers"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteCandidate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[2px]" onMouseDown={() => setDeleteCandidate(null)}>
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600">
              <Trash2 size={20} />
            </div>
            <h3 className="mt-4 text-lg font-bold text-slate-950">Delete customer?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Delete <span className="font-semibold text-slate-900">{deleteCandidate.name}</span>? This removes the customer profile. Existing order records remain part of business history.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteCandidate(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">
                Cancel
              </button>
              <form action={deleteCustomer}>
                <input type="hidden" name="customerId" value={deleteCandidate.id} />
                <button className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700">
                  Delete customer
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

const inputClass =
  "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-slate-600">
      {label} {required ? <span className="text-red-500">*</span> : null}
      {children}
    </label>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
  helper,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "blue" | "green" | "violet" | "amber";
  helper?: string;
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-emerald-50 text-emerald-600",
    violet: "bg-violet-50 text-violet-600",
    amber: "bg-amber-50 text-amber-600",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`rounded-xl p-2.5 ${tones[tone]}`}>{icon}</span>
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-0.5 text-2xl font-bold text-slate-950">{value.toLocaleString()}</p>
          {helper ? <p className="mt-0.5 text-[11px] text-slate-400">{helper}</p> : null}
        </div>
      </div>
    </div>
  );
}

function Initials({ name, large = false }: { name: string; large?: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-blue-50 font-bold text-blue-600 ${large ? "h-14 w-14 text-lg" : "h-8 w-8 text-xs"}`}>
      {initials || "C"}
    </span>
  );
}

function DetailRow({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="flex items-start gap-2.5 text-slate-600">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  );
}

function MetricBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-blue-600">{icon}<span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span></div>
      <p className="mt-1 text-base font-bold text-slate-900">{value}</p>
    </div>
  );
}

function PurchaseHistoryPanel({ customer, currency }: { customer: Customer; currency: string }) {
  return (
    <div className="p-4">
      <div className="mb-4 flex items-center gap-3">
        <Initials name={customer.name} />
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">{customer.name}</p>
          <p className="text-xs text-slate-500">{customer.purchaseHistory.length} recent order{customer.purchaseHistory.length === 1 ? "" : "s"}</p>
        </div>
      </div>

      {customer.purchaseHistory.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center">
          <ReceiptText className="mx-auto text-slate-300" size={32} />
          <p className="mt-3 text-sm text-slate-500">No purchase history yet.</p>
        </div>
      ) : (
        <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
          {customer.purchaseHistory.map((order) => (
            <div key={order.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{order.orderNumber}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{formatDate(order.createdAt)} · {order.orderSource}</p>
                </div>
                <p className="text-sm font-bold text-slate-900">{formatMoney(order.total, currency)}</p>
              </div>
              <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-slate-600">
                {order.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Phnom_Penh" }).format(new Date(value));
}

function formatBirthday(value: string | null) {
  if (!value) return "No birthday";
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}
