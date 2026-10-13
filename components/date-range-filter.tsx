"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLanguage } from "@/components/providers/language-provider";
import { calendarPresets, calendarRange, dateRangeError } from "@/lib/date-range";
import { createActivityStore } from "@/lib/ui/activity";
import ContentSkeleton from "@/components/ui/content-skeleton";
import type { SkeletonKind } from "@/lib/navigation/loading-shape";
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

export function DateFilterContent({ children, busy = false, className = "", kind = "table" }: { children: ReactNode; busy?: boolean; className?: string; kind?: SkeletonKind }) {
  const loading = useContext(DateLoading);
  return <div className={`${styles.wrapper} ${busy || loading?.pending ? styles.pending : ""}`} aria-busy={busy || loading?.pending || undefined}>
    <div className={styles.skeleton}><ContentSkeleton kind={kind} /></div>
    <div className={`${styles.content} ${className}`}>{children}</div>
  </div>;
}

export default function DateRangeFilter({ from, to, today, onApply, busy = false, maxSpanDays, required = false, draft: controlledDraft, onDraftChange }: {
  from: string; to: string; today?: string; onApply: (from: string, to: string) => void; busy?: boolean; maxSpanDays?: number; required?: boolean;
  draft?: {from:string;to:string} | null; onDraftChange?: (next: {from:string;to:string} | null) => void;
}) {
  const { t } = useLanguage();
  const appliedKey = `${from}|${to}`;
  const [localDraft, setLocalDraft] = useState<{ from: string; to: string; appliedKey: string } | null>(null);
  if (localDraft && localDraft.appliedKey !== appliedKey) setLocalDraft(null);
  const draft = onDraftChange ? controlledDraft : localDraft?.appliedKey === appliedKey ? localDraft : null;
  const root = useRef<HTMLDivElement>(null);
  const lastApply = useRef("");
  const shown = draft ?? { from, to };
  const error = dateRangeError(shown.from, shown.to, maxSpanDays);
  useEffect(() => { if (!busy) lastApply.current = ""; }, [busy, appliedKey]);
  useEffect(() => {
    if (!draft) return;
    const discard = (event: PointerEvent | KeyboardEvent) => {
      if (root.current && !root.current.getClientRects().length) return;
      if (event.type === "keydown" ? (event as KeyboardEvent).key === "Escape" : !root.current?.contains(event.target as Node)) { setLocalDraft(null); onDraftChange?.(null); }
    };
    document.addEventListener("pointerdown", discard); document.addEventListener("keydown", discard);
    return () => { document.removeEventListener("pointerdown", discard); document.removeEventListener("keydown", discard); };
  }, [draft, onDraftChange]);
  function discard() { setLocalDraft(null); onDraftChange?.(null); }
  function edit(start: string, end: string) { if(onDraftChange) onDraftChange({from:start,to:end}); else setLocalDraft({ from: start, to: end, appliedKey }); }
  function apply(start: string, end: string) {
    if ((required && (!start || !end)) || dateRangeError(start, end, maxSpanDays)) return;
    const next = `${start}|${end}`;
    discard();
    if (next === appliedKey || lastApply.current === `${appliedKey}>${next}`) return;
    lastApply.current = `${appliedKey}>${next}`;
    onApply(start, end);
  }
  return <div ref={root} className={styles.desktop}>
    <div className={styles.bar}>
      <div className="flex flex-wrap gap-2" aria-label={t("Date Range")}>
        {calendarPresets.map(preset => <button key={preset} type="button" onClick={() => {
          const localToday = today ?? new Date().toLocaleDateString("en-CA");
          const range = calendarRange(preset, localToday);
          edit(range.from, range.to);
        }} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-blue-950">{t(preset)}</button>)}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-slate-500">{t("From")}<input type="date" aria-label={t("From date")} value={shown.from} onChange={event => edit(event.target.value, shown.to)} className="mt-1 block h-10 w-36 rounded-xl border border-slate-200 bg-white px-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" /></label>
        <label className="text-xs font-semibold text-slate-500">{t("To")}<input type="date" aria-label={t("To date")} value={shown.to} onChange={event => edit(shown.from, event.target.value)} className="mt-1 block h-10 w-36 rounded-xl border border-slate-200 bg-white px-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" /></label>
        {draft && <button type="button" onClick={discard} className="h-10 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-200">{t("Cancel")}</button>}
        <button type="button" disabled={!!error || (required && (!shown.from || !shown.to))} onClick={() => apply(shown.from, shown.to)} className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50">{t("Apply")}</button>
      </div>
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-red-600">{t(error)}</p>}
  </div>;
}

export type DateSelection = { preset: string; from: string; to: string };

// Compact history selectors retain rolling-day semantics; Custom edits calendar days.
export function DatePresetFilter({ value, presets, onApply, draft: controlledDraft, onDraftChange }: {
  value: DateSelection; presets: readonly { value: string; label: string }[]; onApply: (next: DateSelection) => void;
  draft?: DateSelection | null; onDraftChange?: (next: DateSelection | null) => void;
}) {
  const { t } = useLanguage();
  const appliedKey = JSON.stringify(value);
  const [localDraft, setLocalDraft] = useState<(DateSelection & { appliedKey: string }) | null>(null);
  if (localDraft && localDraft.appliedKey !== appliedKey) setLocalDraft(null);
  const draft = onDraftChange ? controlledDraft : localDraft?.appliedKey === appliedKey ? localDraft : null;
  const root = useRef<HTMLDivElement>(null);
  const shown = draft ?? value;
  const error = shown.preset === "custom" ? dateRangeError(shown.from, shown.to) : "";
  useEffect(() => {
    if (!draft) return;
    const discard = (event: PointerEvent | KeyboardEvent) => {
      if (root.current && !root.current.getClientRects().length) return;
      if (event.type === "keydown" ? (event as KeyboardEvent).key === "Escape" : !root.current?.contains(event.target as Node)) { setLocalDraft(null); onDraftChange?.(null); }
    };
    document.addEventListener("pointerdown", discard); document.addEventListener("keydown", discard);
    return () => { document.removeEventListener("pointerdown", discard); document.removeEventListener("keydown", discard); };
  }, [draft, onDraftChange]);
  function edit(next: DateSelection | null) { if (onDraftChange) onDraftChange(next); else setLocalDraft(next ? { ...next, appliedKey } : null); }
  return <div ref={root} className={`${styles.legacy} flex min-w-0 flex-wrap items-center gap-2`}>
    <select aria-label={t("Date Range")} value={shown.preset} onChange={event => edit({ preset: event.target.value, from: value.from, to: value.to })} className="min-h-11 max-w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
      {presets.map(preset => <option key={preset.value} value={preset.value}>{t(preset.label)}</option>)}<option value="custom">{t("Custom")}</option>
    </select>
    {shown.preset === "custom" && <div className="grid min-w-0 basis-full grid-cols-2 gap-2">
      <label className="min-w-0 text-xs font-semibold text-slate-500">{t("From")}<input type="date" aria-label={t("From date")} value={shown.from} onChange={event => edit({ ...shown, from: event.target.value })} className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" /></label>
      <label className="min-w-0 text-xs font-semibold text-slate-500">{t("To")}<input type="date" aria-label={t("To date")} value={shown.to} onChange={event => edit({ ...shown, to: event.target.value })} className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" /></label>
    </div>}
    {error && <p role="alert" className="basis-full text-xs text-red-600">{t(error)}</p>}
    {draft && <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => edit(null)} className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-200">{t("Cancel")}</button>
      <button type="button" disabled={!!error} onClick={() => { if (error) return; const next = { preset: shown.preset, from: shown.preset === "custom" ? shown.from : "", to: shown.preset === "custom" ? shown.to : "" }; edit(null); if (JSON.stringify(next) !== appliedKey) onApply(next); }} className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{t("Apply")}</button>
    </div>}
  </div>;
}

export function NavigationDateRange({ path, query, ...props }: Omit<Parameters<typeof DateRangeFilter>[0], "onApply" | "busy"> & { path: string; query: Record<string, string> }) {
  const router = useRouter();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();
  useDateFilterPending(pending);
  return <DateRangeFilter {...props} required busy={pending} onApply={(from, to) => {
    if (from === props.from && to === props.to) return;
    const params = new URLSearchParams(search.toString());
    for (const [key, value] of Object.entries({ ...query, range: "custom", from, to })) params.set(key, value);
    params.delete("page");
    startTransition(() => router.push(`${path}?${params}`, { scroll: false }));
  }} />;
}
