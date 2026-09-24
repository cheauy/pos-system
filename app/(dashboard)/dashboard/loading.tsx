export default function DashboardLoading() {
  return <div role="status" aria-label="Loading workspace" className="space-y-5 p-1">
    <span className="sr-only">Loading workspace…</span>
    <div aria-hidden="true" className="space-y-5 motion-safe:animate-pulse">
      <div className="h-8 w-52 rounded-lg bg-slate-200 dark:bg-slate-800" />
      <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map(key => <div key={key} className="h-24 rounded-2xl bg-slate-100 dark:bg-slate-800" />)}</div>
      <div className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800">{[0, 1, 2, 3, 4].map(key => <div key={key} className="my-4 h-12 rounded-lg bg-slate-100 dark:bg-slate-800" />)}</div>
    </div>
  </div>;
}
