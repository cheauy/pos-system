"use client";

import { ButtonSpinner } from "@/components/pending-submit-button";
import { useMemo, useRef, useState } from "react";
import { Gift, Globe, Monitor, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import ProductGalleryInput from "@/components/product-gallery-input";
import ProductVariantPicker from '@/components/product-variant-picker';
import ProductPhoto from '@/components/product-photo';
import { MAX_BUNDLE_ITEMS, validateBundleItems } from '@/lib/products/bundle-items';

import {
  createBundleProduct,
  editBundleProduct,
} from "./bundle-actions";

type Category = { id: string; name: string };

export type ComponentProduct = {
  canInclude?: boolean;
  id: string;
  name: string;
  sku: string | null;
  size: string | null;
  color: string | null;
  cost_price: number;
  selling_price: number;
  stock_quantity: number;
  product_type: string | null;
  imageUrl: string | null;
  categoryName: string;
  categoryId: string | null;
  businessStock: number;
  groups: { id: string; name: string; selection_type: string; is_required: boolean; min_selections: number; max_selections: number }[];
  options: { id: string; group_id: string; name: string; is_default: boolean; price_adjustment: number }[];
};

type SelectedItem = { productId: string; quantity: number; optionIds: string[]; name?: string; sku?: string | null; optionsLabel?: string; imageUrl?: string | null };
export type BundleEditValues = { id: string; name: string; sku: string | null; price: number; categoryId: string | null; description: string | null; imageUrls?: string[]; imageUrl: string | null; updatedAt: string | null; items: SelectedItem[]; stock?: number };

const inputClass =
  "w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

export default function BundleProductForm({
  categories,
  products,
  branchId,
  requestId,
  onCreated,
  onPendingChange,
  initial,
  onUnpackItems,
}: {
  categories: Category[];
  products: ComponentProduct[];
  branchId: string;
  requestId: string;
  onCreated?: () => void;
  onPendingChange?: (pending: boolean) => void;
  initial?: BundleEditValues;
  onUnpackItems?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);

  const [items, setItems] = useState<SelectedItem[]>(initial?.items ?? []);

  const [selectedProductId, setSelectedProductId] = useState("");
  const itemsLocked = Number(initial?.stock ?? 0) > 0;


  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const normalTotal = items.reduce((total, item) => {
    const product = productMap.get(item.productId);
    const optionTotal = product?.options.filter(option => item.optionIds.includes(option.id)).reduce((sum, option) => sum + Number(option.price_adjustment), 0) ?? 0;
    return total + (Number(product?.selling_price ?? 0) + optionTotal) * item.quantity;
  }, 0);

  const costTotal = items.reduce((total, item) => {
    const product = productMap.get(item.productId);
    return total + Number(product?.cost_price ?? 0) * item.quantity;
  }, 0);

  function addItem() {
    if (itemsLocked || items.length >= MAX_BUNDLE_ITEMS || !selectedProductId || items.some((item) => item.productId === selectedProductId)) return;
    const product = productMap.get(selectedProductId);
    if (!product || product.canInclude === false) return;
    setItems((current) => current.length >= MAX_BUNDLE_ITEMS || current.some(item => item.productId === product.id) ? current : [...current, { productId: selectedProductId, quantity: 1, optionIds: product.options.filter(option => option.is_default).map(option => option.id) }]);
    setSelectedProductId("");
  }

  return (
    <form ref={formRef} onSubmit={async event => {
      event.preventDefault();
      if (submitting.current) return;
      const itemsError = validateBundleItems(items);
      if (itemsError) { toast.error(itemsError); return; }
      if (selectedProductId) { toast.error('Click Add to include the selected product before saving.'); return; }
      const data = new FormData(event.currentTarget);
      submitting.current = true; setPending(true); onPendingChange?.(true);
      try {
        const result = initial ? await editBundleProduct(data) : await createBundleProduct({ success: false, message: '' }, data);
        if (result.success) { toast.success(result.message); onCreated?.(); }
        else toast.error(result.message);
      } catch { toast.error('Could not confirm the result. Retry without changing the details.'); }
      finally { submitting.current = false; setPending(false); onPendingChange?.(false); }
    }} className="mt-3">
      <fieldset disabled={pending} className="space-y-3">
      <input type="hidden" name="items" value={JSON.stringify(items.map(({ productId, quantity, optionIds }) => ({ productId, quantity, optionIds })))} />
      <input type="hidden" name="branchId" value={branchId} />
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="bundleId" value={initial?.id ?? ''} />
      <input type="hidden" name="expected" value={initial?.updatedAt ?? ''} />



      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Bundle name" htmlFor="bundle-name">
          <input id="bundle-name" name="name" defaultValue={initial?.name} required minLength={2} maxLength={160} placeholder="Summer Outfit" className={inputClass} />
        </Field>
        <Field label="Bundle SKU" htmlFor="bundle-sku">
          <input id="bundle-sku" name="sku" defaultValue={initial?.sku ?? ''} maxLength={100} required placeholder="BUNDLE-001" className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category" htmlFor="bundle-category">
          <select id="bundle-category" name="categoryId" defaultValue={initial?.categoryId ?? ''} className={inputClass}>
            <option value="">No category</option>
            {initial?.categoryId && !categories.some(category => category.id === initial.categoryId) && <option value={initial.categoryId}>Current category</option>}
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </Field>
        <Field label="Bundle selling price" htmlFor="bundle-price">
          <input id="bundle-price" name="sellingPrice" type="number" min="0" step="0.01" required defaultValue={initial?.price ?? 0} className={inputClass} />
        </Field>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Gift size={18} className="text-blue-600" />
          <h3 className="font-semibold text-slate-900">Included products</h3>
          <span className="ml-auto text-xs text-slate-500">{items.length} / {MAX_BUNDLE_ITEMS} items</span>
        </div>
        {itemsLocked && <div className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900"><p>Unpack the {initial?.stock} packed sets before replacing, removing, or adding items. This restores their component stock safely.</p>{onUnpackItems ? <button type="button" onClick={onUnpackItems} className="mt-2 font-semibold text-blue-700 underline">Unpack to edit items</button> : <p className="mt-1">Ask someone with stock-adjustment permission to unpack them.</p>}</div>}
        <fieldset disabled={itemsLocked}>

        <div className="flex gap-2">
          <fieldset disabled={items.length >= MAX_BUNDLE_ITEMS} className="min-w-0 flex-1"><ProductVariantPicker products={products.filter(product => product.canInclude !== false && !items.some(item => item.productId === product.id))} value={selectedProductId} onChange={setSelectedProductId} allowOutOfStock stockForProduct={product => productMap.get(product.id)?.stock_quantity ?? 0} /></fieldset>
          <button type="button" onClick={addItem} disabled={!selectedProductId || items.length >= MAX_BUNDLE_ITEMS} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 font-semibold text-white disabled:opacity-50">
            <Plus size={17} /> Add
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">{items.length >= MAX_BUNDLE_ITEMS ? '8 items added. Remove an item to replace it.' : 'Choose a product, then click Add. Remove a row to replace it. Save Changes applies your final list.'}</p>
        {initial && <p className="mt-1 text-xs text-slate-500">Bundles with transaction history need a new bundle for different items.</p>}

        <div className="mt-4 space-y-3">
          {items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">Add at least two products.</p>
          ) : items.map((item) => {
            const product = productMap.get(item.productId);
            if (!product) return <div key={item.productId} className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <ItemPhoto src={item.imageUrl} name={item.name || 'Unavailable product'} />
              <div className="min-w-0 flex-1"><p className="font-medium text-slate-900">{item.name || 'Unavailable product'}</p><p className="text-xs text-slate-600">{item.sku || item.productId}{item.optionsLabel ? ` · ${item.optionsLabel}` : ''}</p><p className="mt-1 text-xs text-amber-800">This saved item is not available in the current branch catalog. It remains in this bundle.</p></div>
              <span className="shrink-0 text-sm font-semibold">× {item.quantity}</span><button type="button" aria-label={`Remove ${item.name || 'unavailable product'}`} onClick={() => setItems(current => current.filter(row => row.productId !== item.productId))} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 size={17} /></button>
            </div>;
            return (
              <div key={item.productId} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-3">
                <ItemPhoto src={product.imageUrl} name={product.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{formatProductName(product)}</p>
                  <p className="text-xs text-slate-500">SKU {product.sku ?? "—"} · available {product.stock_quantity}</p>
                </div>
                <input
                  aria-label={`Quantity for ${product.name}`}
                  type="number"
                  min="1"
                  max={999}
                  step={1}
                  value={item.quantity}
                  onChange={(event) => {
                    const quantity = Math.max(1, Math.min(999, Math.trunc(Number(event.target.value) || 1)));
                    setItems((current) => current.map((row) => row.productId === item.productId ? { ...row, quantity } : row));
                  }}
                  className="w-20 rounded-lg border border-slate-300 px-3 py-2"
                />
                <button type="button" aria-label={`Remove ${product.name}`} onClick={() => setItems((current) => current.filter((row) => row.productId !== item.productId))} className="rounded-lg p-2 text-red-600 hover:bg-red-50">
                  <Trash2 size={17} />
                </button>
              </div>
              {product.groups.map(group => <fieldset key={group.id} className="mt-3 border-t border-slate-100 pt-2">
                <legend className="text-xs font-semibold text-slate-600">{group.name}{group.is_required || group.min_selections > 0 ? ' *' : ''} · {group.selection_type === 'single' ? 'Choose one' : `Up to ${group.max_selections}`}</legend>
                <div className="mt-1 flex flex-wrap gap-3">{product.options.filter(option => option.group_id === group.id).map(option => <label key={option.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={item.optionIds.includes(option.id)} onChange={event => setItems(current => current.map(row => row.productId !== item.productId ? row : { ...row, optionIds: event.target.checked ? [...row.optionIds.filter(id => group.selection_type !== 'single' || !product.options.some(o => o.id === id && o.group_id === group.id)), option.id] : row.optionIds.filter(id => id !== option.id) }))} />{option.name}
                </label>)}</div>
              </fieldset>)}
              </div>
            );
          })}
        </div>
        </fieldset>
      </div>

      <ProductGalleryInput title="Bundle images" description="First photo is the cover. Choose up to 8 photos." initialUrls={initial?.imageUrls?.length ? initial.imageUrls : initial?.imageUrl ? [initial.imageUrl] : []} />

      <div className="grid gap-3 rounded-xl bg-blue-50 p-4 text-sm sm:grid-cols-2">
        <p>Normal item total: <strong>${normalTotal.toFixed(2)}</strong></p>
        <p>Estimated component cost: <strong>${costTotal.toFixed(2)}</strong></p>
      </div>

      {!initial && <div className="grid gap-3 sm:grid-cols-2">
        {([{ name: 'showPos', label: 'Show on POS', icon: Monitor }, { name: 'showOnline', label: 'Show online', icon: Globe }]).map(({ name, label, icon: Icon }) => (
          <label key={name} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <span className="flex items-center gap-2 text-sm font-medium"><Icon size={18} className="text-blue-600" />{label}</span>
            <input type="checkbox" role="switch" name={name} aria-label={label} defaultChecked className="peer sr-only" />
            <span aria-hidden="true" className="flex h-6 w-11 shrink-0 items-center rounded-full bg-slate-300 p-0.5 transition peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2 peer-disabled:opacity-50 dark:bg-slate-600 peer-checked:[&>span]:translate-x-5"><span className="h-5 w-5 rounded-full bg-white shadow-sm transition-transform" /></span>
          </label>
        ))}
      </div>}
      <Field label="Description" htmlFor="bundle-description">
        <textarea id="bundle-description" name="description" defaultValue={initial?.description ?? ''} maxLength={2000} rows={3} placeholder="Optional bundle description" className={`${inputClass} resize-none`} />
      </Field>

      <button type="submit" disabled={pending || items.length < 2 || items.length > MAX_BUNDLE_ITEMS} className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
        {pending ? <span className="inline-flex items-center justify-center gap-2"><ButtonSpinner />{initial ? "Saving bundle…" : "Creating bundle…"}</span> : initial ? "Save changes" : "Create Bundle"}
      </button>
      <p className="text-xs text-slate-500">{initial ? 'Images and details can change anytime. To change items, unpack all sets first. Bundles with sales or pending transactions keep their original contents.' : 'Creates an empty bundle. Pack sets from branch stock before selling.'}</p>
      </fieldset>
    </form>
  );
}

function formatProductName(product: ComponentProduct) {
  const variant = [product.color, product.size].filter(Boolean).join(" / ");
  return variant ? `${product.name} — ${variant}` : product.name;
}

function ItemPhoto({src, name}: {src?: string | null; name: string}) {
  return <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50">
    {src ? <ProductPhoto src={src} alt={name} width={96} height={96} sizes="48px" className="h-full w-full object-contain" /> : <Gift size={20} className="text-slate-300" />}
  </span>;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return <div><label htmlFor={htmlFor} className="mb-2 block text-sm font-medium text-slate-700">{label}</label>{children}</div>;
}
