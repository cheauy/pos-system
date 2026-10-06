'use client';

import Link from 'next/link';
import { AlertTriangle, RotateCcw } from 'lucide-react';

// Page errors render inside the workspace layout, so the header and menu stay usable.
export default function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <div role="alert" className="mx-auto mt-6 max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <AlertTriangle size={32} className="mx-auto text-amber-500" />
    <h1 className="mt-3 text-xl font-bold text-slate-900 dark:text-white">This page couldn&apos;t load</h1>
    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Check your connection and try again. Nothing was changed by this error.</p>
    {error.digest && <p className="mt-2 break-all text-xs text-slate-400">Reference: {error.digest}</p>}
    <div className="mt-5 flex flex-wrap justify-center gap-2">
      <button type="button" onClick={() => retry()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white"><RotateCcw size={16} />Try again</button>
      <Link href="/dashboard" className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">Go to Dashboard</Link>
    </div>
  </div>;
}
