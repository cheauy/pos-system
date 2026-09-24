'use client';

import { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import ProductPhoto from '@/components/product-photo';
import { Boxes, Gift, Globe, Monitor, MoreHorizontal, PackageCheck, Pencil, Plus, Search, Store, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { ComponentProduct } from '../products/bundle-product-form';
const BundleProductForm = dynamic(() => import('../products/bundle-product-form'), { loading: () => <p role="status" className="py-8 text-center text-sm text-slate-500">Loading bundle form…</p> });
import { manageBundle, packBundle } from '../products/bundle-actions';

type Bundle = {
  id: string; name: string; sku: string | null; description: string | null; categoryId: string | null;
  imageUrl: string | null; updatedAt: string | null; online: boolean; pos: boolean;
  price: number; cost: number; active: boolean; packed: boolean; stock: number; capacity: number;
  components: { id: string; name: string; sku: string | null; imageUrl: string | null; quantity: number; optionIds?: string[]; options: string; available: number }[];
};
const panel = 'rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900';
const button = 'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50';
const secondary = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800';
const field = 'mt-1.5 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-blue-500 dark:border-slate-700';

function Photo({ src, large = false }: { src: string | null; large?: boolean }) {
  return <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-blue-600 dark:bg-slate-800 ${large ? 'h-16 w-16' : 'h-11 w-11'}`}>
    {src ? <ProductPhoto src={src} alt="" sizes={large ? '64px' : '44px'} className="h-full w-full object-cover" /> : <Gift size={large ? 28 : 20} />}
  </span>;
}

function Dialog({ title, children, close, busy, side = false, wide = false, footer }: { title: string; children: ReactNode; close: () => void; busy: boolean; side?: boolean; wide?: boolean; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) close(); }} className={`${panel} ${side ? 'fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-full max-w-xl rounded-r-none' : `m-auto max-h-[90dvh] w-[calc(100%-2rem)] ${wide ? 'max-w-3xl' : 'max-w-xl'}`} overflow-y-auto p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/40 dark:text-slate-100`}>
    <div className={side ? 'flex min-h-full flex-col' : ''}>
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900"><h2 className="text-lg font-bold">{title}</h2><button type="button" onClick={close} disabled={busy} aria-label="Close dialog" className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={19} /></button></div>
    <div className="flex-1 p-5">{children}</div>
    {footer && <div className="sticky bottom-0 border-t border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">{footer}</div>}
    </div>
  </dialog>;
}

function VisibilitySwitch({ enabled, disabled, label, change }: { enabled: boolean; disabled: boolean; label: string; change: () => void }) {
  return <button type="button" role="switch" aria-checked={enabled} aria-label={label} disabled={disabled} onClick={change} className="inline-flex items-center gap-2 rounded-lg py-1 disabled:cursor-not-allowed disabled:opacity-40">
    <span className={`flex h-5 w-9 items-center rounded-full px-0.5 transition ${enabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}><span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : ''}`} /></span><span className="text-xs text-slate-500">{enabled ? 'On' : 'Off'}</span>
  </button>;
}

function BundleActions({ name, children, disabled }: { name: string; children: ReactNode; disabled: boolean }) {
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  return <><button type="button" popoverTarget={id} aria-label={`Actions for ${name}`} disabled={disabled} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={event => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (menu.current) { menu.current.style.top = `${Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 160))}px`; menu.current.style.left = `${Math.max(8, rect.right - 176)}px`; }
  }}><MoreHorizontal size={20} /></button><div id={id} ref={menu} popover="auto" className={`${panel} fixed m-0 w-44 p-1.5 text-sm text-slate-900 shadow-xl dark:text-slate-100 [&_button]:w-full [&_button]:justify-start [&_button]:border-0`} onClick={event => { if ((event.target as HTMLElement).closest('button')) menu.current?.hidePopover(); }}>{children}</div></>;
}

export default function BundleItemsClient({ branchId, branchName, bundles, products, categories, canCreate, canPack, canEdit, canDelete }: {
  branchId: string; branchName: string; bundles: Bundle[]; products: ComponentProduct[]; categories: { id: string; name: string }[];
  canCreate: boolean; canPack: boolean; canEdit: boolean; canDelete: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState(1);
  const [createId, setCreateId] = useState('');
  const [creating, setCreating] = useState(false);
  const [modal, setModal] = useState<{ id: string; kind: 'detail' | 'edit' | 'delete' } | null>(null);
  const [operation, setOperation] = useState<{ bundleId: string; unpack: boolean; requestId: string } | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState('');
  const locked = useRef(false);
  const pending = busy || refreshing;
  const refresh = useCallback(() => startRefresh(() => router.refresh()), [router]);
  const onCreated = useCallback(() => { setCreateId(''); refresh(); }, [refresh]);
  const chosen = bundles.find(bundle => bundle.id === operation?.bundleId);
  const shown = bundles.find(bundle => bundle.id === modal?.id);
  const visible = useMemo(() => bundles.filter(bundle => `${bundle.name} ${bundle.sku ?? ''}`.toLowerCase().includes(deferredSearch.toLowerCase())), [bundles, deferredSearch]);
  const pages = Math.max(1, Math.ceil(visible.length / 20));
  const currentPage = Math.min(page, pages);
  const pageBundles = visible.slice((currentPage - 1) * 20, currentPage * 20);

  async function confirmPack() {
    if (!operation || !chosen || locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try {
      const result = await packBundle({ branchId, bundleId: operation.bundleId, quantity: operation.unpack ? -quantity : quantity, requestId: operation.requestId });
      if (!result.success) { setError(result.message); toast.error(result.message); return; }
      toast.success(result.message); setOperation(null); refresh();
    } catch { setError('Could not confirm the result. Retry the same quantity to avoid packing twice.'); }
    finally { locked.current = false; setBusy(false); }
  }
  async function manage(bundle: Bundle, action: 'edit' | 'pos' | 'online' | 'delete', values: Record<string, string | boolean>) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try {
      const result = await manageBundle({ branchId, bundleId: bundle.id, action, expected: bundle.updatedAt, values });
      if (!result.success) { setError(result.message); toast.error(result.message); refresh(); return; }
      toast.success(result.message); if (action === 'edit' || action === 'delete') setModal(null); refresh();
    } catch { setError('Could not save. Refresh and check the bundle before trying again.'); toast.error('Could not save the bundle.'); }
    finally { locked.current = false; setBusy(false); }
  }
  function start(bundle: Bundle, unpack: boolean) { setModal(null); setOperation({ bundleId: bundle.id, unpack, requestId: crypto.randomUUID() }); setQuantity(1); setError(''); }
  function open(bundle: Bundle, kind: 'detail' | 'edit' | 'delete') { setModal({ id: bundle.id, kind }); setError(''); }

  return <div className="space-y-5 pb-8 text-slate-900 dark:text-slate-100">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><span className="rounded-2xl bg-blue-50 p-3 text-blue-600 dark:bg-blue-950"><Gift size={24} /></span><div><h1 className="text-2xl font-bold">Bundle Items</h1><p className="mt-1 text-sm text-slate-500">Create sets. Pack stock. Sell together.</p></div></div>
      <div className="flex items-center gap-3"><span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"><Store size={16} />{branchName}</span>{canCreate && <button className={button} onClick={() => setCreateId(crypto.randomUUID())} disabled={Boolean(createId) || !branchId || pending}><Plus size={17} />Add Bundle</button>}</div>
    </header>
    <div className="grid gap-3 sm:grid-cols-3">{[
      { icon: Gift, label: 'Total bundles', value: bundles.length },
      { icon: PackageCheck, label: `Packed · ${branchName}`, value: bundles.filter(bundle => bundle.packed).reduce((sum, bundle) => sum + bundle.stock, 0) },
      { icon: Boxes, label: 'Ready to pack', value: bundles.filter(bundle => bundle.active && bundle.packed && bundle.capacity > 0).length },
    ].map(({ icon: Icon, label, value }) => <div key={label} className={`${panel} flex items-center gap-3 px-4 py-3`}><Icon size={21} className="text-blue-600" /><div className="min-w-0 flex-1"><p className="truncate text-xs text-slate-500">{label}</p></div><p className="text-2xl font-bold">{value}</p></div>)}</div>
    {createId && <Dialog title={`New bundle · ${branchName}`} wide busy={creating} close={() => setCreateId('')}><p className="text-sm text-slate-500">Choose products, exact variants and fixed options.</p>{products.filter(product => product.canInclude !== false).length < 2 ? <p className="mt-4 text-sm">Assign at least two products to this branch in <Link href="/dashboard/inventory" className="text-blue-600 underline">Inventory</Link>.</p> : <BundleProductForm key={createId} categories={categories} products={products} branchId={branchId} requestId={createId} onCreated={onCreated} onPendingChange={setCreating} />}</Dialog>}
    <section className={`${panel} overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800"><div><h2 className="font-bold">Your bundles <span className="ml-2 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800">{visible.length}</span></h2><p className="mt-1 text-xs text-slate-500">Stock is for this branch. Visibility applies across your store.</p></div><label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700"><Search size={16} className="text-slate-400" /><input aria-label="Search bundles" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Search name or SKU" className="w-48 bg-transparent text-sm outline-none" /></label></div>
      {!visible.length ? <div className="px-4 py-12 text-center"><Gift className="mx-auto mb-3 text-slate-300" size={30} /><p className="font-medium">{search ? 'No matching bundles' : 'No bundles yet'}</p><p className="mt-1 text-sm text-slate-500">{search ? 'Try another name or SKU.' : 'Add your first set, then pack it for sale.'}</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/50"><tr>{['Bundle', 'Price', 'Branch stock', 'Status', 'Actions'].map(label => <th key={label} className="px-5 py-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{pageBundles.map(bundle => <tr key={bundle.id} onClick={() => { if (!pending) open(bundle, 'detail'); }} className="cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
        <td className="px-5 py-4"><button aria-label={`View ${bundle.name}`} onClick={() => open(bundle, 'detail')} className="flex items-center gap-3 text-left"><Photo src={bundle.imageUrl || bundle.components[0]?.imageUrl} /><span><span className="block font-semibold hover:text-blue-600">{bundle.name}</span><span className="mt-1 block text-xs text-slate-500">{bundle.sku || 'No SKU'} · {bundle.components.length} products</span></span></button></td>
        <td className="px-5 py-4"><p className="font-semibold">${bundle.price.toFixed(2)}</p><p className="mt-1 text-xs text-slate-500">Cost ${bundle.cost.toFixed(2)}</p></td>
        <td className="px-5 py-4"><span className={`rounded-lg px-2 py-1 text-xs font-semibold ${bundle.stock > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{bundle.packed ? `${bundle.stock} packed` : 'Legacy bundle'}</span><p className="mt-2 text-xs text-slate-500">{bundle.packed ? `${bundle.capacity} more can pack` : 'Recreate to use packing'}</p></td>
        <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${bundle.active && (bundle.pos || bundle.online) ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>{bundle.active && (bundle.pos || bundle.online) ? 'Active' : 'Inactive'}</span></td>
        <td className="px-5 py-4" onClick={event => event.stopPropagation()}>{(canEdit || canDelete || canPack && bundle.packed) && <BundleActions name={bundle.name} disabled={pending}>{canEdit && <button aria-label={`Edit ${bundle.name}`} className={secondary} onClick={() => open(bundle, 'edit')}><Pencil size={16} />Edit</button>}{canDelete && <button aria-label={`Delete ${bundle.name}`} className={`${secondary} text-red-600`} onClick={() => open(bundle, 'delete')}><Trash2 size={16} />Delete</button>}{canPack && bundle.packed && <button className={secondary} disabled={!bundle.active || bundle.capacity < 1} onClick={() => start(bundle, false)}><PackageCheck size={16} />Pack</button>}</BundleActions>}</td>
      </tr>)}</tbody></table></div>}
      {visible.length > 20 && <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-sm dark:border-slate-800"><span>Page {currentPage} of {pages} · {visible.length} bundles</span><div className="flex gap-2"><button className={secondary} disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button><button className={secondary} disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Next</button></div></div>}
    </section>
    {shown && modal && <Dialog key={`${shown.id}-${modal.kind}`} title={modal.kind === 'detail' ? 'Bundle details' : modal.kind === 'edit' ? 'Edit bundle' : 'Delete bundle'} busy={pending || creating} wide={modal.kind === 'edit'} close={() => setModal(null)} side={modal.kind === 'detail'} footer={modal.kind === 'detail' ? <div className="space-y-4"><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-semibold"><Monitor size={17} />Show on POS</span><VisibilitySwitch enabled={shown.active && shown.pos} disabled={!canEdit || pending} label={`Show ${shown.name} on POS`} change={() => void manage(shown, 'pos', { enabled: !(shown.active && shown.pos) })} /></div><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-semibold"><Globe size={17} />Show online</span><VisibilitySwitch enabled={shown.active && shown.online} disabled={!canEdit || pending} label={`Show ${shown.name} online`} change={() => void manage(shown, 'online', { enabled: !(shown.active && shown.online) })} /></div>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}</div> : undefined}>
      {modal.kind === 'detail' ? <>
        <div className="flex items-center gap-4"><Photo large src={shown.imageUrl || shown.components[0]?.imageUrl} /><div><h3 className="text-xl font-bold">{shown.name}</h3><p className="mt-1 text-sm text-slate-500">{shown.sku}</p></div><span className="ml-auto text-lg font-bold">${shown.price.toFixed(2)}</span></div>
        {shown.description && <p className="mt-4 whitespace-pre-wrap text-sm text-slate-500">{shown.description}</p>}
        <div className="my-5 flex flex-wrap gap-3 text-xs"><span className="rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800">{branchName} · {shown.stock} packed</span><span className="inline-flex items-center gap-1.5"><Monitor size={15} />POS {shown.active && shown.pos ? 'On' : 'Off'}</span><span className="inline-flex items-center gap-1.5"><Globe size={15} />Online {shown.active && shown.online ? 'On' : 'Off'}</span></div>
        <h4 className="mb-2 text-sm font-bold">Included in each set</h4><div className="divide-y divide-slate-100 dark:divide-slate-800">{shown.components.map(item => <div key={item.id} className="flex items-center gap-3 py-3"><Photo src={item.imageUrl} /><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{item.name}</p><p className="mt-1 text-xs text-slate-500">{item.sku}{item.options && ` · ${item.options}`}</p></div><span className="text-sm font-semibold">× {item.quantity}</span></div>)}</div>
        <p className="my-4 text-xs text-slate-500">Packing uses component stock. Unpacking restores unused components. Unpack all sets before changing contents. Sales history keeps its original recipe.</p>
        <div className="flex flex-wrap justify-end gap-2">{canEdit && <button className={secondary} onClick={() => open(shown, 'edit')}><Pencil size={15} />Edit</button>}{canPack && shown.packed && <><button className={secondary} disabled={pending || shown.stock < 1} onClick={() => start(shown, true)}>Unpack</button><button className={button} disabled={pending || !shown.active || shown.capacity < 1} onClick={() => start(shown, false)}>Pack sets</button></>}</div>
      </> : modal.kind === 'edit' ? <BundleProductForm categories={categories} products={products} branchId={branchId} requestId={shown.id} initial={{ ...shown, items: shown.components.map(item => ({ productId: item.id, quantity: item.quantity, optionIds: item.optionIds ?? [] })) }} onCreated={() => { setModal(null); refresh(); }} onPendingChange={setCreating} /> : <><p className="text-sm">Delete <strong>{shown.name}</strong>?</p><p className="mt-2 text-sm text-slate-500">Only unused bundles with no stock can be deleted. Bundles with sales or stock history must be hidden instead. Component products stay unchanged.</p>{error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}<div className="mt-5 flex justify-end gap-2"><button className={secondary} disabled={pending} onClick={() => setModal(null)}>Cancel</button><button className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40" disabled={pending} onClick={() => void manage(shown, 'delete', {})}>{busy ? 'Deleting…' : 'Delete bundle'}</button></div></>}
    </Dialog>}
    {operation && chosen && <Dialog title={`${operation.unpack ? 'Unpack' : 'Pack'} ${chosen.name}`} busy={pending} close={() => setOperation(null)}><form onSubmit={event => { event.preventDefault(); void confirmPack(); }}>
      <p className="text-sm text-slate-500">{branchName} · {operation.unpack ? chosen.stock : chosen.capacity} sets available</p><label className="mt-4 block text-sm font-semibold">Number of sets<input autoFocus type="number" min={1} max={Math.min(999, operation.unpack ? chosen.stock : chosen.capacity)} required disabled={pending} value={quantity} onChange={event => { setQuantity(Number(event.target.value)); setOperation({ ...operation, requestId: crypto.randomUUID() }); }} className={field} /></label><ul className="my-4 space-y-1 text-xs text-slate-500">{chosen.components.map(item => <li key={item.id}>{operation.unpack ? 'Restore' : 'Use'} {item.quantity * quantity} × {item.name}</li>)}</ul>{error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}<div className="flex justify-end gap-2"><button type="button" disabled={pending} onClick={() => setOperation(null)} className={secondary}>Cancel</button><button disabled={pending} className={button}>{busy ? 'Saving…' : operation.unpack ? 'Confirm unpack' : 'Confirm packing'}</button></div>
    </form></Dialog>}
  </div>;
}
