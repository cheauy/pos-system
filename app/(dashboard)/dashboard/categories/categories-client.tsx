"use client";

import CategoryBranchesDialog from "./category-branches-dialog";
import { useRouter } from "next/navigation";
import {
  Box,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Folder,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  bulkCategoryAction,
  createCategory,
  deleteCategoryById,
  repairCategoryIndexes,
  setCategoryOnline,
  updateCategory,
} from "./actions";

export type CategoryViewModel = {
  id: string;
  name: string;
  description: string | null;
  isOnline: boolean;
  index: number;
  productCount: number;
  createdAt: string;
  branchIds: string[] | null;
};

type StatusFilter = "all" | "visible" | "hidden";
type BulkAction = "" | "show" | "hide" | "delete";

const PAGE_SIZE = 10;

function StatusPill({ online }: { online: boolean }) {
  return online ? (
    <span className="inline-flex items-center rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
      Active
    </span>
  ) : (
    <span className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">
      Hidden
    </span>
  );
}

function StatCard({
  icon,
  value,
  label,
  accent,
}: {
  icon: ReactNode;
  value: number;
  label: string;
  accent: "blue" | "violet" | "green" | "red";
}) {
  const classes = {
    blue: "bg-blue-50 text-blue-600",
    violet: "bg-violet-50 text-violet-600",
    green: "bg-emerald-50 text-emerald-600",
    red: "bg-rose-50 text-rose-500",
  }[accent];

  return (
    <div className="flex min-h-28 items-center gap-5 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className={`grid size-14 shrink-0 place-items-center rounded-2xl ${classes}`}>
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold tracking-tight text-slate-950">
          {value.toLocaleString()}
        </div>
        <div className="mt-1 text-sm font-medium text-slate-600">{label}</div>
      </div>
    </div>
  );
}

