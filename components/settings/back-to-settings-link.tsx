import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function BackToSettingsLink() {
  return (
    <Link
      href="/dashboard/settings"
      aria-label="Back to settings"
      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white"
    >
      <ArrowLeft className="h-4 w-4" />
      <span>Back to settings</span>
    </Link>
  );
}
