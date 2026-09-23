"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Gift, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import ProductVariantPicker from '@/components/product-variant-picker';

import {
  createBundleProduct,
  type CreateBundleState,
} from "./bundle-actions";

type Category = { id: string; name: string };

export type ComponentProduct = {
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

type SelectedItem = { productId: string; quantity: number; optionIds: string[] };

const initialState: CreateBundleState = { success: false, message: "" };
const inputClass =
  "w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

export default function BundleProductForm({
  categories,
  products,
  branchId,
  requestId,
  onCreated,
}: {
  categories: Category[];
  products: ComponentProduct[];
  branchId: string;
  requestId: string;
  onCreated?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(createBundleProduct, initialState);
  const [items, setItems] = useState<SelectedItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");

  useEffect(() => {
    if (!state.message) return;
    if (state.success) {
      toast.success(state.message);
      formRef.current?.reset();
      onCreated?.();
    } else {
      toast.error(state.message);
    }
  }, [state, onCreated]);

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
    if (!selectedProductId || items.some((item) => item.productId === selectedProductId)) return;
    const product = productMap.get(selectedProductId);
    setItems((current) => [...current, { productId: selectedProductId, quantity: 1, optionIds: product?.options.filter(option => option.is_default).map(option => option.id) ?? [] }]);
    setSelectedProductId("");
  }

  return (
    <form ref={formRef} action={formAction} className="mt-6 space-y-5">
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      <input type="hidden" name="branchId" value={branchId} />
      <input type="hidden" name="requestId" value={requestId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Bundle name" htmlFor="bundle-name">
          <input id="bundle-name" name="name" required minLength={2} placeholder="Summer Outfit" className={inputClass} />
        </Field>
        <Field label="Bundle SKU" htmlFor="bundle-sku">
          <input id="bundle-sku" name="sku" required placeholder="BUNDLE-001" className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" htmlFor="bundle-category">
          <select id="bundle-category" name="categoryId" defaultValue="" className={inputClass}>
            <option value="">No category</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </Field>
        <Field label="Bundle selling price" htmlFor="bundle-price">
          <input id="bundle-price" name="sellingPrice" type="number" min="0" step="0.01" required defaultValue="0" className={inputClass} />
        </Field>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Gift size={18} className="text-blue-600" />
          <h3 className="font-semibold text-slate-900">Included products</h3>
        </div>

        <div className="flex gap-2">
          <div className="min-w-0 flex-1"><ProductVariantPicker products={products.filter(product => !items.some(item => item.productId === product.id))} value={selectedProductId} onChange={setSelectedProductId} allowOutOfStock stockForProduct={product => productMap.get(product.id)?.stock_quantity ?? 0} /></div>
          <button type="button" onClick={addItem} disabled={!selectedProductId} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 font-semibold text-white disabled:opacity-50">
            <Plus size={17} /> Add
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">Add at least two products.</p>
          ) : items.map((item) => {
            const product = productMap.get(item.productId);
            if (!product) return null;
            return (
              <div key={item.productId} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{formatProductName(product)}</p>
                  <p className="text-xs text-slate-500">SKU {product.sku ?? "—"} · available {product.stock_quantity}</p>
                </div>
                <input
                  aria-label={`Quantity for ${product.name}`}
                  type="number"
                  min="1"
                  max={999}
                  value={item.quantity}
                  onChange={(event) => {
                    const quantity = Math.max(1, Number(event.target.value) || 1);
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
      </div>

      <div className="grid gap-3 rounded-xl bg-blue-50 p-4 text-sm sm:grid-cols-2">
        <p>Normal item total: <strong>${normalTotal.toFixed(2)}</strong></p>
        <p>Estimated component cost: <strong>${costTotal.toFixed(2)}</strong></p>
      </div>

      <Field label="Description" htmlFor="bundle-description">
        <textarea id="bundle-description" name="description" rows={3} placeholder="Optional bundle description" className={`${inputClass} resize-none`} />
      </Field>

      <button type="submit" disabled={pending || items.length < 2} className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
        {pending ? "Creating bundle..." : "Create Bundle"}
      </button>
      <p className="text-xs text-slate-500">Creates an empty bundle. Pack sets from branch stock before selling. The included variants and options stay fixed.</p>
    </form>
  );
}

function formatProductName(product: ComponentProduct) {
  const variant = [product.color, product.size].filter(Boolean).join(" / ");
  return variant ? `${product.name} — ${variant}` : product.name;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return <div><label htmlFor={htmlFor} className="mb-2 block text-sm font-medium text-slate-700">{label}</label>{children}</div>;
}
