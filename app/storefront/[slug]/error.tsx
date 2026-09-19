"use client";

export default function StorefrontError({ reset }: { reset: () => void }) {
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
    <section className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-2xl font-bold text-slate-900">We couldn’t load this store</h1>
      <p className="mt-3 text-sm text-slate-500">Please try again in a moment.</p>
      <button type="button" onClick={reset} className="mt-6 rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white">Try again</button>
    </section>
  </main>;
}
