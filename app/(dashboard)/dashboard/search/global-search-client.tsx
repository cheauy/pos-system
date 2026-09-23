"use client";

import Link from "next/link";
import {
  ArrowLeftRight,
  Banknote,
  Box,
  CalendarDays,
  CheckSquare,
  ChevronRight,
  FileText,
  Lightbulb,
  Loader2,
  PackageSearch,
  Search,
  Settings,
  ShoppingBag,
  Truck,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ElementType,
} from "react";

import { runGlobalSearch } from "./search-actions";
import type {
  GlobalSearchBranch,
  GlobalSearchKind,
  GlobalSearchResponse,
  GlobalSearchResult,
} from "./search-types";

type KindGroup = {
  key: string;
  label: string;
  kinds: GlobalSearchKind[];
  Icon: ElementType;
  tone: string;
  iconTone: string;
};

const groups: KindGroup[] = [
  {
    key: "all",
    label: "All",
    kinds: ["order", "product", "customer", "supplier", "purchase_order", "transfer", "credit", "setting"],
    Icon: CheckSquare,
    tone: "border-blue-100 bg-blue-50/80",
    iconTone: "bg-blue-100 text-blue-600",
  },
  {
    key: "orders",
    label: "Orders",
    kinds: ["order"],
    Icon: ShoppingBag,
    tone: "border-emerald-100 bg-white",
    iconTone: "bg-emerald-50 text-emerald-600",
  },
  {
    key: "products",
    label: "Products",
    kinds: ["product"],
    Icon: Box,
    tone: "border-violet-100 bg-white",
    iconTone: "bg-violet-50 text-violet-600",
  },
  {
    key: "customers",
    label: "Customers",
    kinds: ["customer"],
    Icon: Users,
    tone: "border-blue-100 bg-white",
    iconTone: "bg-blue-50 text-blue-600",
  },
  {
    key: "suppliers",
    label: "Suppliers",
    kinds: ["supplier"],
    Icon: Truck,
    tone: "border-orange-100 bg-white",
    iconTone: "bg-orange-50 text-orange-600",
  },
  {
    key: "purchase-orders",
    label: "Purchase Orders",
    kinds: ["purchase_order"],
    Icon: FileText,
    tone: "border-rose-100 bg-white",
    iconTone: "bg-rose-50 text-rose-600",
  },
  {
    key: "transfers",
    label: "Transfers",
    kinds: ["transfer"],
    Icon: ArrowLeftRight,
    tone: "border-cyan-100 bg-white",
    iconTone: "bg-cyan-50 text-cyan-600",
  },
  {
    key: "other",
    label: "Other",
    kinds: ["credit", "setting"],
    Icon: Settings,
    tone: "border-slate-200 bg-white",
    iconTone: "bg-slate-100 text-slate-600",
  },
];

const kindMeta: Record<GlobalSearchKind, { label: string; Icon: ElementType; iconClass: string; badgeClass: string }> = {
  order: { label: "Order", Icon: FileText, iconClass: "bg-rose-50 text-rose-600", badgeClass: "bg-blue-50 text-blue-600" },
  product: { label: "Product", Icon: Box, iconClass: "bg-violet-50 text-violet-600", badgeClass: "bg-violet-50 text-violet-600" },
  customer: { label: "Customer", Icon: UserRound, iconClass: "bg-blue-50 text-blue-600", badgeClass: "bg-blue-50 text-blue-600" },
  supplier: { label: "Supplier", Icon: Truck, iconClass: "bg-orange-50 text-orange-600", badgeClass: "bg-orange-50 text-orange-600" },
  purchase_order: { label: "Purchase Order", Icon: FileText, iconClass: "bg-emerald-50 text-emerald-600", badgeClass: "bg-emerald-50 text-emerald-600" },
  transfer: { label: "Transfer", Icon: ArrowLeftRight, iconClass: "bg-cyan-50 text-cyan-600", badgeClass: "bg-cyan-50 text-cyan-600" },
  credit: { label: "Credit", Icon: Banknote, iconClass: "bg-amber-50 text-amber-600", badgeClass: "bg-amber-50 text-amber-600" },
  setting: { label: "Setting", Icon: Settings, iconClass: "bg-slate-100 text-slate-600", badgeClass: "bg-slate-100 text-slate-600" },
};

const filterKinds: Array<{ kind: GlobalSearchKind; label: string }> = [
  { kind: "order", label: "Orders" },
  { kind: "product", label: "Products" },
  { kind: "customer", label: "Customers" },
  { kind: "supplier", label: "Suppliers" },
  { kind: "purchase_order", label: "Purchase Orders" },
  { kind: "transfer", label: "Transfers" },
  { kind: "credit", label: "Credit Accounts" },
  { kind: "setting", label: "Other" },
];

