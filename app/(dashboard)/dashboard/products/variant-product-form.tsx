"use client";

import { Loader2, PackagePlus, Plus, Trash2 } from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import ImageUpload from "@/components/image-upload";
import {
  createVariantProduct,
  type CreateProductState,
} from "./actions";

type Category = {
  id: string;
  name: string;
};

type VariantRow = {
  id: string;
  size: string;
  color: string;
  sku: string;
  costPrice: string;
  sellingPrice: string;
  stockQuantity: string;
  lowStockQuantity: string;
};

const initialState: CreateProductState = {
  success: false,
  message: "",
};

function createVariant(): VariantRow {
  return {
    id: crypto.randomUUID(),
    size: "",
    color: "",
    sku: "",
    costPrice: "0",
    sellingPrice: "0",
    stockQuantity: "0",
    lowStockQuantity: "5",
  };
}

export default function VariantProductForm({
  categories,
}: {
  categories: Category[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    createVariantProduct,
    initialState,
  );
  const [variants, setVariants] = useState<VariantRow[]>([
    createVariant(),
  ]);

  useEffect(() => {
    if (!state.message) return;
    if (state.success) {
      toast.success(state.message);
      formRef.current?.reset();
      setVariants([createVariant()]);
    } else {
      toast.error(state.message);
    }
  }, [state]);

  const totalStock = useMemo(
    () =>
      variants.reduce(
        (total, variant) =>
          total + Number(variant.stockQuantity || 0),
        0,
      ),
    [variants],
  );

  function updateVariant(
    id: string,
    field: keyof Omit<VariantRow, "id">,
    value: string,
  ) {
    setVariants((current) =>
      current.map((variant) =>
        variant.id === id
          ? { ...variant, [field]: value }
          : variant,
      ),
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="mt-6 space-y-5"
    >
      <input
        type="hidden"
        name="variants"
        value={JSON.stringify(
          variants.map((variant) => ({
            size: variant.size.trim(),
            color: variant.color.trim(),
            sku: variant.sku.trim(),
            costPrice: Number(variant.costPrice),
            sellingPrice: Number(variant.sellingPrice),
            stockQuantity: Number(variant.stockQuantity),
            lowStockQuantity: Number(variant.lowStockQuantity),
          })),
        )}
      />

      <Field label="Product name" htmlFor="variant-name">
        <input
          id="variant-name"
          name="name"
          required
          minLength={2}
          placeholder="Classic T-Shirt"
          className={inputClass}
        />
      </Field>

      <Field label="Category" htmlFor="variant-category">
        <select
          id="variant-category"
          name="categoryId"
          defaultValue=""
          className={inputClass}
        >
          <option value="">No category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </Field>

      <ImageUpload />

      <Field label="Description" htmlFor="variant-description">
        <textarea
          id="variant-description"
          name="description"
          rows={3}
          placeholder="Optional product description"
          className={`${inputClass} resize-none`}
        />
      </Field>

      <section className="rounded-2xl border border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div>
            <h3 className="font-semibold text-slate-900">Variants</h3>
            <p className="mt-1 text-xs text-slate-500">
              {variants.length} variant{variants.length === 1 ? "" : "s"} · {totalStock} total stock
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setVariants((current) => [
                ...current,
                createVariant(),
              ])
            }
            className="inline-flex items-center gap-2 rounded-xl bg-blue-100 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-200"
          >
            <Plus size={16} /> Add Variant
          </button>
        </div>

        <div className="space-y-4 p-4">
          {variants.map((variant, index) => (
            <div
              key={variant.id}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">
                  Variant {index + 1}
                </p>
                <button
                  type="button"
                  disabled={variants.length === 1}
                  onClick={() =>
                    setVariants((current) =>
                      current.filter((row) => row.id !== variant.id),
                    )
                  }
                  className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-30"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <VariantField
                  label="Size"
                  value={variant.size}
                  placeholder="S, M, 40, 41"
                  onChange={(value) => updateVariant(variant.id, "size", value)}
                />
                <VariantField
                  label="Color"
                  value={variant.color}
                  placeholder="Black"
                  onChange={(value) => updateVariant(variant.id, "color", value)}
                />
                <VariantField
                  label="SKU"
                  value={variant.sku}
                  placeholder="TS-BLK-M"
                  required
                  onChange={(value) => updateVariant(variant.id, "sku", value)}
                />
                <VariantField
                  label="Stock"
                  value={variant.stockQuantity}
                  type="number"
                  min="0"
                  required
                  onChange={(value) => updateVariant(variant.id, "stockQuantity", value)}
                />
                <VariantField
                  label="Cost price"
                  value={variant.costPrice}
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  onChange={(value) => updateVariant(variant.id, "costPrice", value)}
                />
                <VariantField
                  label="Selling price"
                  value={variant.sellingPrice}
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  onChange={(value) => updateVariant(variant.id, "sellingPrice", value)}
                />
                <VariantField
                  label="Low-stock alert"
                  value={variant.lowStockQuantity}
                  type="number"
                  min="0"
                  required
                  onChange={(value) => updateVariant(variant.id, "lowStockQuantity", value)}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? (
          <>
            <Loader2 size={18} className="animate-spin" /> Creating Variants...
          </>
        ) : (
          <>
            <PackagePlus size={18} /> Create Variant Product
          </>
        )}
      </button>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
    </div>
  );
}

function VariantField({
  label,
  value,
  placeholder,
  type = "text",
  min,
  step,
  required,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  type?: string;
  min?: string;
  step?: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-medium text-slate-600">
      {label}
      <input
        value={value}
        type={type}
        min={min}
        step={step}
        required={required}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
      />
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";
