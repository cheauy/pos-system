"use client";

import { useActivity } from '@/components/ui/activity-link';
import {useRouter, useSearchParams} from "next/navigation";
import { CalendarDays, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { dateRangeError } from "@/lib/date-range";
import { NavigationDateRange, dateFilterStyles } from "@/components/date-range-filter";

type DashboardRange =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "365d"
  | "custom";

export default function DashboardPeriodFilter({
  activeRange,
  selectedFrom,
  selectedTo,
  branchId,
  today,
}: {
  activeRange: DashboardRange;
  selectedFrom: string;
  selectedTo: string;
  today: string;
  canViewReports: boolean; branches:{id:string;name:string;is_active:boolean}[]; branchId:string;
}) {
  const router=useRouter();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();
  useActivity(pending);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({ range: activeRange, from: selectedFrom, to: selectedTo });
  const lastQuery = useRef("");
  const popoverRef = useRef<HTMLDivElement>(null);
  function close() {
    setOpen(false);
    const sheet = popoverRef.current?.closest<HTMLElement>(":target");
    if (!sheet) return;
    sheet.dataset.dateFilterDisplay ??= sheet.style.display;
    sheet.style.display = "none";
    window.history.replaceState(window.history.state, "", location.pathname + location.search);
  }
  useEffect(() => {
    const discard = () => {
      const sheet = popoverRef.current?.closest<HTMLElement>("[data-date-filter-display]");
      if (sheet) { sheet.style.display = sheet.dataset.dateFilterDisplay ?? ""; delete sheet.dataset.dateFilterDisplay; }
      setOpen(false);
    };
    window.addEventListener("hashchange", discard);
    return () => window.removeEventListener("hashchange", discard);
  }, []);
  function begin() { setDraft({ range: activeRange, from: selectedFrom, to: selectedTo }); setError(""); setOpen(true); }
  function choosePreset(range: Exclude<DashboardRange, "custom">) {
    const end = new Date(`${today}T00:00:00Z`);
    if (range === "yesterday") end.setUTCDate(end.getUTCDate() - 1);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - ({ today: 0, yesterday: 0, "7d": 6, "30d": 29, "365d": 364 }[range]));
    setDraft({ range, from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) }); setError(""); setOpen(true);
  }

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); if(popoverRef.current?.closest(":target")) location.hash = ""; }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    const discardSheet = () => setOpen(false);
    window.addEventListener("hashchange", discardSheet);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("hashchange", discardSheet);
    };
  }, [open]);

  const presetFilters = [
    { range: "today", label: "Today" },
    { range: "yesterday", label: "Yesterday" },
    { range: "7d", label: "7 Days" },
    { range: "30d", label: "1 Month" },
    { range: "365d", label: "1 Year" },
  ] as const;

  return (
    <div className="w-full">
      <NavigationDateRange path="/dashboard" query={{ branch: branchId || "all" }} from={selectedFrom} to={selectedTo} today={today} maxSpanDays={365} />
      <div ref={popoverRef} className={dateFilterStyles.legacy}>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">
        <CalendarDays size={14} />
        Filter period
      </p>

      <div className="flex w-full flex-wrap items-center gap-2">
        {presetFilters.map((item) => {
          const active = (open ? draft.range : activeRange) === item.range;

          return (
            <button
              type="button"
              key={item.range}
              onClick={() => choosePreset(item.range)}
              className={
                active
                  ? "inline-flex items-center justify-center rounded-xl bg-blue-600 px-3.5 py-2.5 text-xs font-black text-white shadow-sm"
                  : "inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-black text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-blue-900 dark:hover:bg-blue-950/40"
              }
            >
              {item.label}
            </button>
          );
        })}

        <div className="dashboard-date-filter relative">
          <button
            type="button"
            onClick={() => { if (open) setOpen(false); else begin(); }}
            aria-expanded={open}
            className={
              activeRange === "custom"
                ? "inline-flex items-center justify-center rounded-xl bg-blue-600 px-3.5 py-2.5 text-xs font-black text-white shadow-sm"
                : "inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-black text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-blue-900 dark:hover:bg-blue-950/40"
            }
          >
            Select date range
          </button>

          {open ? (
            <div className="dashboard-date-popover absolute left-0 top-full z-50 mt-2 w-[min(390px,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-950 dark:text-white">
                    Select date range
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Choose any range up to 366 days.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close date range"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <X size={16} />
                </button>
              </div>

                <form onSubmit={event => {
                  event.preventDefault();
                  const message = dateRangeError(draft.from, draft.to, 365);
                  if (message) { setError(message); return; }
                  close();
                  if (draft.range === activeRange && draft.from === selectedFrom && draft.to === selectedTo) return;
                  const query = new URLSearchParams(search.toString());
                  query.set("branch", branchId || "all"); query.set("range", draft.range);
                  query.delete("date"); query.delete("from"); query.delete("to");
                  if (draft.range === "custom") { query.set("from", draft.from); query.set("to", draft.to); }
                  if (pending && lastQuery.current === String(query)) return;
                  lastQuery.current = String(query);
                  startTransition(() => router.push(`/dashboard?${query}`, { scroll: false }));
                }} onChange={() => setError("")} className="space-y-3"><input type="hidden" name="branch" value={branchId || "all"}/>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                    <span className="block text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                      From
                    </span>
                    <input
                      type="date"
                      name="from"
                      required
                      value={draft.from}
                      onChange={event => setDraft({ ...draft, range: "custom", from: event.target.value })}
                      aria-label="Dashboard range start date"
                      className="mt-1 w-full bg-transparent text-sm font-bold text-slate-700 outline-none dark:text-slate-200"
                    />
                  </label>
                  <label className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                    <span className="block text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                      To
                    </span>
                    <input
                      type="date"
                      name="to"
                      required
                      value={draft.to}
                      onChange={event => setDraft({ ...draft, range: "custom", to: event.target.value })}
                      aria-label="Dashboard range end date"
                      className="mt-1 w-full bg-transparent text-sm font-bold text-slate-700 outline-none dark:text-slate-200"
                    />
                  </label>
                </div>

                {error && <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p>}
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700"
                >
                  Apply date range
                </button>
                <button type="button" onClick={close} className="min-h-11 w-full rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-200">Cancel</button>
              </form>
            </div>
          ) : null}
        </div>


      </div>
      </div>
    </div>
  );
}
