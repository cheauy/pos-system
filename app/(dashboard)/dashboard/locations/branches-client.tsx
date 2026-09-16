"use client";

import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Ellipsis,
  MapPin,
  Package,
  Pencil,
  Phone,
  Plus,
  Search,
  Star,
  Store,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createLocation,
  deleteLocation,
  setDefaultLocation,
  toggleLocation,
  updateLocation,
  type BranchActionResult,
} from "./actions";

export type BranchManagerOption = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type BranchViewModel = {
  id: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  city: string;
  stateRegion: string;
  timezone: string;
  openingHours: string;
  notes: string;
  managerUserId: string;
  managerName: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  todaySales: number;
  staffCount: number;
  inventoryCount: number;
};

type Props = {
  businessName: string;
  branches: BranchViewModel[];
  managerOptions: BranchManagerOption[];
};

type ModalState =
  | { type: "view"; branch: BranchViewModel }
  | { type: "edit"; branch: BranchViewModel }
  | { type: "delete"; branch: BranchViewModel }
  | null;

const inputClass =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const textareaClass =
  "min-h-20 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function locationLine(branch: BranchViewModel) {
  return [branch.address, branch.city, branch.stateRegion]
    .filter(Boolean)
    .join(", ");
}

export default function BranchesClient({
  businessName,
  branches,
  managerOptions,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("name-asc");
  const [page, setPage] = useState(1);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [notice, setNotice] = useState<BranchActionResult | null>(null);

  const activeBranches = branches.filter((branch) => branch.isActive);
  const defaultBranch = branches.find((branch) => branch.isDefault);
  const totalStaff = branches.reduce((sum, branch) => sum + branch.staffCount, 0);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const next = branches.filter((branch) => {
      const matchesStatus =
        status === "all" ||
        (status === "active" && branch.isActive) ||
        (status === "disabled" && !branch.isActive);
      if (!matchesStatus) return false;
      if (!term) return true;
      return [
        branch.name,
        branch.code,
        branch.city,
        branch.stateRegion,
        branch.managerName,
      ].some((value) => value.toLowerCase().includes(term));
    });

    return [...next].sort((a, b) => {
      if (sort === "name-desc") return b.name.localeCompare(a.name);
      if (sort === "sales-desc") return b.todaySales - a.todaySales;
      if (sort === "staff-desc") return b.staffCount - a.staffCount;
      return a.name.localeCompare(b.name);
    });
  }, [branches, search, sort, status]);

  const pageSize = 5;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  function finish(result: BranchActionResult) {
    setNotice(result);
    if (result.ok) {
      setModal(null);
      setMenuId(null);
      router.refresh();
    }
  }

  function run(action: () => Promise<BranchActionResult>) {
    setNotice(null);
    startTransition(async () => finish(await action()));
  }

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set("makeDefault", data.get("makeDefault") ? "true" : "false");
    run(async () => {
      const result = await createLocation(data);
      if (result.ok) form.reset();
      return result;
    });
  }

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.set("makeDefault", data.get("makeDefault") ? "true" : "false");
    run(() => updateLocation(data));
  }

  function makeDefault(branch: BranchViewModel) {
    const data = new FormData();
    data.set("locationId", branch.id);
    run(() => setDefaultLocation(data));
  }

  function reactivate(branch: BranchViewModel) {
    const data = new FormData();
    data.set("locationId", branch.id);
    data.set("active", "true");
    run(() => toggleLocation(data));
  }

  function confirmDelete(branch: BranchViewModel) {
    const data = new FormData();
    data.set("locationId", branch.id);
    run(() => deleteLocation(data));
  }

  function exportCsv() {
    const header = [
      "Branch",
      "Code",
      "Status",
      "Default",
      "Manager",
      "Phone",
      "Address",
      "City",
      "State/Province",
      "Today Sales",
      "Staff",
      "Inventory",
    ];
    const rows = filtered.map((branch) => [
      branch.name,
      branch.code,
      branch.isActive ? "Active" : "Disabled",
      branch.isDefault ? "Yes" : "No",
      branch.managerName,
      branch.phone,
      branch.address,
      branch.city,
      branch.stateRegion,
      branch.todaySales.toFixed(2),
      String(branch.staffCount),
      String(branch.inventoryCount),
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-branches.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Branches</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage store locations for {businessName}. Add, edit and organize branches while keeping stock and register history safe.
          </p>
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-2.5 text-xs font-medium text-blue-700">
          TENH protects the last active and default branch from deletion.
        </div>
      </header>

      {notice ? (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${
            notice.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {notice.message}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Plus size={20} />
            </span>
            <div>
              <h2 className="font-bold text-slate-950">Add Branch</h2>
              <p className="text-xs text-slate-500">Create a new store location</p>
            </div>
          </div>

          <form onSubmit={submitCreate} className="space-y-4 p-5">
            <Field label="Branch name" required>
              <input name="name" required maxLength={100} placeholder="e.g. Toul Kork Branch" className={inputClass} />
            </Field>
            <Field label="Branch code" required>
              <input name="code" required maxLength={20} placeholder="e.g. TK01" className={inputClass} />
            </Field>
            <Field label="Phone">
              <input name="phone" placeholder="e.g. +855 12 345 678" className={inputClass} />
            </Field>
            <Field label="Manager">
              <select name="managerUserId" className={inputClass} defaultValue="">
                <option value="">No manager assigned</option>
                {managerOptions.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.name} · {manager.role}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Address">
              <input name="address" placeholder="Street address" className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="City">
                <input name="city" placeholder="Phnom Penh" className={inputClass} />
              </Field>
              <Field label="State / Province">
                <input name="stateRegion" placeholder="Phnom Penh" className={inputClass} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Opening hours">
                <input name="openingHours" placeholder="9:00 AM – 9:00 PM" className={inputClass} />
              </Field>
              <Field label="Timezone">
                <select name="timezone" defaultValue="Asia/Phnom_Penh" className={inputClass}>
                  <option value="Asia/Phnom_Penh">Cambodia (GMT+7)</option>
                  <option value="Asia/Bangkok">Bangkok (GMT+7)</option>
                  <option value="Asia/Singapore">Singapore (GMT+8)</option>
                  <option value="Asia/Tokyo">Tokyo (GMT+9)</option>
                  <option value="UTC">UTC</option>
                </select>
              </Field>
            </div>
            <Field label="Notes">
              <textarea name="notes" maxLength={500} placeholder="Additional notes about this branch..." className={textareaClass} />
            </Field>
            <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm">
              <input type="checkbox" name="makeDefault" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600" />
              <span>
                <span className="block font-semibold text-slate-800">Set as default branch</span>
                <span className="text-xs text-slate-500">New POS activity will prefer this location.</span>
              </span>
            </label>
            <button
              disabled={isPending}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
            >
              <Plus size={18} /> {isPending ? "Saving…" : "Create Branch"}
            </button>
          </form>
        </section>

        <div className="min-w-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard icon={<Building2 size={20} />} label="Total Branches" value={String(branches.length)} tone="blue" />
            <SummaryCard icon={<Check size={20} />} label="Active Branches" value={String(activeBranches.length)} tone="green" />
            <SummaryCard icon={<Users size={20} />} label="Staff Assigned" value={String(totalStaff)} tone="blue" />
            <SummaryCard icon={<Star size={20} />} label="Default Branch" value={defaultBranch?.name ?? "Not set"} tone="amber" compact />
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-950">All Branches</h2>
                <p className="text-sm text-slate-500">View and manage your store locations</p>
              </div>
              <button onClick={exportCsv} type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Download size={16} /> Export
              </button>
            </div>

            <div className="grid gap-3 border-b border-slate-100 p-4 lg:grid-cols-[minmax(260px,1fr)_180px_190px]">
              <label className="relative">
                <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search branches by name, code, manager or city..."
                  className={`${inputClass} pl-9`}
                />
              </label>
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
                className={inputClass}
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
              <select value={sort} onChange={(event) => setSort(event.target.value)} className={inputClass}>
                <option value="name-asc">Name (A–Z)</option>
                <option value="name-desc">Name (Z–A)</option>
                <option value="sales-desc">Today&apos;s sales</option>
                <option value="staff-desc">Staff assigned</option>
              </select>
            </div>

            <div className="space-y-3 p-4">
              {visible.length === 0 ? (
                <div className="flex min-h-56 flex-col items-center justify-center text-center">
                  <Store size={42} className="text-slate-300" />
                  <p className="mt-3 font-semibold text-slate-700">No branches found</p>
                  <p className="mt-1 text-sm text-slate-500">Try another search or create a new branch.</p>
                </div>
              ) : (
                visible.map((branch) => (
                  <article key={branch.id} className={`rounded-xl border p-4 transition ${branch.isDefault ? "border-blue-300 bg-blue-50/20" : "border-slate-200"}`}>
                    <div className="grid gap-4 xl:grid-cols-[minmax(260px,1.4fr)_minmax(330px,1fr)_auto] xl:items-center">
                      <div className="flex gap-4">
                        <span className="flex h-20 w-24 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-100 to-blue-50 text-blue-600">
                          <Building2 size={34} />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-lg font-bold text-slate-950">{branch.name}</h3>
                            {branch.isDefault ? <Badge tone="blue">Default</Badge> : null}
                            <Badge tone={branch.isActive ? "green" : "gray"}>{branch.isActive ? "Active" : "Disabled"}</Badge>
                          </div>
                          <p className="mt-0.5 text-xs font-medium text-slate-500">Code: {branch.code}</p>
                          {locationLine(branch) ? (
                            <p className="mt-2 flex items-start gap-1.5 text-sm text-slate-600"><MapPin size={15} className="mt-0.5 shrink-0" /> {locationLine(branch)}</p>
                          ) : null}
                          {branch.phone ? <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600"><Phone size={15} /> {branch.phone}</p> : null}
                          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600"><UserRound size={15} /> {branch.managerName}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 border-y border-slate-100 py-3 xl:border-y-0 xl:border-l xl:pl-5">
                        <Metric icon={<Package size={16} />} label="Today&apos;s Sales" value={money(branch.todaySales)} />
                        <Metric icon={<Users size={16} />} label="Staff" value={String(branch.staffCount)} />
                        <Metric icon={<Package size={16} />} label="Inventory" value={branch.inventoryCount.toLocaleString()} />
                        <div className="col-span-3 flex items-center gap-2 text-xs text-slate-500"><Clock3 size={14} /> {branch.openingHours || "Opening hours not set"} · {branch.timezone}</div>
                      </div>

                      <div className="relative flex items-center justify-end gap-2">
                        {!branch.isDefault && branch.isActive ? (
                          <button type="button" disabled={isPending} onClick={() => makeDefault(branch)} className="hidden rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 2xl:inline-flex">
                            Make default
                          </button>
                        ) : null}
                        <button
                          type="button"
                          aria-label={`Actions for ${branch.name}`}
                          onClick={() => setMenuId(menuId === branch.id ? null : branch.id)}
                          className="flex h-9 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                        >
                          <Ellipsis size={18} />
                        </button>
                        {menuId === branch.id ? (
                          <div className="absolute right-0 top-11 z-20 w-40 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                            <MenuButton onClick={() => { setModal({ type: "view", branch }); setMenuId(null); }}>View</MenuButton>
                            <MenuButton onClick={() => { setModal({ type: "edit", branch }); setMenuId(null); }}>Edit</MenuButton>
                            <MenuButton danger onClick={() => { setModal({ type: "delete", branch }); setMenuId(null); }}>Delete</MenuButton>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 text-xs text-slate-500">
              <span>Showing {visible.length} of {filtered.length} branches</span>
              <div className="flex items-center gap-2">
                <button type="button" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="flex h-8 w-8 items-center justify-center rounded-lg border disabled:opacity-40"><ChevronLeft size={16} /></button>
                <span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-blue-600 px-2 font-semibold text-white">{safePage}</span>
                <button type="button" disabled={safePage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="flex h-8 w-8 items-center justify-center rounded-lg border disabled:opacity-40"><ChevronRight size={16} /></button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {modal?.type === "view" ? (
        <Modal title={modal.branch.name} onClose={() => setModal(null)}>
          <BranchDetails branch={modal.branch} />
        </Modal>
      ) : null}

      {modal?.type === "edit" ? (
        <Modal title={`Edit ${modal.branch.name}`} onClose={() => setModal(null)} wide>
          <form onSubmit={submitEdit} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="locationId" value={modal.branch.id} />
            <Field label="Branch name" required><input name="name" required defaultValue={modal.branch.name} className={inputClass} /></Field>
            <Field label="Branch code" required><input name="code" required defaultValue={modal.branch.code} className={inputClass} /></Field>
            <Field label="Phone"><input name="phone" defaultValue={modal.branch.phone} className={inputClass} /></Field>
            <Field label="Manager">
              <select name="managerUserId" defaultValue={modal.branch.managerUserId} className={inputClass}>
                <option value="">No manager assigned</option>
                {managerOptions.map((manager) => <option key={manager.id} value={manager.id}>{manager.name} · {manager.role}</option>)}
              </select>
            </Field>
            <div className="sm:col-span-2"><Field label="Address"><input name="address" defaultValue={modal.branch.address} className={inputClass} /></Field></div>
            <Field label="City"><input name="city" defaultValue={modal.branch.city} className={inputClass} /></Field>
            <Field label="State / Province"><input name="stateRegion" defaultValue={modal.branch.stateRegion} className={inputClass} /></Field>
            <Field label="Opening hours"><input name="openingHours" defaultValue={modal.branch.openingHours} className={inputClass} /></Field>
            <Field label="Timezone">
              <select name="timezone" defaultValue={modal.branch.timezone || "Asia/Phnom_Penh"} className={inputClass}>
                <option value="Asia/Phnom_Penh">Cambodia (GMT+7)</option>
                <option value="Asia/Bangkok">Bangkok (GMT+7)</option>
                <option value="Asia/Singapore">Singapore (GMT+8)</option>
                <option value="Asia/Tokyo">Tokyo (GMT+9)</option>
                <option value="UTC">UTC</option>
              </select>
            </Field>
            <div className="sm:col-span-2"><Field label="Notes"><textarea name="notes" defaultValue={modal.branch.notes} className={textareaClass} /></Field></div>
            {!modal.branch.isDefault ? (
              <label className="sm:col-span-2 flex items-start gap-3 rounded-xl bg-blue-50 p-3 text-sm">
                <input type="checkbox" name="makeDefault" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600" />
                <span><span className="block font-semibold text-blue-900">Make this the default branch</span><span className="text-xs text-blue-700">TENH switches the default atomically so the business is never left without one.</span></span>
              </label>
            ) : null}
            {!modal.branch.isActive ? (
              <div className="sm:col-span-2 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div><p className="text-sm font-semibold text-amber-900">This branch is archived</p><p className="text-xs text-amber-700">Reactivate it to use it for new POS activity.</p></div>
                <button type="button" disabled={isPending} onClick={() => reactivate(modal.branch)} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white">Reactivate</button>
              </div>
            ) : null}
            <div className="sm:col-span-2 flex justify-end gap-2 border-t pt-4">
              <button type="button" onClick={() => setModal(null)} className="rounded-lg border px-4 py-2 text-sm font-semibold">Cancel</button>
              <button disabled={isPending} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{isPending ? "Saving…" : "Save changes"}</button>
            </div>
          </form>
        </Modal>
      ) : null}

      {modal?.type === "delete" ? (
        <Modal title="Delete branch?" onClose={() => setModal(null)}>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-semibold">{modal.branch.name}</p>
            <p className="mt-1">TENH will never delete the last active branch or the default branch. Stock must be zero and pending transfers/register shifts must be finished first.</p>
            <p className="mt-2">If this branch has historical orders or finance records, TENH will safely archive it instead of destroying history.</p>
          </div>
          {modal.branch.isDefault ? <p className="mt-3 text-sm font-medium text-amber-700">Make another active branch the default before deleting this one.</p> : null}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setModal(null)} className="rounded-lg border px-4 py-2 text-sm font-semibold">Cancel</button>
            <button type="button" disabled={isPending || modal.branch.isDefault} onClick={() => confirmDelete(modal.branch)} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Trash2 size={16} /> {isPending ? "Checking…" : "Delete safely"}</button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}{required ? <span className="text-red-500"> *</span> : null}</span>{children}</label>;
}

function SummaryCard({ icon, label, value, tone, compact = false }: { icon: React.ReactNode; label: string; value: string; tone: "blue" | "green" | "amber"; compact?: boolean }) {
  const toneClass = tone === "green" ? "bg-emerald-50 text-emerald-600" : tone === "amber" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600";
  return <div className="flex min-h-24 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>{icon}</span><div className="min-w-0"><p className="text-xs font-medium text-slate-500">{label}</p><p className={`${compact ? "truncate text-base" : "text-2xl"} mt-0.5 font-bold text-slate-950`}>{value}</p></div></div>;
}

function Badge({ tone, children }: { tone: "blue" | "green" | "gray"; children: React.ReactNode }) {
  const styles = tone === "green" ? "bg-emerald-100 text-emerald-700" : tone === "blue" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${styles}`}>{children}</span>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div><div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500"><span className="text-blue-600">{icon}</span>{label}</div><p className="mt-1 text-sm font-bold text-slate-900">{value}</p></div>;
}

function MenuButton({ onClick, danger = false, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-slate-50 ${danger ? "text-red-600" : "text-slate-700"}`}>{children}</button>;
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4"><button type="button" aria-label="Close" className="absolute inset-0" onClick={onClose} /><section className={`relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white shadow-2xl ${wide ? "max-w-3xl" : "max-w-xl"}`}><div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4"><h2 className="text-lg font-bold text-slate-950">{title}</h2><button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100"><X size={18} /></button></div><div className="p-5">{children}</div></section></div>;
}

function BranchDetails({ branch }: { branch: BranchViewModel }) {
  return <div className="space-y-4"><div className="flex flex-wrap items-center gap-2"><Badge tone={branch.isActive ? "green" : "gray"}>{branch.isActive ? "Active" : "Disabled"}</Badge>{branch.isDefault ? <Badge tone="blue">Default</Badge> : null}</div><div className="grid gap-3 sm:grid-cols-2"><Detail label="Code" value={branch.code} /><Detail label="Manager" value={branch.managerName} /><Detail label="Phone" value={branch.phone || "Not set"} /><Detail label="Opening hours" value={branch.openingHours || "Not set"} /><Detail label="Timezone" value={branch.timezone} /><Detail label="Created" value={new Date(branch.createdAt).toLocaleDateString()} /></div><Detail label="Address" value={locationLine(branch) || "Not set"} /><div className="grid grid-cols-3 gap-3"><Metric icon={<Package size={16} />} label="Today&apos;s Sales" value={money(branch.todaySales)} /><Metric icon={<Users size={16} />} label="Staff" value={String(branch.staffCount)} /><Metric icon={<Package size={16} />} label="Inventory" value={branch.inventoryCount.toLocaleString()} /></div>{branch.notes ? <Detail label="Notes" value={branch.notes} /> : null}</div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-sm font-medium text-slate-800">{value}</p></div>;
}
