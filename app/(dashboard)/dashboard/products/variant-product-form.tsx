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

const shoeSizeRuns = [
  { label: "EU 35–41", sizes: ["35", "36", "37", "38", "39", "40", "41"] },
  { label: "EU 39–46", sizes: ["39", "40", "41", "42", "43", "44", "45", "46"] },
  { label: "EU 36–45", sizes: ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45"] },
];
const fashionSizeRuns = [
  { label: "XS–XXL", sizes: ["XS", "S", "M", "L", "XL", "XXL"] },
  { label: "Women 24–32", sizes: ["24", "25", "26", "27", "28", "29", "30", "31", "32"] },
  { label: "Men 28–38", sizes: ["28", "30", "32", "34", "36", "38"] },
];


function createVariant(overrides: Partial<Omit<VariantRow, "id">> = {}): VariantRow {
  return {
    id: crypto.randomUUID(),
    size: "",
    color: "",
    sku: "",
    costPrice: "0",
    sellingPrice: "0",
    stockQuantity: "0",
    lowStockQuantity: "5",
    ...overrides,
  };
}

function skuPart(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

export default function VariantProductForm({
  categories,
  businessType = "general",
}: {
  categories: Category[];
  businessType?: string;
}) {
  const isShoes = businessType === "shoes";
  const isFashion = businessType === "fashion";
  const isSpecialVariant = isShoes || isFashion;
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    createVariantProduct,
    initialState,
  );
  const [productName, setProductName] = useState("");
  const [variants, setVariants] = useState<VariantRow[]>([
    createVariant(),
  ]);
  const [quickColor, setQuickColor] = useState("Black");
  const [quickSkuPrefix, setQuickSkuPrefix] = useState("");
  const [quickCost, setQuickCost] = useState("0");
  const [quickPrice, setQuickPrice] = useState("0");
  const [quickStock, setQuickStock] = useState("0");

  useEffect(() => {
    if (!state.message) return;
    if (state.success) {
      toast.success(state.message);
      formRef.current?.reset();
      setProductName("");
      setVariants([createVariant()]);
      setQuickColor("Black");
      setQuickSkuPrefix("");
      setQuickCost("0");
      setQuickPrice("0");
      setQuickStock("0");
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

  const duplicateCombinations = useMemo(() => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const variant of variants) {
      const size = variant.size.trim().toLowerCase();
      const color = variant.color.trim().toLowerCase();
      if (!size && !color) continue;
      const key = `${color}|${size}`;
      if (seen.has(key)) duplicates.add(key);
      seen.add(key);
    }
    return duplicates;
  }, [variants]);

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

  function addShoeSizeRun(sizes: string[]) {
    const color = quickColor.trim() || "Default";
    const base = skuPart(quickSkuPrefix) || skuPart(productName) || "SHOE";
    const colorCode = skuPart(color).slice(0, 8) || "CLR";
    const existingKeys = new Set(
      variants
        .filter((row) => row.size.trim() || row.color.trim())
        .map((row) => `${row.color.trim().toLowerCase()}|${row.size.trim().toLowerCase()}`),
    );

    const generated = sizes
      .filter((size) => !existingKeys.has(`${color.toLowerCase()}|${size.toLowerCase()}`))
      .map((size) =>
        createVariant({
          size,
          color,
          sku: `${base}-${colorCode}-${size}`,
          costPrice: quickCost || "0",
          sellingPrice: quickPrice || "0",
          stockQuantity: quickStock || "0",
          lowStockQuantity: "2",
        }),
      );

    setVariants((current) => {
      const onlyBlank =
        current.length === 1 &&
        !current[0].size &&
        !current[0].color &&
        !current[0].sku;
      return onlyBlank ? generated : [...current, ...generated];
    });
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

      <Field label={isShoes ? "Shoe model" : isFashion ? "Style / model" : "Product name"} htmlFor="variant-name">
        <input
          id="variant-name"
          name="name"
          required
          minLength={2}
          value={productName}
          onChange={(event) => setProductName(event.target.value)}
          placeholder={isShoes ? "Air Runner 01" : isFashion ? "Oversized Essential Tee" : "Classic T-Shirt"}
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
          placeholder={isShoes ? "Material, fit, collection or shoe details" : isFashion ? "Material, fit, collection, season or style details" : "Optional product description"}
          className={`${inputClass} resize-none`}
        />
      </Field>

      {isSpecialVariant && (
        <section className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
          <div>
            <h3 className="font-semibold text-slate-900">{isShoes ? "Quick shoe size run" : "Quick fashion size run"}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              {isShoes ? "Enter a colour, SKU prefix, price and starting stock, then add a full EU size run in one tap." : "Enter a colour, SKU prefix, price and starting stock, then add a common clothing size run in one tap."} You can edit every size below before saving.
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <VariantField
              label="Colour"
              value={quickColor}
              placeholder="Black"
              onChange={setQuickColor}
            />
            <VariantField
              label="SKU prefix"
              value={quickSkuPrefix}
              placeholder="AIR01"
              onChange={setQuickSkuPrefix}
            />
            <VariantField
              label="Cost price"
              value={quickCost}
              type="number"
              min="0"
              step="0.01"
              onChange={setQuickCost}
            />
            <VariantField
              label="Selling price"
              value={quickPrice}
              type="number"
              min="0"
              step="0.01"
              onChange={setQuickPrice}
            />
            <VariantField
              label="Stock per size"
              value={quickStock}
              type="number"
              min="0"
              onChange={setQuickStock}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {(isShoes ? shoeSizeRuns : fashionSizeRuns).map((run) => (
              <button
                key={run.label}
                type="button"
                onClick={() => addShoeSizeRun(run.sizes)}
                className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
              >
                + {run.label}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div>
            <h3 className="font-semibold text-slate-900">
              {isShoes ? "Shoe sizes & colours" : isFashion ? "Clothing sizes & colours" : "Variants"}
            </h3>
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
            <Plus size={16} /> {isSpecialVariant ? "Add Size" : "Add Variant"}
          </button>
        </div>

        {duplicateCombinations.size > 0 && (
          <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            The same size + colour appears more than once. Keep only one inventory row for each variation.
          </div>
        )}

        <div className="space-y-4 p-4">
          {variants.map((variant, index) => {
            const pairKey = `${variant.color.trim().toLowerCase()}|${variant.size.trim().toLowerCase()}`;
            const duplicate = duplicateCombinations.has(pairKey);
            return (
              <div
                key={variant.id}
                className={`rounded-xl border bg-white p-4 ${duplicate ? "border-amber-300" : "border-slate-200"}`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">
                    {isShoes
                      ? `Shoe variation ${index + 1}${variant.size ? ` · EU ${variant.size}` : ""}`
                      : isFashion
                        ? `Fashion variation ${index + 1}${variant.size ? ` · Size ${variant.size}` : ""}`
                        : `Variant ${index + 1}`}
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
                    label={isShoes ? "EU size" : "Size"}
                    value={variant.size}
                    placeholder={isShoes ? "41" : isFashion ? "XS, S, M, L, XL" : "S, M, 40, 41"}
                    required={isSpecialVariant}
                    onChange={(value) => updateVariant(variant.id, "size", value)}
                  />
                  <VariantField
                    label="Colour"
                    value={variant.color}
                    placeholder="Black"
                    required={isSpecialVariant}
                    onChange={(value) => updateVariant(variant.id, "color", value)}
                  />
                  <VariantField
                    label="SKU"
                    value={variant.sku}
                    placeholder={isShoes ? "AIR01-BLK-41" : isFashion ? "TEE01-BLK-M" : "TS-BLK-M"}
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
            );
          })}
        </div>
      </section>

      <button
        type="submit"
        disabled={pending || duplicateCombinations.size > 0}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? (
          <>
            <Loader2 size={18} className="animate-spin" /> Creating...
          </>
        ) : (
          <>
            <PackagePlus size={18} /> {isShoes ? "Create Shoe & Inventory" : isFashion ? "Create Style & Inventory" : "Create Variant Product"}
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
