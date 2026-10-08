"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import CatalogManager from "./catalog-manager";
import { loadOnlineCatalog } from "./catalog-actions";

type Catalog = Extract<Awaited<ReturnType<typeof loadOnlineCatalog>>, { success: true }>;

// Loads once, the first time the Product section is opened; never on other sections and never on a timer.
// Later loads happen only after a catalog edit succeeds (or Retry after an error).
export default function CatalogPanel({ currency, canEdit }: { currency: string; canEdit: boolean }) {
  const shown = useSearchParams().get("section") === "product";
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [requested, setRequested] = useState(false);
  const [loading, startLoading] = useTransition();

  function load() {
    startLoading(async () => {
      try {
        const result = await loadOnlineCatalog();
        if (result.success) { setCatalog(result); setError(""); } else setError(result.message);
      } catch { setError("Unable to load the store catalog. Please try again."); }
    });
  }

  useEffect(() => {
    if (!shown || requested) return;
    // Deferred so the state change is not synchronous inside the effect.
    queueMicrotask(() => { setRequested(true); load(); });
  }, [shown, requested]);

  if (catalog) {
    return (
      <div className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <CatalogManager products={catalog.products} categories={catalog.categories} featuredIds={catalog.featuredIds} currency={currency} canEdit={canEdit} onChanged={load} />
      </div>
    );
  }
  return (
    <div role={error ? "alert" : "status"} className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
      {error
        ? <><p>{error}</p><button type="button" disabled={loading} onClick={load} className="min-h-11 rounded-lg border border-slate-200 bg-white px-4 py-2 font-semibold text-blue-600 disabled:opacity-50">Retry</button></>
        : <><Loader2 size={20} className="animate-spin" />Loading products…</>}
    </div>
  );
}
