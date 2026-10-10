"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/providers/language-provider";
import { calendarPresets, calendarRange, dateRangeError } from "@/lib/date-range";
import { createActivityStore } from "@/lib/ui/activity";
import styles from "./date-range-filter.module.css";

export { styles as dateFilterStyles };
const DateLoading = createContext<{ pending: boolean; begin: () => () => void } | null>(null);

export function DateFilterScope({ children }: { children: ReactNode }) {
  const [activity] = useState(createActivityStore);
  const pending = useSyncExternalStore(activity.subscribe, activity.getSnapshot, () => false);
  return <DateLoading.Provider value={{ pending, begin: activity.begin }}>{children}</DateLoading.Provider>;
}

export function useDateFilterPending(pending: boolean) {
  const begin = useContext(DateLoading)?.begin;
  useEffect(() => { if (pending) return begin?.(); }, [pending, begin]);
}

export function DateFilterContent({ children, busy = false, className = "" }: { children: ReactNode; busy?: boolean; className?: string }) {
  const loading = useContext(DateLoading);
  const { t } = useLanguage();
  return <div className={`${styles.wrapper} ${busy || loading?.pending ? styles.pending : ""}`} aria-busy={busy || loading?.pending || undefined}>
    <div className={styles.skeleton} role="status" aria-label={t("Loading…")}><span className="sr-only">{t("Loading…")}</span>{[0, 1, 2, 3].map(key => <div key={key} className="h-12 rounded-xl bg-slate-200 motion-safe:animate-pulse dark:bg-slate-800" />)}</div>
    <div className={`${styles.content} ${className}`}>{children}</div>
  </div>;
}

export default function DateRangeFilter({ from, to, today, onApply, busy = false, maxSpanDays, required = false }: {
  from: string; to: string; today?: string; onApply: (from: string, to: string) => void; busy?: boolean; maxSpanDays?: number; required?: boolean;
}) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState<{ from: string; to: string } | null>(null);
  const shown = draft ?? { from, to };
  const error = dateRangeError(shown.from, shown.to, maxSpanDays);
  function apply(start: string, end: string) { if (busy || (required && (!start || !end)) || dateRangeError(start, end, maxSpanDays)) return; onApply(start, end); setDraft(null); }
  return <div className={styles.desktop}>
    <div className={styles.bar}>
      <div className="flex flex-wrap gap-2" aria-label={t("Date Range")}>
        {calendarPresets.map(preset => <button key={preset} type="button" disabled={busy} onClick={() => {
          const localToday = today ?? new Date().toLocaleDateString("en-CA");
          const range = calendarRange(preset, localToday);
          apply(range.from, range.to);
        }} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-blue-950">{t(preset)}</button>)}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-slate-500">{t("From")}<input type="date" aria-label={t("From date")} value={shown.from} onChange={event => setDraft({ ...shown, from: event.target.value })} className="mt-1 block h-10 w-36 rounded-xl border border-slate-200 bg-white px-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" /></label>
        <label className="text-xs font-semibold text-slate-500">{t("To")}<input type="date" aria-label={t("To date")} value={shown.to} onChange={event => setDraft({ ...shown, to: event.target.value })} className="mt-1 block h-10 w-36 rounded-xl border border-slate-200 bg-white px-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" /></label>
        <button type="button" disabled={busy || !!error || (required && (!shown.from || !shown.to))} onClick={() => apply(shown.from, shown.to)} className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50">{t("Apply")}</button>
      </div>
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-red-600">{t(error)}</p>}
  </div>;
}

export function NavigationDateRange({ path, query, ...props }: Omit<Parameters<typeof DateRangeFilter>[0], "onApply" | "busy"> & { path: string; query: Record<string, string> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useDateFilterPending(pending);
  return <DateRangeFilter {...props} required busy={pending} onApply={(from, to) => {
    const params = new URLSearchParams({ ...query, range: "custom", from, to });
    startTransition(() => router.push(`${path}?${params}`, { scroll: false }));
  }} />;
}