const allKinds = new Set<GlobalSearchKind>(filterKinds.map((item) => item.kind));

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function resultCount(results: GlobalSearchResult[], kinds: GlobalSearchKind[]) {
  const set = new Set(kinds);
  return results.filter((result) => set.has(result.kind)).length;
}

function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

export default function GlobalSearchClient({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [response, setResponse] = useState<GlobalSearchResponse>({
    query: "",
    results: [],
    branches: [],
    warnings: [],
  });
  const [selected, setSelected] = useState<GlobalSearchResult | null>(null);
  const [activeGroup, setActiveGroup] = useState("all");
  const [enabledKinds, setEnabledKinds] = useState<Set<GlobalSearchKind>>(new Set(allKinds));
  const [branch, setBranch] = useState("all");
  const [status, setStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState("relevant");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebouncedValue(query.trim(), 450);
  const lastSearched = useRef("");
  const requestSerial = useRef(0);

  async function searchNow(value = query.trim()) {
    const clean = value.trim();
    const serial = ++requestSerial.current;
    setError("");
    setSelected(null);
    if (!clean) {
      lastSearched.current = "";
      setResponse((current) => ({ ...current, query: "", results: [] }));
      window.history.replaceState(null, "", "/dashboard/search");
      return;
    }
    lastSearched.current = clean;
    startTransition(async () => {
      try {
        const next = await runGlobalSearch({ query: clean });
        if (serial !== requestSerial.current) return;
        setResponse(next);
        window.history.replaceState(null, "", `/dashboard/search?q=${encodeURIComponent(clean)}`);
      } catch (searchError) {
        if (serial !== requestSerial.current) return;
        lastSearched.current = "";
        setError(searchError instanceof Error ? searchError.message : "Search could not be completed. Please try again.");
      }
    });
  }

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (event.key === "Escape") {
        if (selected) setSelected(null);
        else inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [selected]);

  useEffect(() => {
    if (!initialQuery.trim()) return;
    void searchNow(initialQuery.trim());
    // Initial query is intentionally run once from the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2 || debouncedQuery === lastSearched.current) return;
    void searchNow(debouncedQuery);
    // searchNow is intentionally omitted to avoid recreating the debounce loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  const statuses = useMemo(
    () =>
      Array.from(
        new Set(
          response.results
            .map((result) => result.status)
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort(),
    [response.results],
  );

  const filtered = useMemo(() => {
    const min = minPrice === "" ? null : Number(minPrice);
    const max = maxPrice === "" ? null : Number(maxPrice);
    const start = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const end = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
    const activeKinds = activeGroup === "all"
      ? enabledKinds
      : new Set(groups.find((group) => group.key === activeGroup)?.kinds ?? []);

    const next = response.results.filter((result) => {
      if (!activeKinds.has(result.kind)) return false;
      if (branch !== "all" && result.branchId && result.branchId !== branch) return false;
      if (status !== "all" && (result.status || "").toLowerCase() !== status.toLowerCase()) return false;
      if (start && result.createdAt && new Date(result.createdAt) < start) return false;
      if (end && result.createdAt && new Date(result.createdAt) > end) return false;
      if (min !== null && Number.isFinite(min) && result.amount !== null && result.amount < min) return false;
      if (max !== null && Number.isFinite(max) && result.amount !== null && result.amount > max) return false;
      return true;
    });

    if (sort === "newest") return [...next].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    if (sort === "oldest") return [...next].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
    if (sort === "amount-desc") return [...next].sort((a, b) => (b.amount ?? -1) - (a.amount ?? -1));
    return next;
  }, [activeGroup, branch, dateFrom, dateTo, enabledKinds, maxPrice, minPrice, response.results, sort, status]);

  useEffect(() => {
    if (selected && !filtered.some((result) => result.kind === selected.kind && result.id === selected.id)) {
      setSelected(null);
    }
  }, [filtered, selected]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void searchNow();
  }

  function clearFilters() {
    setEnabledKinds(new Set(allKinds));
    setActiveGroup("all");
    setBranch("all");
    setStatus("all");
    setDateFrom("");
    setDateTo("");
    setMinPrice("");
    setMaxPrice("");
    setSort("relevant");
  }

  function toggleKind(kind: GlobalSearchKind) {
    setActiveGroup("all");
    setEnabledKinds((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next.size ? next : new Set(allKinds);
    });
  }

  const hasSearched = Boolean(response.query);
  const suggestions = ["Order #1001", "SKU ABC123", "Customer phone", "Supplier name", "Purchase Order", "Transfer", "Low stock products"];

  return (
    <main className="mx-auto w-full max-w-[1550px] space-y-5 pb-10">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <Search size={23} />
          </span>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-white">Global Search</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Find orders, products, customers, suppliers, purchase orders, transfers and more — all in one place.
            </p>
          </div>
        </div>
        <div className="hidden items-center gap-2 text-xs text-slate-500 md:flex">
          <kbd className="rounded-lg border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-600 shadow-sm">Ctrl</kbd>
          <kbd className="rounded-lg border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-600 shadow-sm">K</kbd>
          <span>Press to search anywhere</span>
        </div>
      </section>

      <section className="space-y-3">
        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
              placeholder="Order #, SKU, product name, customer, phone, supplier, purchase order..."
              className="h-12 w-full rounded-xl border border-blue-200 bg-white pl-11 pr-11 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  void searchNow("");
                  inputRef.current?.focus();
                }}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={16} />
              </button>
            ) : null}
          </label>
          <button
            type="submit"
            disabled={isPending || !query.trim()}
            className="inline-flex h-12 min-w-32 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isPending ? <Loader2 size={17} className="animate-spin" /> : <Search size={16} />}
            Search
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>Try searching:</span>
          {suggestions.map((suggestion) => (
            <button
              type="button"
              key={suggestion}
              onClick={() => {
                setQuery(suggestion);
                void searchNow(suggestion);
              }}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </section>

      {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {response.warnings.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {response.warnings.join(" ")}
        </div>
      ) : null}

      <section className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 dark:border-slate-800 dark:bg-slate-900">
        {groups.map((group) => {
          const count = group.key === "all" ? response.results.length : resultCount(response.results, group.kinds);
          const active = activeGroup === group.key;
          const Icon = group.Icon;
          return (
            <button
              key={group.key}
              type="button"
              onClick={() => {
                setActiveGroup(group.key);
                setSelected(null);
              }}
              className={`flex min-h-20 items-center gap-3 border-b border-r border-slate-100 px-4 py-3 text-left transition last:border-r-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/70 ${active ? group.tone : "bg-white dark:bg-slate-900"}`}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${group.iconTone}`}>
                <Icon size={18} />
              </span>
              <span className="min-w-0">
                <strong className="block truncate text-sm text-slate-900 dark:text-white">{group.label}</strong>
                <small className="block text-xs text-slate-500">{count} {count === 1 ? "result" : "results"}</small>
              </span>
            </button>
          );
        })}
      </section>

      <section className="grid min-h-[560px] gap-4 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900 dark:text-white">Filter Results</h2>
            <button type="button" onClick={clearFilters} className="text-xs font-semibold text-blue-600 hover:text-blue-700">Clear all</button>
          </div>

          <div className="mt-5 space-y-5">
            <FilterSection title="Type">
              <div className="space-y-2.5">
                {filterKinds.map((item) => (
                  <label key={item.kind} className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={enabledKinds.has(item.kind)}
                      onChange={() => toggleKind(item.kind)}
                      className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </FilterSection>

            <FilterSection title="Date Range">
              <div className="grid grid-cols-2 gap-2">
                <label className="relative">
                  <CalendarDays size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-2 text-xs outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-2 text-xs outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950" />
              </div>
            </FilterSection>

            <FilterSection title="Branch">
              <select value={branch} onChange={(event) => setBranch(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950">
                <option value="all">All branches</option>
                {response.branches.map((item: GlobalSearchBranch) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </FilterSection>

            <FilterSection title="Status">
              <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm capitalize outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950">
                <option value="all">All status</option>
                {statuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
              </select>
            </FilterSection>

            <FilterSection title="Price Range">
              <div className="grid grid-cols-2 gap-2">
                <label className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">$</span><input inputMode="decimal" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} placeholder="Min" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-7 pr-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950" /></label>
                <label className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">$</span><input inputMode="decimal" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="Max" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-7 pr-2 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950" /></label>
              </div>
            </FilterSection>
          </div>
        </aside>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              {hasSearched ? `${filtered.length} ${filtered.length === 1 ? "result" : "results"} found` : "Search results"}
            </p>
            <select value={sort} onChange={(event) => setSort(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
              <option value="relevant">Most relevant</option>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="amount-desc">Highest amount</option>
            </select>
          </div>

          <div className="max-h-[650px] overflow-y-auto">
            {isPending && !response.results.length ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center text-slate-500"><Loader2 size={30} className="animate-spin text-blue-600" /><p className="mt-3 text-sm">Searching TENH POS…</p></div>
            ) : !hasSearched ? (
              <EmptyResults title="Search across your workspace" text="Enter an order number, SKU, barcode, customer, supplier, purchase order, transfer or keyword." />
            ) : !filtered.length ? (
              <EmptyResults title="No matching results" text="Try a different search or clear some filters." />
            ) : (
              filtered.map((result) => (
                <ResultRow key={`${result.kind}-${result.id}`} result={result} active={selected?.kind === result.kind && selected?.id === result.id} onClick={() => setSelected(result)} />
              ))
            )}
          </div>
        </section>

        <aside className="flex min-h-[560px] flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {selected ? <ResultDetail result={selected} /> : <SelectResultPanel />}
          <SearchTips />
        </aside>
      </section>
    </main>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h3 className="mb-2 text-xs font-bold text-slate-700 dark:text-slate-300">{title}</h3>{children}</div>;
}

function ResultRow({ result, active, onClick }: { result: GlobalSearchResult; active: boolean; onClick: () => void }) {
  const meta = kindMeta[result.kind];
  const Icon = meta.Icon;
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition dark:border-slate-800 ${active ? "bg-blue-50/80 dark:bg-blue-950/30" : "hover:bg-slate-50 dark:hover:bg-slate-800/60"}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.iconClass}`}><Icon size={19} /></span>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-sm text-slate-900 dark:text-white">{result.title}</strong>
        <small className="mt-0.5 block truncate text-xs text-slate-500">{result.subtitle}</small>
      </span>
      <span className={`hidden shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold sm:inline ${meta.badgeClass}`}>{result.badge || meta.label}</span>
      <ChevronRight size={17} className="shrink-0 text-slate-400" />
    </button>
  );
}

function EmptyResults({ title, text }: { title: string; text: string }) {
  return <div className="flex min-h-[440px] flex-col items-center justify-center px-8 text-center"><span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 text-slate-400"><PackageSearch size={31} /></span><h3 className="mt-4 font-semibold text-slate-900 dark:text-white">{title}</h3><p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">{text}</p></div>;
}

function SelectResultPanel() {
  return <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl bg-slate-50/70 px-6 text-center dark:bg-slate-950/50"><Search size={45} className="text-slate-400" /><h3 className="mt-4 font-bold text-slate-900 dark:text-white">Select a result</h3><p className="mt-1 text-sm leading-6 text-slate-500">Choose an item from the search results to see more details here.</p></div>;
}

function ResultDetail({ result }: { result: GlobalSearchResult }) {
  const meta = kindMeta[result.kind];
  const Icon = meta.Icon;
  return <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/40"><div className="flex items-start gap-3"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${meta.iconClass}`}><Icon size={20} /></span><div className="min-w-0 flex-1"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${meta.badgeClass}`}>{result.badge || meta.label}</span><h3 className="mt-2 truncate text-lg font-bold text-slate-950 dark:text-white">{result.title}</h3><p className="mt-1 text-sm leading-6 text-slate-500">{result.subtitle}</p></div></div><dl className="mt-4 space-y-2.5">{result.details.map((detail) => <div key={`${detail.label}-${detail.value}`} className="flex items-start justify-between gap-4 text-sm"><dt className="text-slate-500">{detail.label}</dt><dd className="max-w-[60%] text-right font-medium text-slate-800 dark:text-slate-200">{detail.value}</dd></div>)}{result.branchName ? <div className="flex items-start justify-between gap-4 text-sm"><dt className="text-slate-500">Branch</dt><dd className="text-right font-medium text-slate-800 dark:text-slate-200">{result.branchName}</dd></div> : null}{result.createdAt ? <div className="flex items-start justify-between gap-4 text-sm"><dt className="text-slate-500">Created</dt><dd className="text-right font-medium text-slate-800 dark:text-slate-200">{formatDate(result.createdAt)}</dd></div> : null}</dl><Link href={result.href} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">Open result <ChevronRight size={16} /></Link></div>;
}

function SearchTips() {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><Lightbulb size={18} className="text-blue-600" />Search Tips</div><p className="mt-2 text-xs text-slate-500">You can search by:</p><ul className="mt-2 space-y-1.5 pl-4 text-xs leading-5 text-slate-600 dark:text-slate-300"><li>› Order number (e.g. #1001)</li><li>› Product name, SKU or barcode</li><li>› Customer name or phone</li><li>› Supplier name</li><li>› Purchase order number</li><li>› Transfer number</li><li>› Keywords from notes or settings</li></ul><div className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800"><div className="flex items-center gap-2"><kbd className="rounded border bg-slate-50 px-2 py-1 font-semibold dark:bg-slate-950">Ctrl</kbd><kbd className="rounded border bg-slate-50 px-2 py-1 font-semibold dark:bg-slate-950">K</kbd><span>Quick open search</span></div><div className="flex items-center gap-2"><kbd className="rounded border bg-slate-50 px-2 py-1 font-semibold dark:bg-slate-950">Esc</kbd><span>Close selected result</span></div></div></div>;
}
