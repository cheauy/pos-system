'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ImageOff, Search, X } from 'lucide-react';

export type PromotionProduct = { id: string; name: string; variant: string; sku: string | null; image: string | null };
type Group = { name: string; image: string | null; items: PromotionProduct[] };

/** Uncontrolled with `name` (submits hidden inputs), or controlled with `value` + `onChange`. */
export default function ProductPicker({ products, name, value, onChange }: { products: PromotionProduct[]; name?: string; value?: string[]; onChange?: (ids: string[]) => void }) {
  const [own, setOwn] = useState<Set<string>>(new Set());
  const selected = useMemo(() => value ? new Set(value) : own, [value, own]);
  const setSelected = (update: (previous: Set<string>) => Set<string>) => {
    const next = update(selected);
    if (onChange) onChange([...next]); else setOwn(next);
  };
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const product of products) {
      const group = map.get(product.name) ?? { name: product.name, image: product.image, items: [] };
      group.items.push(product);
      map.set(product.name, group);
    }
    return [...map.values()];
  }, [products]);

  const term = query.trim().toLowerCase();
  const visible = useMemo(() => !term ? groups : groups
    .map(group => group.name.toLowerCase().includes(term) ? group
      : { ...group, items: group.items.filter(item => [item.variant, item.sku].some(value => value?.toLowerCase().includes(term))) })
    .filter(group => group.items.length > 0), [groups, term]);
  const visibleIds = visible.flatMap(group => group.items.map(item => item.id));
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selected.has(id));

  function change(ids: string[], on: boolean) {
    setSelected(previous => {
      const next = new Set(previous);
      ids.forEach(id => on ? next.add(id) : next.delete(id));
      return next;
    });
  }
  function toggleOpen(group: string) {
    setOpen(previous => { const next = new Set(previous); if (next.has(group)) next.delete(group); else next.add(group); return next; });
  }

  return <div className="rounded-xl border border-slate-200">
    {name && [...selected].map(id => <input key={id} type="hidden" name={name} value={id} />)}
    <div className="space-y-2 border-b border-slate-200 p-2.5">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search product, size, color or SKU"
          aria-label="Search products" className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50" />
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className={`font-semibold ${selected.size ? 'text-blue-700' : 'text-slate-500'}`}>{selected.size} selected</span>
        <span className="flex gap-3">
          <button type="button" disabled={!visibleIds.length} onClick={() => change(visibleIds, !allVisibleSelected)} className="font-semibold text-blue-600 hover:underline disabled:text-slate-300">
            {allVisibleSelected ? 'Unselect shown' : term ? 'Select shown' : 'Select all'}
          </button>
          {selected.size > 0 && <button type="button" onClick={() => setSelected(() => new Set())} className="font-semibold text-slate-500 hover:text-red-600">Clear</button>}
        </span>
      </div>
    </div>
    <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto" aria-label="Products">
      {visible.length === 0 && <li className="px-3 py-8 text-center text-sm text-slate-400">{products.length ? 'No products match your search.' : 'No products are assigned to this branch.'}</li>}
      {visible.map(group => {
        const ids = group.items.map(item => item.id);
        const count = ids.filter(id => selected.has(id)).length;
        const single = group.items.length === 1 && !group.items[0].variant;
        const expanded = open.has(group.name) || !!term;
        return <li key={group.name} className="px-2.5 py-2">
          <div className="flex items-center gap-2.5">
            <GroupCheckbox checked={count === ids.length} partial={count > 0 && count < ids.length} onChange={on => change(ids, on)} label={group.name} />
            <Thumb src={group.image} />
            <button type="button" onClick={() => single ? change(ids, count === 0) : toggleOpen(group.name)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-800">{group.name}</span>
                <span className="block text-[11px] text-slate-500">{single ? (group.items[0].sku ? `SKU ${group.items[0].sku}` : 'No variants') : `${count ? `${count} of ` : ''}${ids.length} variants`}</span>
              </span>
              {!single && <ChevronDown size={15} className={`shrink-0 text-slate-400 transition ${expanded ? 'rotate-180' : ''}`} />}
            </button>
          </div>
          {!single && expanded && <div className="mt-2 flex flex-wrap gap-1.5 pl-7">
            {group.items.map(item => {
              const on = selected.has(item.id);
              return <button key={item.id} type="button" aria-pressed={on} onClick={() => change([item.id], !on)} title={item.sku ? `SKU ${item.sku}` : undefined}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition ${on ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300'}`}>
                {item.variant || 'Standard'}{on && <X size={11} />}
              </button>;
            })}
          </div>}
        </li>;
      })}
    </ul>
  </div>;
}

function GroupCheckbox({ checked, partial, onChange, label }: { checked: boolean; partial: boolean; onChange: (on: boolean) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = partial; }, [partial]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} aria-label={`Select all of ${label}`}
    className="h-4 w-4 shrink-0 rounded border-slate-300 accent-blue-600" />;
}

function Thumb({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-300"><ImageOff size={15} /></span>;
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="h-9 w-9 shrink-0 rounded-lg object-cover" />;
}
