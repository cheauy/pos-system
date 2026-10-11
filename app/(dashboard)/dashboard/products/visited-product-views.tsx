'use client';

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link, { ActivitySignal } from '@/components/ui/activity-link';
import ContentSkeleton from '@/components/ui/content-skeleton';
import { Boxes, Package, SlidersHorizontal } from 'lucide-react';
import styles from '@/components/products-stock-responsive.module.css';

type View = 'products' | 'stock';
type Entry = { content: ReactNode; at: number };
type Snapshot = {
  serverContent: ReactNode;
  shown: View;
  checkedAt: number;
  requested: View | null;
  entries: Partial<Record<View, Entry>>;
  invalid: Partial<Record<View, boolean>>;
};
// shortcut: external edits may stay visible on revisits for 15s; add scoped invalidation when a reliable event exists.
export const productViewLifetime = 15_000;

export function receiveProductView(previous: Snapshot | null, view: View, content: ReactNode, now: number): Snapshot {
  // Keep mounted drafts, but a refresh/mutation invalidates the sibling's data.
  const invalid = previous?.requested === view ? { ...previous.invalid } : { products: true, stock: true };
  delete invalid[view];
  return { serverContent: content, shown: view, checkedAt: now, requested: null, invalid, entries: { ...previous?.entries, [view]: { content, at: now } } };
}

export function reusableProductView(snapshot: Snapshot, view: View, now: number) {
  const entry = snapshot.entries[view];
  return entry && !snapshot.invalid[view] && now - entry.at < productViewLifetime ? entry : undefined;
}

// The server keys this component by verified user, tenant, branch and access scope.
export default function VisitedProductViews({ view, children, canViewProducts, canViewStock, canAdjustStock }: {
  view: View; children: ReactNode; canViewProducts: boolean; canViewStock: boolean; canAdjustStock: boolean;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const active: View = canViewStock && (search.get('view') === 'stock' || !canViewProducts) ? 'stock' : 'products';
  const [snapshot, setSnapshot] = useState(() => receiveProductView(null, view, children, performance.now()));
  const refreshFor = useRef<string | null>(null);
  let current = snapshot;
  if (current.serverContent !== children) current = receiveProductView(current, view, children, current.checkedAt);
  if (current.shown !== active) {
    const invalid = { ...current.invalid };
    if (!reusableProductView(current, active, current.checkedAt)) invalid[active] = true;
    current = { ...current, shown: active, invalid };
  }
  if (current !== snapshot) setSnapshot(current);

  const ready = !!current.entries[active] && !current.invalid[active];
  useEffect(() => {
    const onHistory = (event: PopStateEvent) => setSnapshot(value => ({ ...value, checkedAt: event.timeStamp }));
    window.addEventListener('popstate', onHistory);
    return () => window.removeEventListener('popstate', onHistory);
  }, []);
  useEffect(() => {
    if (ready) { refreshFor.current = null; return; }
    // Expired native-history entries need one fresh authorized route read.
    if (refreshFor.current !== active) {
      refreshFor.current = active;
      router.refresh();
    }
  }, [active, ready, current.requested, router]);

  function navigate(event: MouseEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[data-product-view]');
    if (!link || !event.currentTarget.contains(link)) return;
    const target = link.dataset.productView as View;
    event.preventDefault();
    if (target === active) return;
    const now = event.timeStamp;
    const reuse = !current.requested && reusableProductView(current, target, now);
    const invalid = { ...current.invalid };
    if (!reuse) invalid[target] = true;
    setSnapshot({ ...current, invalid, checkedAt: now, requested: reuse ? null : target });
    window.history.pushState(null, '', link.getAttribute('href'));
  }

  const stock = active === 'stock';
  return <main className={`${styles.frame} grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-5`} onClickCapture={navigate}>
    <header className={`${styles.pageHeading} col-start-1 row-start-1`}>
      <h1 className="text-lg font-bold tracking-tight text-slate-950">Products &amp; Stock</h1>
      <p className="mt-1 text-sm text-slate-500">Manage your products, variants and branch stock in one place.</p>
    </header>
    {stock && canAdjustStock && <Link href="/dashboard/inventory/adjustments" className={`${styles.desktopOnly} col-start-2 row-start-1 inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-800 max-sm:fixed max-sm:bottom-[max(1rem,env(safe-area-inset-bottom))] max-sm:left-4 max-sm:right-4 max-sm:z-40 max-sm:min-h-14 max-sm:rounded-2xl max-sm:text-base max-sm:shadow-lg`}>
      <SlidersHorizontal size={17} /> Adjust Stock
    </Link>}
    <nav aria-label="Products and stock views" className={`${styles.viewTabs} col-span-2 row-start-2 flex gap-1 border-b border-slate-200 max-lg:grid max-lg:auto-cols-fr max-lg:grid-flow-col max-lg:gap-0`}>
      {canViewProducts && <Link href="/dashboard/products" data-product-view="products" aria-current={!stock ? 'page' : undefined}
        className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold max-lg:justify-center max-lg:text-base ${!stock ? 'border-teal-600 text-teal-700 max-lg:border-blue-600 max-lg:text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
        <Package size={18} />Products
      </Link>}
      {canViewStock && <Link href="/dashboard/products?view=stock" data-product-view="stock" aria-current={stock ? 'page' : undefined}
        className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold max-lg:justify-center max-lg:text-base ${stock ? 'border-teal-600 text-teal-700 max-lg:border-blue-600 max-lg:text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
        <Boxes size={18} />Stock
      </Link>}
    </nav>
    {(['products', 'stock'] as const).map(name => current.entries[name] &&
      <div key={name} className={name === active && ready ? name === 'products' ? 'contents' : 'col-span-2 min-w-0' : 'hidden'} inert={name !== active || !ready}>
        {current.entries[name]!.content}
      </div>)}
    {!ready && <div className="col-span-2 min-w-0"><ActivitySignal /><ContentSkeleton kind="table" /></div>}
  </main>;
}
