"use client";

import Link, { useActivity } from '@/components/ui/activity-link';
import {useRouter} from "next/navigation";
import { CalendarDays, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

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
}: {
  activeRange: DashboardRange;
  selectedFrom: string;
  selectedTo: string;
  canViewReports: boolean; branches:{id:string;name:string;is_active:boolean}[]; branchId:string;
}) {
  const router=useRouter();
  const [pending, startTransition] = useTransition();
  useActivity(pending);
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

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
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
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
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">
        <CalendarDays size={14} />
        Filter period
      </p>

      <div className="flex w-full flex-wrap items-center gap-2">
        {presetFilters.map((item) => {
          const active = activeRange === item.range;

          return (
            <Link
              key={item.range}
              href={`/dashboard?range=${item.range}${`&branch=${encodeURIComponent(branchId || "all")}`}`}
              className={
                active
                  ? "inline-flex items-center justify-center rounded-xl bg-blue-600 px-3.5 py-2.5 text-xs font-black text-white shadow-sm"
                  : "inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-black text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-blue-900 dark:hover:bg-blue-950/40"
              }
            >
              {item.label}
            </Link>
          );
        })}

        <div ref={popoverRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
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
            <div className="absolute left-0 top-full z-50 mt-2 w-[min(390px,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
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

                <form onSubmit={event => { event.preventDefault(); const query = new URLSearchParams(new FormData(event.currentTarget) as unknown as Record<string,string>); startTransition(() => router.push(`/dashboard?${query}`)); setOpen(false); }} className="space-y-3"><input type="hidden" name="branch" value={branchId || "all"}/>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                    <span className="block text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                      From
                    </span>
                    <input
                      type="date"
                      name="from"
                      defaultValue={selectedFrom}
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
                      defaultValue={selectedTo}
                      aria-label="Dashboard range end date"
                      className="mt-1 w-full bg-transparent text-sm font-bold text-slate-700 outline-none dark:text-slate-200"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-blue-700"
                >
                  Apply date range
                </button>
              </form>
            </div>
          ) : null}
        </div>


      </div>
    </div>
  );
}
