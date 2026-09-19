export default function StorefrontLoading() {
  return <main className="min-h-screen bg-slate-50 px-4 py-12" aria-busy="true" aria-label="Loading store">
    <div className="mx-auto max-w-7xl animate-pulse">
      <div className="mb-8 h-60 rounded-3xl bg-slate-200" />
      <div className="mb-8 h-12 rounded-2xl bg-slate-200" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{[1, 2, 3, 4].map(id => <div key={id} className="h-80 rounded-2xl bg-slate-200" />)}</div>
      <p className="sr-only">Loading products…</p>
    </div>
  </main>;
}
