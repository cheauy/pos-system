"use client";

import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Ellipsis,
  MapPin,
  Package,
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
  BRANCH_WEEK_DAYS,
  defaultBranchOpeningHours,
  formatBranchOpeningHoursSummary,
  parseBranchOpeningHours,
  serializeBranchOpeningHours,
  type BranchOpeningHoursSchedule,
  type BranchWeekDay,
} from "@/lib/branches/opening-hours";

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
  branchCapacity: { used: number; limit: number; locked: boolean };
};

type ModalState =
  | { type: "view"; branch: BranchViewModel }
  | { type: "edit"; branch: BranchViewModel }
  | { type: "delete"; branch: BranchViewModel }
  | null;

const inputClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const textareaClass =
  "min-h-24 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

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
  branchCapacity,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [sort, setSort] = useState("name-asc");
  const [cityFilter, setCityFilter] = useState("all");
  const [managerFilter, setManagerFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [notice, setNotice] = useState<BranchActionResult | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const activeBranches = branches.filter((branch) => branch.isActive);
  const inactiveBranches = branches.filter((branch) => !branch.isActive);
  const defaultBranch = branches.find((branch) => branch.isDefault);
  const totalStaff = branches.reduce((sum, branch) => sum + branch.staffCount, 0);
  const totalInventory = branches.reduce(
    (sum, branch) => sum + branch.inventoryCount,
    0,
  );

  const cities = useMemo(
    () =>
      Array.from(new Set(branches.map((branch) => branch.city).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [branches],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const next = branches.filter((branch) => {
      const matchesStatus =
        status === "all" ||
        (status === "active" && branch.isActive) ||
        (status === "inactive" && !branch.isActive);
      if (!matchesStatus) return false;
      if (cityFilter !== "all" && branch.city !== cityFilter) return false;
      if (managerFilter !== "all" && branch.managerUserId !== managerFilter) return false;
      if (!term) return true;
      return [
        branch.name,
        branch.code,
        branch.city,
        branch.stateRegion,
        branch.managerName,
        branch.address,
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term));
    });

    return [...next].sort((a, b) => {
      if (sort === "name-desc") return b.name.localeCompare(a.name);
      if (sort === "sales-desc") return b.todaySales - a.todaySales;
      if (sort === "staff-desc") return b.staffCount - a.staffCount;
      return a.name.localeCompare(b.name);
    });
  }, [branches, cityFilter, managerFilter, search, sort, status]);

  const pageSize = 5;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  function finish(result: BranchActionResult) {
    setNotice(result);
    if (result.ok) {
      setModal(null);
      setMenuId(null);
      setCreateOpen(false);
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

  function archive(branch: BranchViewModel) {
    const data = new FormData();
    data.set("locationId", branch.id);
    data.set("active", "false");
    run(() => toggleLocation(data));
  }

  function confirmDelete(branch: BranchViewModel) {
    const data = new FormData();
    data.set("locationId", branch.id);
    run(() => deleteLocation(data));
  }

  return (
    <>
      <div className="space-y-5">
        <header className="space-y-1">
          <div className="text-xs font-medium text-slate-500">Settings &gt; Branches</div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Branches</h1>
          <p className="text-sm text-slate-500">
            Manage all your branches, staff assignment and branch settings for {businessName}.
          </p>
        </header>

        {notice ? (
          <div
            role="status"
            className={`rounded-2xl border px-4 py-3 text-sm ${
              notice.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {notice.message}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryCard
            icon={<Building2 size={20} />}
            label="Total Branches"
            value={String(branches.length)}
            sublabel="All locations"
            tone="blue"
          />
          <SummaryCard
            icon={<Check size={20} />}
            label="Active Branches"
            value={`${branchCapacity.used}/${branchCapacity.limit} used`}
            sublabel={branchCapacity.locked || branchCapacity.used >= branchCapacity.limit ? 'No available branches' : `${branchCapacity.limit - branchCapacity.used} branches available`}
            tone="green"
          />
          <SummaryCard
            icon={<Users size={20} />}
            label="Staff Assigned"
            value={String(totalStaff)}
            sublabel="Across all branches"
            tone="blue"
          />
          <SummaryCard
            icon={<Package size={20} />}
            label="Inventory Units"
            value={totalInventory.toLocaleString()}
            sublabel="Total in stock"
            tone="violet"
          />
          <SummaryCard
            icon={<Star size={20} />}
            label="Default Branch"
            value={defaultBranch?.name ?? "Not set"}
            sublabel="Primary location"
            tone="amber"
            compact
          />
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-100 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <TabButton
                active={status === "all"}
                onClick={() => {
                  setStatus("all");
                  setPage(1);
                }}
              >
                All ({branches.length})
              </TabButton>
              <TabButton
                active={status === "active"}
                onClick={() => {
                  setStatus("active");
                  setPage(1);
                }}
              >
                Active ({activeBranches.length})
              </TabButton>
              <TabButton
                active={status === "inactive"}
                onClick={() => {
                  setStatus("inactive");
                  setPage(1);
                }}
              >
                Inactive ({inactiveBranches.length})
              </TabButton>
            </div>

            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              disabled={isPending || branchCapacity.locked || branchCapacity.used >= branchCapacity.limit}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              <Plus size={18} /> {branchCapacity.locked || branchCapacity.used >= branchCapacity.limit ? 'Not available branch' : 'Add Branch'}
            </button>
          </div>

          <div className="grid gap-3 border-b border-slate-100 px-4 py-4 lg:grid-cols-[minmax(240px,1fr)_170px_180px_180px]">
            <label className="relative">
              <Search
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
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
              value={cityFilter}
              onChange={(event) => {
                setCityFilter(event.target.value);
                setPage(1);
              }}
              className={inputClass}
            >
              <option value="all">All Cities</option>
              {cities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>

            <select
              value={managerFilter}
              onChange={(event) => {
                setManagerFilter(event.target.value);
                setPage(1);
              }}
              className={inputClass}
            >
              <option value="all">All Managers</option>
              {managerOptions.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.name}
                </option>
              ))}
            </select>

            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              className={inputClass}
            >
              <option value="name-asc">Sort: Name (A–Z)</option>
              <option value="name-desc">Sort: Name (Z–A)</option>
              <option value="sales-desc">Sort: Today&apos;s sales</option>
              <option value="staff-desc">Sort: Staff assigned</option>
            </select>
          </div>

          <div className="space-y-4 p-4">
            {visible.length === 0 ? (
              <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 text-center">
                <Store size={42} className="text-slate-300" />
                <p className="mt-3 font-semibold text-slate-700">No branches found</p>
                <p className="mt-1 text-sm text-slate-500">
                  Try another search or create a new branch.
                </p>
              </div>
            ) : (
              visible.map((branch) => (
                <article
                  key={branch.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex min-w-0 gap-4">
                      <div className="relative flex h-24 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-slate-100 via-white to-blue-50 text-blue-600 shadow-inner">
                        <Building2 size={34} />
                        {branch.isDefault ? (
                          <span className="absolute left-2 top-2 rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white">
                            Default
                          </span>
                        ) : null}
                      </div>

                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-lg font-bold text-slate-950">
                            {branch.name}
                          </h3>
                          <Badge tone={branch.isActive ? "green" : "gray"}>
                            {branch.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>

                        <p className="text-xs font-medium text-slate-500">
                          Code: {branch.code}
                        </p>

                        {locationLine(branch) ? (
                          <div className="flex items-start gap-1.5 text-sm text-slate-600">
                            <MapPin size={15} className="mt-0.5 shrink-0" />
                            <span>{locationLine(branch)}</span>
                          </div>
                        ) : null}

                        <div className="flex flex-wrap gap-2">
                          <InlineStat
                            icon={<UserRound size={14} />}
                            value={branch.managerName || "No manager assigned"}
                            tone="amber"
                          />
                          <InlineStat
                            icon={<Users size={14} />}
                            value={`${branch.staffCount} staff`}
                            tone="blue"
                          />
                          <InlineStat
                            icon={<Package size={14} />}
                            value={`${branch.inventoryCount} products`}
                            tone="violet"
                          />
                          <InlineStat
                            icon={<Clock3 size={14} />}
                            value={formatBranchOpeningHoursSummary(branch.openingHours)}
                            tone="slate"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="relative flex shrink-0 items-start gap-2">
                      <button
                        type="button"
                        onClick={() => setModal({ type: "view", branch })}
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                      >
                        View Details
                      </button>
                      <button
                        type="button"
                        onClick={() => setMenuId(menuId === branch.id ? null : branch.id)}
                        aria-label={`Actions for ${branch.name}`}
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                      >
                        <Ellipsis size={18} />
                      </button>

                      {menuId === branch.id ? (
                        <div className="absolute right-0 top-12 z-20 w-44 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
                          <MenuButton
                            onClick={() => {
                              setModal({ type: "view", branch });
                              setMenuId(null);
                            }}
                          >
                            View
                          </MenuButton>
                          <MenuButton
                            onClick={() => {
                              setModal({ type: "edit", branch });
                              setMenuId(null);
                            }}
                          >
                            Edit
                          </MenuButton>
                          {!branch.isDefault && branch.isActive ? (
                            <MenuButton
                              onClick={() => {
                                makeDefault(branch);
                                setMenuId(null);
                              }}
                            >
                              Make default
                            </MenuButton>
                          ) : null}
                          {branch.isActive ? (
                            <MenuButton
                              onClick={() => {
                                archive(branch);
                                setMenuId(null);
                              }}
                            >
                              Deactivate
                            </MenuButton>
                          ) : (
                            <MenuButton
                              onClick={() => {
                                reactivate(branch);
                                setMenuId(null);
                              }}
                            >
                              Reactivate
                            </MenuButton>
                          )}
                          <MenuButton
                            danger
                            onClick={() => {
                              setModal({ type: "delete", branch });
                              setMenuId(null);
                            }}
                          >
                            Delete
                          </MenuButton>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-2 xl:grid-cols-5">
                    <MetricCard
                      icon={<Store size={16} />}
                      label="Today&apos;s Sales"
                      value={money(branch.todaySales)}
                    />
                    <MetricCard
                      icon={<Package size={16} />}
                      label="Orders"
                      value="0"
                    />
                    <MetricCard
                      icon={<Package size={16} />}
                      label="Inventory"
                      value={`${branch.inventoryCount} units`}
                    />
                    <MetricCard
                      icon={<Clock3 size={16} />}
                      label="Opening Hours"
                      value={formatBranchOpeningHoursSummary(branch.openingHours)}
                    />
                    <MetricCard
                      icon={<MapPin size={16} />}
                      label="Timezone"
                      value={branch.timezone || "—"}
                    />
                  </div>
                </article>
              ))
            )}
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 text-xs text-slate-500">
            <span>
              Showing {visible.length} of {filtered.length} branches
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-blue-600 px-2 font-semibold text-white">
                {safePage}
              </span>
              <button
                type="button"
                disabled={safePage >= pageCount}
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </section>
      </div>

      <Sheet
        title="Add New Branch"
        subtitle="Create a new branch for your business."
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      >
        <form onSubmit={submitCreate} className="space-y-5">
          <FormSection title="Branch Information">
            <Field label="Branch name" required>
              <input
                name="name"
                required
                maxLength={100}
                placeholder="e.g. Toul Kork Branch"
                className={inputClass}
              />
            </Field>
            <Field label="Branch code" required>
              <input
                name="code"
                required
                maxLength={20}
                placeholder="e.g. TK01"
                className={inputClass}
              />
            </Field>
            <Field label="Phone">
              <input
                name="phone"
                placeholder="+855 12 345 678"
                className={inputClass}
              />
            </Field>
          </FormSection>

          <FormSection title="Location">
            <Field label="Street address">
              <input name="address" placeholder="Street address" className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="City">
                <input name="city" placeholder="Phnom Penh" className={inputClass} />
              </Field>
              <Field label="State / Province">
                <input
                  name="stateRegion"
                  placeholder="Phnom Penh"
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="Timezone">
              <select
                name="timezone"
                defaultValue="Asia/Phnom_Penh"
                className={inputClass}
              >
                <option value="Asia/Phnom_Penh">Asia/Phnom Penh</option>
                <option value="Asia/Bangkok">Asia/Bangkok</option>
                <option value="Asia/Singapore">Asia/Singapore</option>
                <option value="Asia/Tokyo">Asia/Tokyo</option>
                <option value="UTC">UTC</option>
              </select>
            </Field>
          </FormSection>

          <FormSection title="Operations">
            <BranchOpeningHoursEditor />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Manager">
                <select name="managerUserId" defaultValue="" className={inputClass}>
                  <option value="">No manager assigned</option>
                  {managerOptions.map((manager) => (
                    <option key={manager.id} value={manager.id}>
                      {manager.name} · {manager.role}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                <p className="font-medium text-slate-800">Status</p>
                <p className="mt-1 text-xs text-slate-500">
                  New branches are created as active.
                </p>
              </div>
            </div>
            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <input
                type="checkbox"
                name="makeDefault"
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              <span>
                <span className="block font-semibold text-slate-800">
                  Set as default branch
                </span>
                <span className="text-xs text-slate-500">
                  New POS activity will prefer this location.
                </span>
              </span>
            </label>
          </FormSection>

          <FormSection title="Notes">
            <textarea
              name="notes"
              maxLength={500}
              placeholder="Additional notes about this branch..."
              className={textareaClass}
            />
          </FormSection>

          <div className="sticky bottom-0 -mx-5 flex items-center justify-end gap-2 border-t border-slate-100 bg-white px-5 py-4">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              disabled={isPending}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
            >
              <Plus size={17} /> {isPending ? "Saving…" : "Create Branch"}
            </button>
          </div>
        </form>
      </Sheet>

      {modal?.type === "view" ? (
        <Modal title={modal.branch.name} onClose={() => setModal(null)}>
          <BranchDetails branch={modal.branch} />
        </Modal>
      ) : null}

      {modal?.type === "edit" ? (
        <Modal title={`Edit ${modal.branch.name}`} onClose={() => setModal(null)} wide>
          <form onSubmit={submitEdit} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="locationId" value={modal.branch.id} />
            <Field label="Branch name" required>
              <input
                name="name"
                required
                defaultValue={modal.branch.name}
                className={inputClass}
              />
            </Field>
            <Field label="Branch code" required>
              <input
                name="code"
                required
                defaultValue={modal.branch.code}
                className={inputClass}
              />
            </Field>
            <Field label="Phone">
              <input
                name="phone"
                defaultValue={modal.branch.phone}
                className={inputClass}
              />
            </Field>
            <Field label="Manager">
              <select
                name="managerUserId"
                defaultValue={modal.branch.managerUserId}
                className={inputClass}
              >
                <option value="">No manager assigned</option>
                {managerOptions.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.name} · {manager.role}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Address">
                <input
                  name="address"
                  defaultValue={modal.branch.address}
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="City">
              <input name="city" defaultValue={modal.branch.city} className={inputClass} />
            </Field>
            <Field label="State / Province">
              <input
                name="stateRegion"
                defaultValue={modal.branch.stateRegion}
                className={inputClass}
              />
            </Field>
            <div className="sm:col-span-2">
              <BranchOpeningHoursEditor
                key={modal.branch.id}
                initialValue={modal.branch.openingHours}
              />
            </div>
            <Field label="Timezone">
              <select
                name="timezone"
                defaultValue={modal.branch.timezone || "Asia/Phnom_Penh"}
                className={inputClass}
              >
                <option value="Asia/Phnom_Penh">Asia/Phnom Penh</option>
                <option value="Asia/Bangkok">Asia/Bangkok</option>
                <option value="Asia/Singapore">Asia/Singapore</option>
                <option value="Asia/Tokyo">Asia/Tokyo</option>
                <option value="UTC">UTC</option>
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notes">
                <textarea
                  name="notes"
                  defaultValue={modal.branch.notes}
                  className={textareaClass}
                />
              </Field>
            </div>
            {!modal.branch.isDefault ? (
              <label className="sm:col-span-2 flex items-start gap-3 rounded-xl bg-blue-50 p-3 text-sm">
                <input
                  type="checkbox"
                  name="makeDefault"
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"
                />
                <span>
                  <span className="block font-semibold text-blue-900">
                    Make this the default branch
                  </span>
                  <span className="text-xs text-blue-700">
                    TENH switches the default atomically so the business is never left
                    without one.
                  </span>
                </span>
              </label>
            ) : null}
            {!modal.branch.isActive ? (
              <div className="sm:col-span-2 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div>
                  <p className="text-sm font-semibold text-amber-900">
                    This branch is inactive
                  </p>
                  <p className="text-xs text-amber-700">
                    Reactivate it to use it for new POS activity.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => reactivate(modal.branch)}
                  className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white"
                >
                  Reactivate
                </button>
              </div>
            ) : null}
            <div className="sm:col-span-2 flex justify-end gap-2 border-t pt-4">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-lg border px-4 py-2 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                disabled={isPending}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {modal?.type === "delete" ? (
        <Modal title="Delete branch?" onClose={() => setModal(null)}>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-semibold">{modal.branch.name}</p>
            <p className="mt-1">
              TENH will never delete the last active branch or the default branch.
              Stock must be zero and pending transfers/register shifts must be finished
              first.
            </p>
            <p className="mt-2">
              If this branch has historical orders or finance records, TENH will safely
              archive it instead of destroying history.
            </p>
          </div>
          {modal.branch.isDefault ? (
            <p className="mt-3 text-sm font-medium text-amber-700">
              Make another active branch the default before deleting this one.
            </p>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setModal(null)}
              className="rounded-lg border px-4 py-2 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isPending || modal.branch.isDefault}
              onClick={() => confirmDelete(modal.branch)}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Trash2 size={16} /> {isPending ? "Checking…" : "Delete safely"}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-700">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  sublabel,
  tone,
  compact = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel: string;
  tone: "blue" | "green" | "amber" | "violet";
  compact?: boolean;
}) {
  const toneClass =
    tone === "green"
      ? "bg-emerald-50 text-emerald-600"
      : tone === "amber"
        ? "bg-amber-50 text-amber-600"
        : tone === "violet"
          ? "bg-violet-50 text-violet-600"
          : "bg-blue-50 text-blue-600";
  return (
    <div className="flex min-h-28 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${toneClass}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p
          className={`${compact ? "truncate text-xl" : "text-2xl"} mt-0.5 font-bold text-slate-950`}
        >
          {value}
        </p>
        <p className="mt-1 text-xs text-slate-500">{sublabel}</p>
      </div>
    </div>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: "blue" | "green" | "gray";
  children: React.ReactNode;
}) {
  const styles =
    tone === "green"
      ? "bg-emerald-100 text-emerald-700"
      : tone === "blue"
        ? "bg-blue-100 text-blue-700"
        : "bg-slate-100 text-slate-600";
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${styles}`}>
      {children}
    </span>
  );
}

function InlineStat({
  icon,
  value,
  tone,
}: {
  icon: React.ReactNode;
  value: string;
  tone: "amber" | "blue" | "violet" | "slate";
}) {
  const toneClass =
    tone === "amber"
      ? "bg-amber-50 text-amber-700"
      : tone === "blue"
        ? "bg-blue-50 text-blue-700"
        : tone === "violet"
          ? "bg-violet-50 text-violet-700"
          : "bg-slate-100 text-slate-700";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${toneClass}`}
    >
      {icon}
      {value}
    </span>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-3">
      <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
        <span className="text-blue-600">{icon}</span>
        {label}
      </div>
      <p className="mt-1 text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
        active
          ? "bg-blue-600 text-white shadow-sm"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function MenuButton({
  onClick,
  danger = false,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-medium hover:bg-slate-50 ${danger ? "text-red-600" : "text-slate-700"}`}
    >
      {children}
    </button>
  );
}

function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4">
      <button type="button" aria-label="Close" className="absolute inset-0" onClick={onClose} />
      <section
        className={`relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white shadow-2xl ${wide ? "max-w-3xl" : "max-w-xl"}`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4">
          <h2 className="text-lg font-bold text-slate-950">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </section>
    </div>
  );
}

function Sheet({
  title,
  subtitle,
  open,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-slate-950/30">
      <button type="button" aria-label="Close" className="absolute inset-0" onClick={onClose} />
      <aside className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
        <div className="sticky top-0 z-10 border-b bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-slate-950">{title}</h2>
              {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-slate-100"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </div>
  );
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}


const branchDayLabels: Record<BranchWeekDay, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

function BranchOpeningHoursEditor({ initialValue = "" }: { initialValue?: string }) {
  const [schedule, setSchedule] = useState<BranchOpeningHoursSchedule>(() =>
    parseBranchOpeningHours(initialValue) ?? defaultBranchOpeningHours(),
  );

  function updateDay(day: BranchWeekDay, change: Partial<BranchOpeningHoursSchedule["days"][BranchWeekDay]>) {
    setSchedule((current) => ({
      ...current,
      days: {
        ...current.days,
        [day]: { ...current.days[day], ...change },
      },
    }));
  }

  function copyMondayToAll() {
    const monday = schedule.days.monday;
    setSchedule((current) => ({
      ...current,
      days: Object.fromEntries(
        BRANCH_WEEK_DAYS.map((day) => [day, { ...monday }]),
      ) as BranchOpeningHoursSchedule["days"],
    }));
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <input
        type="hidden"
        name="openingHours"
        value={serializeBranchOpeningHours(schedule)}
        readOnly
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Opening hours</p>
          <p className="mt-1 text-xs text-slate-500">
            Set the opening and closing time for each day.
          </p>
        </div>
        <button
          type="button"
          onClick={copyMondayToAll}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-blue-200 hover:text-blue-700"
        >
          Copy Monday to all
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {BRANCH_WEEK_DAYS.map((day) => {
          const value = schedule.days[day];
          return (
            <div
              key={day}
              className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[110px_90px_minmax(0,1fr)_minmax(0,1fr)] sm:items-center"
            >
              <span className="text-sm font-semibold text-slate-800">
                {branchDayLabels[day]}
              </span>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={!value.closed}
                  onChange={(event) => updateDay(day, { closed: !event.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                />
                {value.closed ? "Closed" : "Open"}
              </label>
              <label className="grid grid-cols-[36px_minmax(0,1fr)] items-center gap-2 text-xs text-slate-500">
                <span>From</span>
                <input
                  type="time"
                  value={value.open}
                  disabled={value.closed}
                  onChange={(event) => updateDay(day, { open: event.target.value })}
                  className={`${inputClass} disabled:bg-slate-100 disabled:text-slate-400`}
                />
              </label>
              <label className="grid grid-cols-[22px_minmax(0,1fr)] items-center gap-2 text-xs text-slate-500">
                <span>To</span>
                <input
                  type="time"
                  value={value.close}
                  disabled={value.closed}
                  onChange={(event) => updateDay(day, { close: event.target.value })}
                  className={`${inputClass} disabled:bg-slate-100 disabled:text-slate-400`}
                />
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BranchDetails({ branch }: { branch: BranchViewModel }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={branch.isActive ? "green" : "gray"}>
          {branch.isActive ? "Active" : "Disabled"}
        </Badge>
        {branch.isDefault ? <Badge tone="blue">Default</Badge> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Detail label="Code" value={branch.code} />
        <Detail label="Manager" value={branch.managerName || "Not assigned"} />
        <Detail label="Phone" value={branch.phone || "Not set"} />
        <Detail label="Opening hours" value={formatBranchOpeningHoursSummary(branch.openingHours)} />
        <Detail label="Timezone" value={branch.timezone || "Not set"} />
        <Detail label="Created" value={new Date(branch.createdAt).toLocaleDateString()} />
      </div>
      <Detail label="Address" value={locationLine(branch) || "Not set"} />
      <div className="grid grid-cols-3 gap-3">
        <MetricCard
          icon={<Store size={16} />}
          label="Today&apos;s Sales"
          value={money(branch.todaySales)}
        />
        <MetricCard
          icon={<Users size={16} />}
          label="Staff"
          value={String(branch.staffCount)}
        />
        <MetricCard
          icon={<Package size={16} />}
          label="Inventory"
          value={branch.inventoryCount.toLocaleString()}
        />
      </div>
      {branch.notes ? <Detail label="Notes" value={branch.notes} /> : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}
