"use client";

import { useLanguage } from "@/components/providers/language-provider";
import type { SkeletonKind } from "@/lib/navigation/loading-shape";

const block = "rounded-xl bg-slate-200 dark:bg-slate-800";
const rows = (count: number) => Array.from({length: count}, (_, key) => <div key={key} className={`${block} h-12`} />);
const cards = (count: number) => Array.from({length: count}, (_, key) => <div key={key} className={`${block} h-24`} />);

export default function ContentSkeleton({kind = "table"}: {kind?: SkeletonKind}) {
  const {t} = useLanguage();
  return <section role="status" aria-label={t("Loading…")} aria-busy="true" data-skeleton={kind} className="min-w-0 space-y-5">
    <span className="sr-only">{t("Loading…")}</span>
    <div aria-hidden="true" className="min-w-0 space-y-5 motion-safe:animate-pulse">
      <div className={`${block} h-7 w-40 max-w-full`} />
      {kind === "table" && <><div className={`${block} h-11`} /><div className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">{rows(5)}</div></>}
      {kind === "cards" && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{cards(6)}</div>}
      {kind === "form" && <div className="space-y-5 rounded-2xl border border-slate-200 p-5 dark:border-slate-800"><div className="grid gap-5 sm:grid-cols-2">{rows(6)}</div><div className={`${block} h-11 w-32`} /></div>}
      {kind === "analytics" && <><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{cards(4)}</div><div className="grid gap-4 lg:grid-cols-2"><div className={`${block} h-64`} /><div className={`${block} h-64`} /></div></>}
      {kind === "detail" && <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"><div className="space-y-3">{rows(5)}</div><div className="space-y-3">{cards(2)}</div></div>}
      {kind === "document" && <div className="mx-auto w-full max-w-lg space-y-4 rounded-xl border border-slate-200 p-6 dark:border-slate-800">{rows(7)}</div>}
      {(kind === "catalog" || kind === "pos") && <div className={kind === "pos" ? "grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : "min-w-0"}><div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({length:8},(_,key)=><div key={key} className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800"><div className={`${block} aspect-square`} /><div className={`${block} h-4`} /><div className={`${block} h-4 w-1/2`} /></div>)}</div>{kind === "pos" && <div className={`${block} h-80`} />}</div>}
    </div>
  </section>;
}
