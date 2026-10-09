import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

export type CardTone = "green" | "blue" | "red" | "amber" | "violet" | "slate";
const tones: Record<CardTone, string> = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  red: "border-red-200 bg-red-50 text-red-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  violet: "border-violet-200 bg-violet-50 text-violet-700",
  slate: "border-slate-200 bg-slate-50 text-slate-600",
};
/** Maps common status words to a pill colour; pages can pass a tone directly instead. */
export function statusTone(status: string | null | undefined): CardTone {
  const s = (status || "").toLowerCase();
  if (/(complete|received|paid|refunded|active|approved|delivered|success|in stock|closed|done)/.test(s)) return "green";
  if (/(cancel|declin|reject|fail|void|out of stock|overdue|error|delete)/.test(s)) return "red";
  if (/(pending|draft|low|partial|review|due|open)/.test(s)) return "amber";
  if (/(process|progress|transit|sent|ordered|scheduled)/.test(s)) return "blue";
  return "slate";
}

type Props = {
  media?: ReactNode; title: ReactNode; date?: ReactNode; primary?: ReactNode; secondary?: ReactNode;
  amount?: ReactNode; status?: { label: string; tone?: CardTone } | null; extra?: ReactNode;
  href?: string; onClick?: () => void; selected?: boolean;
};

/** Phone/tablet list row (see the Returns design): media, ID, date, title, detail; amount and status on the right. */
export default function MobileListCard({ media, title, date, primary, secondary, amount, status, extra, href, onClick, selected = false }: Props) {
  const body = <>
    {media !== undefined && <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-50 text-slate-400">{media}</span>}
    <span className="min-w-[7rem] flex-1">
      <span className="block break-words text-sm font-bold text-slate-900">{title}</span>
      {date && <span className="block break-words text-xs text-slate-400">{date}</span>}
      {primary && <span className="mt-1 block break-words text-sm font-semibold text-slate-800">{primary}</span>}
      {secondary && <span className="block break-words text-xs text-slate-500">{secondary}</span>}
      {extra}
    </span>
    <span className="ml-auto flex shrink-0 flex-col items-end gap-2">
      {amount !== undefined && <span className="text-base font-bold text-slate-900">{amount}</span>}
      {status && <span className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${tones[status.tone ?? statusTone(status.label)]}`}>{status.label}</span>}
    </span>
    {(href || onClick) && amount === undefined && !status && <ChevronRight size={18} className="shrink-0 text-slate-300" />}
  </>;
  const className = `flex w-full flex-wrap items-center gap-3 rounded-2xl border bg-white p-3 text-left shadow-sm ${selected ? "border-blue-200 ring-1 ring-blue-100" : "border-slate-200"}`;
  // A #hash href opens a CSS :target drawer, which needs a real hash navigation (not Link's pushState).
  if (href) return <li>{href.startsWith("#") ? <a href={href} className={className}>{body}</a> : <Link href={href} className={className}>{body}</Link>}</li>;
  if (onClick) return <li><button type="button" onClick={onClick} className={className}>{body}</button></li>;
  return <li><div className={className}>{body}</div></li>;
}

/** Wrapper: cards below 1024px (and portrait tablets); pair it with a table wrapped in `hidden lg:block`. */
export function MobileList({ children, empty }: { children: ReactNode; empty?: ReactNode }) {
  return <ul className="space-y-3 p-2 lg:hidden">{children}{empty}</ul>;
}