export default function CategoriesClient({
  categories,
  totalProducts,
  loadError, branches,
}: {
  categories: CategoryViewModel[];
  branches: {id:string;name:string}[];
  totalProducts: number;
  loadError: string | null;
}) {
  const router = useRouter();
  const createFormRef = useRef<HTMLFormElement>(null);
  const repairRequestedRef = useRef(false);
  const [isPending, startTransition] = useTransition();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<BulkAction>("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [branchCategory,setBranchCategory]=useState<CategoryViewModel|null>(null);
  const [editing, setEditing] = useState<CategoryViewModel | null>(null);
  const [deleting, setDeleting] = useState<CategoryViewModel | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(loadError ? { type: "error", text: loadError } : null);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");

  const visibleCount = categories.filter((category) => category.isOnline).length;
  const hiddenCount = categories.length - visibleCount;

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    let result = categories.filter((category) => {
      const searchMatch =
        !normalizedQuery ||
        category.name.toLowerCase().includes(normalizedQuery) ||
        (category.description ?? "").toLowerCase().includes(normalizedQuery);
      const statusMatch =
        statusFilter === "all" ||
        (statusFilter === "visible" && category.isOnline) ||
        (statusFilter === "hidden" && !category.isOnline);
      return searchMatch && statusMatch;
    });

    result = [...result].sort(
      (a, b) => a.index - b.index || a.name.localeCompare(b.name),
    );

    return result;
  }, [categories, query, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const paginated = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const pageIds = paginated.map((category) => category.id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));

  const nextIndex =
    categories.reduce((highest, category) => Math.max(highest, category.index), 0) + 1;

  useEffect(() => {
    if (repairRequestedRef.current || categories.length < 2) return;

    const indexes = categories.map((category) => category.index);
    const hasDuplicateIndexes = new Set(indexes).size !== indexes.length;
    const hasInvalidIndexes = indexes.some((index) => !Number.isInteger(index) || index < 1);

    if (!hasDuplicateIndexes && !hasInvalidIndexes) return;

    repairRequestedRef.current = true;
    startTransition(async () => {
      try {
        const result = await repairCategoryIndexes();
        if (result.ok) {
          router.refresh();
        } else {
          setMessage({ type: "error", text: result.message });
        }
      } catch (error) {
        setMessage({
          type: "error",
          text: error instanceof Error ? error.message : "Unable to repair category indexes.",
        });
      }
    });
  }, [categories, router]);

  useEffect(() => {
    if (!openMenuId) return;

    const closeMenu = () => {
      setOpenMenuId(null);
      setMenuPosition(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenuId]);

  function toggleActionMenu(categoryId: string, button: HTMLButtonElement) {
    if (openMenuId === categoryId) {
      setOpenMenuId(null);
      setMenuPosition(null);
      return;
    }

    const rect = button.getBoundingClientRect();
    const menuWidth = 176;
    const menuHeight = 148;
    const viewportPadding = 12;
    const gap = 6;
    const left = Math.min(
      window.innerWidth - menuWidth - viewportPadding,
      Math.max(viewportPadding, rect.right - menuWidth),
    );
    const hasRoomBelow =
      window.innerHeight - rect.bottom >= menuHeight + gap + viewportPadding;
    const top = hasRoomBelow
      ? rect.bottom + gap
      : Math.max(viewportPadding, rect.top - menuHeight - gap);

    setOpenMenuId(categoryId);
    setMenuPosition({ top, left });
  }

  function showResult(result: { ok: boolean; message: string }) {
    setMessage({ type: result.ok ? "success" : "error", text: result.message });
    if (result.ok) router.refresh();
  }

  function runAction(task: () => Promise<{ ok: boolean; message: string }>) {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await task();
        showResult(result);
      } catch (error) {
        setMessage({
          type: "error",
          text: error instanceof Error ? error.message : "Something went wrong.",
        });
      }
    });
  }

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setMessage(null);

    startTransition(async () => {
      try {
        const result = await createCategory(formData);
        showResult(result);
        if (result.ok) {
          form.reset();
          setCreateName("");
          setCreateDescription("");
        }
      } catch (error) {
        setMessage({
          type: "error",
          text: error instanceof Error ? error.message : "Unable to create category.",
        });
      }
    });
  }

  function handleEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const result = await updateCategory(formData);
        showResult(result);
        if (result.ok) setEditing(null);
      } catch (error) {
        setMessage({
          type: "error",
          text: error instanceof Error ? error.message : "Unable to update category.",
        });
      }
    });
  }

  function handleBulkApply() {
    if (!bulkAction) {
      setMessage({ type: "error", text: "Choose a bulk action first." });
      return;
    }
    if (!selectedIds.length) {
      setMessage({ type: "error", text: "Select at least one category." });
      return;
    }
    if (
      bulkAction === "delete" &&
      !window.confirm(
        `Delete ${selectedIds.length} selected categories? Products will be kept as uncategorized.`,
      )
    ) {
      return;
    }

    runAction(async () => {
      const result = await bulkCategoryAction(selectedIds, bulkAction);
      if (result.ok) {
        setSelectedIds([]);
        setBulkAction("");
      }
      return result;
    });
  }



  return (
    <main className="space-y-5 pb-8">
      {message ? (
        <div
          className={`flex items-start justify-between gap-4 rounded-xl border px-4 py-3 text-sm font-medium ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === "success" ? <Check size={17} /> : <X size={17} />}
            <span>{message.text}</span>
          </div>
          <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss message">
            <X size={16} />
          </button>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Categories</h1>
          <p className="mt-1 text-sm text-slate-500">
            Organize your products into categories to make them easier to find and manage.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:items-center">
          <div className="relative w-full lg:w-72 xl:w-80">
            <Search
              size={18}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search categories..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
            />
          </div>

          <label className="relative shrink-0">
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as StatusFilter);
                setPage(1);
              }}
              className="h-11 appearance-none rounded-xl border border-slate-200 bg-white py-0 pl-4 pr-10 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-400"
            >
              <option value="all">All Status</option>
              <option value="visible">Active</option>
              <option value="hidden">Hidden</option>
            </select>
            <ChevronDown
              size={16}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
            />
          </label>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Folder size={26} />} value={categories.length} label="Total Categories" accent="blue" />
        <StatCard icon={<Box size={26} />} value={totalProducts} label="Total Products" accent="violet" />
        <StatCard icon={<Eye size={26} />} value={visibleCount} label="Visible Online" accent="green" />
        <StatCard icon={<EyeOff size={26} />} value={hiddenCount} label="Hidden Online" accent="red" />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[350px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Add New Category</h2>
              <p className="mt-1 text-sm text-slate-500">Create a category to organize your products.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                createFormRef.current?.reset();
                setCreateName("");
                setCreateDescription("");
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>

          <form ref={createFormRef} onSubmit={handleCreate} className="mt-6 space-y-5">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label htmlFor="category-name" className="text-sm font-semibold text-slate-800">
                  Category name <span className="text-rose-500">*</span>
                </label>
              </div>
              <input
                id="category-name"
                name="name"
                required
                minLength={2}
                maxLength={50}
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder="e.g. Drinks"
                className="h-11 w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              />
              <div className="mt-1.5 text-right text-xs text-slate-400">{createName.length}/50</div>
            </div>

            <div>
              <label htmlFor="category-description" className="mb-2 block text-sm font-semibold text-slate-800">
                Description
              </label>
              <textarea
                id="category-description"
                name="description"
                rows={4}
                maxLength={200}
                value={createDescription}
                onChange={(event) => setCreateDescription(event.target.value)}
                placeholder="Optional description..."
                className="w-full resize-none rounded-xl border border-slate-300 px-3.5 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              />
              <div className="mt-1.5 text-right text-xs text-slate-400">{createDescription.length}/200</div>
            </div>

            <div>
              <div className="mb-3 text-sm font-semibold text-slate-800">Display settings</div>
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                <label className="flex items-start gap-3 opacity-80">
                  <input type="checkbox" checked readOnly disabled className="mt-0.5 size-4 rounded border-slate-300" />
                  <span>
                    <span className="block text-sm font-semibold text-slate-800">Show on POS</span>
                    <span className="mt-0.5 block text-xs text-slate-500">Categories are available in POS by default.</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    name="isOnline"
                    defaultChecked
                    className="mt-0.5 size-4 rounded border-slate-300 accent-blue-600"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-800">Show on Online Store</span>
                    <span className="mt-0.5 block text-xs text-slate-500">Display this category on your website menu.</span>
                  </span>
                </label>
              </div>
            </div>

            <div>
              <label htmlFor="category-index" className="mb-2 block text-sm font-semibold text-slate-800">
                Index
              </label>
              <input
                id="category-index"
                name="index"
                type="number"
                min={1}
                max={9999}
                defaultValue={nextIndex}
                className="h-11 w-full rounded-xl border border-slate-300 px-3.5 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              />
              <p className="mt-1.5 text-xs text-slate-500">Lower index appears first. Example: 1 shows before 2.</p>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus size={18} />
              {isPending ? "Saving..." : "Create Category"}
            </button>
          </form>
        </section>

        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Category List</h2>
              <p className="mt-0.5 text-sm text-slate-500">Manage, edit, and organize your product categories.</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="relative">
                <select
                  value={bulkAction}
                  onChange={(event) => setBulkAction(event.target.value as BulkAction)}
                  className="h-10 appearance-none rounded-xl border border-slate-200 bg-white py-0 pl-3 pr-9 text-sm font-semibold text-slate-700 outline-none"
                >
                  <option value="">Bulk Actions</option>
                  <option value="show">Show Online</option>
                  <option value="hide">Hide Online</option>
                  <option value="delete">Delete</option>
                </select>
                <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
              </label>
              <button
                type="button"
                onClick={handleBulkApply}
                disabled={isPending || !selectedIds.length}
                className="h-10 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-200"
              >
                Apply
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-left">
              <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="w-12 px-4 py-3.5">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={(event) => {
                        if (event.target.checked) {
                          setSelectedIds((current) => Array.from(new Set([...current, ...pageIds])));
                        } else {
                          setSelectedIds((current) => current.filter((id) => !pageIds.includes(id)));
                        }
                      }}
                      className="size-4 rounded border-slate-300 accent-blue-600"
                      aria-label="Select current page"
                    />
                  </th>
                  <th className="w-20 px-3 py-3.5">Index</th>
                  <th className="px-3 py-3.5">Category Name</th>
                  <th className="px-3 py-3.5">Description</th>
                  <th className="w-24 px-3 py-3.5">Products</th>
                  <th className="w-24 px-3 py-3.5">Status</th>
                  <th className="w-36 px-3 py-3.5">Show In</th>
                  <th className="w-24 px-4 py-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginated.length ? (
                  paginated.map((category) => (
                    <tr key={category.id} className="text-sm text-slate-700 transition hover:bg-slate-50/70">
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(category.id)}
                          onChange={(event) => {
                            setSelectedIds((current) =>
                              event.target.checked
                                ? Array.from(new Set([...current, category.id]))
                                : current.filter((id) => id !== category.id),
                            );
                          }}
                          className="size-4 rounded border-slate-300 accent-blue-600"
                          aria-label={`Select ${category.name}`}
                        />
                      </td>
                      <td className="px-3 py-4 font-semibold text-slate-600">{category.index}</td>
                      <td className="px-3 py-4">
                        <div className="font-semibold text-slate-950">{category.name}</div>
                      </td>
                      <td className="max-w-72 px-3 py-4 text-slate-600">
                        <span className="line-clamp-2">{category.description || "No description"}</span>
                      </td>
                      <td className="px-3 py-4 font-semibold text-slate-700">{category.productCount}</td>
                      <td className="px-3 py-4"><StatusPill online={category.isOnline} /></td>
                      <td className="px-3 py-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">POS</span>
                          {category.isOnline ? (
                            <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">Online</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </div>
                      </td>
                      <td className="relative px-4 py-4 text-center">
                        <button
                          type="button"
                          onClick={(event) => toggleActionMenu(category.id, event.currentTarget)}
                          className="inline-grid size-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                          aria-label={`Actions for ${category.name}`}
                          aria-expanded={openMenuId === category.id}
                        >
                          <MoreHorizontal size={18} />
                        </button>

                        {openMenuId === category.id && menuPosition ? (
                          <>
                            <button
                              type="button"
                              className="fixed inset-0 z-[70] cursor-default"
                              onClick={() => {
                                setOpenMenuId(null);
                                setMenuPosition(null);
                              }}
                              aria-label="Close category menu"
                            />
                            <div
                              className="fixed z-[80] w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-2xl"
                              style={{ top: menuPosition.top, left: menuPosition.left }}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setEditing(category);
                                  setOpenMenuId(null);
                                  setMenuPosition(null);
                                }}
                                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                              >
                                <Pencil size={16} />
                                Edit
                              </button>
                              <button type="button" onClick={()=>{setBranchCategory(category);setOpenMenuId(null);setMenuPosition(null);}} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm hover:bg-slate-50"><Folder size={16}/>Apply to branches</button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  setMenuPosition(null);
                                  runAction(() => setCategoryOnline(category.id, !category.isOnline));
                                }}
                                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                              >
                                {category.isOnline ? <EyeOff size={16} /> : <Eye size={16} />}
                                {category.isOnline ? "Hide" : "Show"}
                              </button>
                              <div className="my-1 border-t border-slate-100" />
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleting(category);
                                  setOpenMenuId(null);
                                  setMenuPosition(null);
                                }}
                                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                              >
                                <Trash2 size={16} />
                                Delete
                              </button>
                            </div>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center">
                      <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-500">
                        <Package size={22} />
                      </div>
                      <div className="mt-3 font-semibold text-slate-800">No categories found</div>
                      <div className="mt-1 text-sm text-slate-500">Try changing your search or create a new category.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              {filtered.length
                ? `Showing ${pageStart + 1} to ${Math.min(pageStart + PAGE_SIZE, filtered.length)} of ${filtered.length} categories`
                : "Showing 0 categories"}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={currentPage <= 1}
                className="grid size-9 place-items-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft size={17} />
              </button>
              <span className="grid size-9 place-items-center rounded-xl bg-blue-600 text-sm font-semibold text-white">{currentPage}</span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                disabled={currentPage >= pageCount}
                className="grid size-9 place-items-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight size={17} />
              </button>
              <span className="ml-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600">10 / page</span>
            </div>
          </div>
        </section>
      </div>

      {branchCategory && <CategoryBranchesDialog category={branchCategory} branches={branches} onClose={()=>setBranchCategory(null)}/>}
      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]">
          <button type="button" className="absolute inset-0" onClick={() => setEditing(null)} aria-label="Close edit dialog" />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-bold text-slate-950">Edit Category</h3>
                <p className="mt-0.5 text-sm text-slate-500">Update category details and visibility.</p>
              </div>
              <button type="button" onClick={() => setEditing(null)} className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleEdit} className="space-y-5 p-5">
              <input type="hidden" name="categoryId" value={editing.id} />
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-800">Category name <span className="text-rose-500">*</span></label>
                <input name="name" required minLength={2} maxLength={50} defaultValue={editing.name} className="h-11 w-full rounded-xl border border-slate-300 px-3.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-800">Description</label>
                <textarea name="description" rows={4} maxLength={200} defaultValue={editing.description ?? ""} className="w-full resize-none rounded-xl border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50" />
              </div>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-3">
                <input type="checkbox" name="isOnline" defaultChecked={editing.isOnline} className="size-4 accent-blue-600" />
                <span className="text-sm font-semibold text-slate-800">Show Online</span>
              </label>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-800">Index</label>
                <input name="index" type="number" min={1} max={9999} defaultValue={editing.index} className="h-11 w-full rounded-xl border border-slate-300 px-3.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50" />
                <p className="mt-1.5 text-xs text-slate-500">Lower index appears first.</p>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => setEditing(null)} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={isPending} className="h-10 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{isPending ? "Saving..." : "Save Changes"}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleting ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]">
          <button type="button" className="absolute inset-0" onClick={() => setDeleting(null)} aria-label="Close delete dialog" />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="grid size-12 place-items-center rounded-2xl bg-rose-50 text-rose-600"><Trash2 size={22} /></div>
            <h3 className="mt-4 text-lg font-bold text-slate-950">Delete {deleting.name}?</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              This category will be deleted. Its {deleting.productCount} product{deleting.productCount === 1 ? "" : "s"} will be kept and moved to uncategorized.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleting(null)} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  const target = deleting;
                  setDeleting(null);
                  runAction(() => deleteCategoryById(target.id));
                }}
                className="h-10 rounded-xl bg-rose-600 px-5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                Delete Category
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
