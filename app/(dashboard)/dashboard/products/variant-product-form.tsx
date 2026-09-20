"use client";

import {
  Loader2,
  PackagePlus,
  Plus,
  Shirt,
  Trash2,
  Upload,
  Zap,
} from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

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
  imageSlot: string | null;
};

type RunImageSlot = {
  id: string;
  preview: string | null;
  name: string;
  locked: boolean;
};

function createRunImageSlot(id = crypto.randomUUID()): RunImageSlot {
  return { id, preview: null, name: "", locked: false };
}

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
  { label: "XS – XXL", sizes: ["XS", "S", "M", "L", "XL", "XXL"] },
  { label: "Women 24 – 32", sizes: ["24", "25", "26", "27", "28", "29", "30", "31", "32"] },
  { label: "Men 28 – 38", sizes: ["28", "30", "32", "34", "36", "38"] },
];

function createVariant(
  overrides: Partial<Omit<VariantRow, "id">> = {},
  id = crypto.randomUUID(),
): VariantRow {
  return {
    id,
    size: "",
    color: "",
    sku: "",
    costPrice: "0",
    sellingPrice: "0",
    stockQuantity: "0",
    lowStockQuantity: "5",
    imageSlot: null,
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
  categories, branches=[],
  businessType = "general",
  onCreated,
}: {
  categories: Category[]; branches?:{id:string;name:string}[];
  businessType?: string;
  onCreated?: () => void;
}) {
  const isShoes = businessType === "shoes";
  const isFashion = businessType === "fashion";
  const isSpecialVariant = isShoes || isFashion;
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(createVariantProduct, initialState);
  const [productName, setProductName] = useState("");
  const [variants, setVariants] = useState<VariantRow[]>([createVariant({}, "initial-variant")]);
  const [quickColor, setQuickColor] = useState("Black");
  const [quickSkuPrefix, setQuickSkuPrefix] = useState("");
  const [quickCost, setQuickCost] = useState("0");
  const [quickPrice, setQuickPrice] = useState("0");
  const [quickStock, setQuickStock] = useState("0");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageName, setImageName] = useState("");
  const [runImageSlots, setRunImageSlots] = useState<RunImageSlot[]>(() => [createRunImageSlot("initial-run")]);

  const activeRunImageSlot =
    runImageSlots.find((slot) => !slot.locked) ?? runImageSlots[runImageSlots.length - 1];

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

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
      setImagePreview(null);
      setImageName("");
      for (const slot of runImageSlots) {
        if (slot.preview) URL.revokeObjectURL(slot.preview);
      }
      setRunImageSlots([createRunImageSlot()]);
      onCreated?.();
    } else {
      toast.error(state.message);
    }
  }, [state, onCreated]);

  const totalStock = useMemo(
    () => variants.reduce((total, variant) => total + Number(variant.stockQuantity || 0), 0),
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
    field: keyof Omit<VariantRow, "id" | "imageSlot">,
    value: string,
  ) {
    setVariants((current) =>
      current.map((variant) =>
        variant.id === id ? { ...variant, [field]: value } : variant,
      ),
    );
  }

  function addSizeRun(sizes: string[]) {
    const color = quickColor.trim() || "Default";
    const base = skuPart(quickSkuPrefix) || skuPart(productName) || (isShoes ? "SHOE" : "STYLE");
    const colorCode = skuPart(color).slice(0, 8) || "CLR";
    const existingKeys = new Set(
      variants
        .filter((row) => row.size.trim() || row.color.trim())
        .map((row) => `${row.color.trim().toLowerCase()}|${row.size.trim().toLowerCase()}`),
    );

    const runImageSlotId = activeRunImageSlot?.preview ? activeRunImageSlot.id : null;
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
          lowStockQuantity: "5",
          imageSlot: runImageSlotId,
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

    if (generated.length > 0 && runImageSlotId) {
      setRunImageSlots((current) => [
        ...current.map((slot) =>
          slot.id === runImageSlotId ? { ...slot, locked: true } : slot,
        ),
        createRunImageSlot(),
      ]);
    }
  }

  function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setImageName("");
      setImagePreview(null);
      return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Only JPG, PNG or WebP images are allowed.");
      event.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size must not exceed 5 MB.");
      event.target.value = "";
      return;
    }

    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(URL.createObjectURL(file));
    setImageName(file.name);
  }

  function handleRunImageChange(
    slotId: string,
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    if (!file) {
      setRunImageSlots((current) =>
        current.map((slot) => {
          if (slot.id !== slotId) return slot;
          if (slot.preview) URL.revokeObjectURL(slot.preview);
          return { ...slot, preview: null, name: "" };
        }),
      );
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Only JPG, PNG or WebP images are allowed.");
      event.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size must not exceed 5 MB.");
      event.target.value = "";
      return;
    }
    setRunImageSlots((current) =>
      current.map((slot) => {
        if (slot.id !== slotId) return slot;
        if (slot.preview) URL.revokeObjectURL(slot.preview);
        return { ...slot, preview: URL.createObjectURL(file), name: file.name };
      }),
    );
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <label className="block text-sm font-semibold text-slate-700">Assign to Branch<select name="locationId" required defaultValue={branches[0]?.id||""} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"><option value="" disabled>Choose branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
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
            imageSlot: variant.imageSlot,
          })),
        )}
      />

      {runImageSlots.map((slot) => (
        <input
          key={slot.id}
          id={`run-image-${slot.id}`}
          name={`runImage_${slot.id}`}
          type="file"
          accept=".jpg,.jpeg,.png,.webp"
          onChange={(event) => handleRunImageChange(slot.id, event)}
          className="sr-only"
        />
      ))}

      <section>
        <h2 className="mb-3 text-sm font-bold text-slate-900">Basic Information</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={isShoes ? "Shoe / Model name" : isFashion ? "Style / Model name" : "Product name"} required>
            <input
              name="name"
              required
              minLength={2}
              value={productName}
              onChange={(event) => setProductName(event.target.value)}
              placeholder={isShoes ? "Air Runner 01" : isFashion ? "Oversized Essential Tee" : "Classic T-Shirt"}
              className={inputClass}
            />
          </Field>

          <Field label="Category">
            <select name="categoryId" defaultValue="" className={inputClass}>
              <option value="">No category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section>
        <p className="mb-2 text-xs font-semibold text-slate-800">Product Image</p>
        <label className="group flex min-h-28 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center transition hover:border-blue-400 hover:bg-blue-50/40">
          {imagePreview ? (
            <div className="flex w-full items-center gap-3 p-3 text-left">
              <img src={imagePreview} alt="Product preview" className="h-20 w-20 rounded-xl border border-slate-200 object-cover" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">{imageName}</p>
                <p className="mt-1 text-xs text-slate-500">Click to replace image</p>
              </div>
            </div>
          ) : (
            <div className="px-4 py-5">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Upload size={19} />
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-700">Upload product image</p>
              <p className="mt-1 text-[11px] text-slate-400">JPG, PNG or WebP · Max 5 MB</p>
            </div>
          )}
          <input
            name="image"
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            onChange={handleImageChange}
            className="sr-only"
          />
        </label>
      </section>

      <Field label="Description">
        <textarea
          name="description"
          rows={3}
          placeholder={
            isShoes
              ? "Material, fit, collection or shoe details..."
              : isFashion
                ? "Material, fit, collection, season or style details..."
                : "Optional product description..."
          }
          className={`${inputClass} resize-none`}
        />
      </Field>

      {isSpecialVariant && (
        <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-3">
          <div className="flex items-start gap-2">
            <Zap size={17} className="mt-0.5 shrink-0 text-blue-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {isShoes ? "Quick shoe size run" : "Quick fashion size run"}
              </h3>
              <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                Enter a colour, SKU prefix, prices and starting stock, then add a common size run in one tap.
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <MiniField label="Colour" value={quickColor} placeholder="Black" onChange={setQuickColor} />
            <MiniField label="SKU prefix" value={quickSkuPrefix} placeholder="TEE01" onChange={setQuickSkuPrefix} />
            <MiniField label="Cost price" value={quickCost} type="number" min="0" step="0.01" onChange={setQuickCost} />
            <MiniField label="Selling price" value={quickPrice} type="number" min="0" step="0.01" onChange={setQuickPrice} />
            <MiniField label="Initial stock per size" value={quickStock} type="number" min="0" onChange={setQuickStock} />
            <label
              htmlFor={activeRunImageSlot ? `run-image-${activeRunImageSlot.id}` : undefined}
              className="block min-w-0"
            >
              <span className="mb-1 flex items-center gap-1.5 whitespace-nowrap text-[10px] font-semibold text-slate-600">
                Colour image
                <span className="font-medium text-slate-400">Optional</span>
              </span>
              <span className="flex h-9 cursor-pointer items-center gap-2 overflow-hidden rounded-lg border border-blue-200 bg-white px-2 text-[11px] font-semibold text-slate-600 hover:bg-blue-50">
                {activeRunImageSlot?.preview ? (
                  <>
                    <img src={activeRunImageSlot.preview} alt="Colour run" className="h-6 w-6 shrink-0 rounded object-cover" />
                    <span className="min-w-0 flex-1 truncate">{activeRunImageSlot.name || "Selected image"}</span>
                  </>
                ) : (
                  <>
                    <Upload size={13} className="shrink-0 text-blue-600" />
                    <span className="min-w-0 flex-1 truncate whitespace-nowrap">Add run image</span>
                  </>
                )}
              </span>
            </label>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(isShoes ? shoeSizeRuns : fashionSizeRuns).map((run) => (
              <button
                key={run.label}
                type="button"
                onClick={() => addSizeRun(run.sizes)}
                className="rounded-lg border border-blue-200 bg-white px-2.5 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
              >
                {run.label}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-3">
          <div className="flex min-w-0 items-start gap-2">
            <Shirt size={17} className="mt-0.5 shrink-0 text-slate-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {isShoes ? "Shoe sizes & colours" : isFashion ? "Clothing sizes & colours" : "Variants"}
              </h3>
              <p className="text-[11px] text-slate-500">
                {variants.length} variant{variants.length === 1 ? "" : "s"} · {totalStock} total stock
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {variants.length > 0 && (
              <button
                type="button"
                onClick={() => setVariants([])}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100"
              >
                <Trash2 size={14} /> Delete All
              </button>
            )}
            <button
              type="button"
              onClick={() => setVariants((current) => [...current, createVariant()])}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
            >
              <Plus size={14} /> {isSpecialVariant ? "Add Size" : "Add Variant"}
            </button>
          </div>
        </div>

        {duplicateCombinations.size > 0 && (
          <div className="m-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
            The same size + colour appears more than once. Keep one inventory row for each variation.
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[730px] text-xs">
            <thead className="bg-white text-[10px] uppercase tracking-wide text-slate-400">
              <tr className="border-b border-slate-200">
                <th className="w-14 px-2 py-2 text-left font-semibold">Image</th>
                <th className="px-2 py-2 text-left font-semibold">Size</th>
                <th className="px-2 py-2 text-left font-semibold">Colour</th>
                <th className="px-2 py-2 text-left font-semibold">SKU</th>
                <th className="px-2 py-2 text-left font-semibold">Cost</th>
                <th className="px-2 py-2 text-left font-semibold">Price</th>
                <th className="px-2 py-2 text-left font-semibold">Stock</th>
                <th className="px-2 py-2 text-left font-semibold">Alert</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {variants.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center">
                    <p className="text-xs font-semibold text-slate-600">No sizes or variants added</p>
                    <p className="mt-1 text-[11px] text-slate-400">Use Add Size or a quick size run to add inventory rows.</p>
                  </td>
                </tr>
              )}
              {variants.map((variant) => {
                const pairKey = `${variant.color.trim().toLowerCase()}|${variant.size.trim().toLowerCase()}`;
                const duplicate = duplicateCombinations.has(pairKey);
                return (
                  <tr key={variant.id} className={duplicate ? "bg-amber-50" : "bg-white"}>
                    <td className="w-14 px-2 py-2">
                      {(() => {
                        const runPreview = variant.imageSlot
                          ? runImageSlots.find((slot) => slot.id === variant.imageSlot)?.preview ?? null
                          : null;
                        const preview = runPreview ?? imagePreview;

                        return preview ? (
                          <img
                            src={preview}
                            alt={`${variant.color || "Variant"} ${variant.size || "image"}`}
                            className="h-8 w-8 rounded-md border border-slate-200 object-cover"
                          />
                        ) : (
                          <span className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-300">
                            <Shirt size={14} />
                          </span>
                        );
                      })()}
                    </td>
                    <CellInput value={variant.size} placeholder={isShoes ? "41" : "M"} required={isSpecialVariant} onChange={(value) => updateVariant(variant.id, "size", value)} />
                    <CellInput value={variant.color} placeholder="Black" required={isSpecialVariant} onChange={(value) => updateVariant(variant.id, "color", value)} />
                    <CellInput value={variant.sku} placeholder="TEE01-BLK-M" required onChange={(value) => updateVariant(variant.id, "sku", value)} wide />
                    <CellInput value={variant.costPrice} type="number" min="0" step="0.01" required onChange={(value) => updateVariant(variant.id, "costPrice", value)} />
                    <CellInput value={variant.sellingPrice} type="number" min="0" step="0.01" required onChange={(value) => updateVariant(variant.id, "sellingPrice", value)} />
                    <CellInput value={variant.stockQuantity} type="number" min="0" required onChange={(value) => updateVariant(variant.id, "stockQuantity", value)} />
                    <CellInput value={variant.lowStockQuantity} type="number" min="0" required onChange={(value) => updateVariant(variant.id, "lowStockQuantity", value)} />
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        disabled={variants.length === 1}
                        onClick={() => setVariants((current) => current.filter((row) => row.id !== variant.id))}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                        aria-label="Remove variant"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <button
        type="submit"
        disabled={pending || variants.length === 0 || duplicateCombinations.size > 0}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <>
            <Loader2 size={17} className="animate-spin" /> Creating...
          </>
        ) : (
          <>
            <PackagePlus size={17} /> {isShoes ? "Create Shoe & Inventory" : isFashion ? "Create Style & Inventory" : "Create Variant Product"}
          </>
        )}
      </button>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function MiniField({
  label,
  value,
  placeholder,
  type = "text",
  min,
  step,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  type?: string;
  min?: string;
  step?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-[10px] font-semibold text-slate-500">
      {label}
      <input
        value={value}
        placeholder={placeholder}
        type={type}
        min={min}
        step={step}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
    </label>
  );
}

function CellInput({
  value,
  placeholder,
  type = "text",
  min,
  step,
  required,
  wide,
  onChange,
}: {
  value: string;
  placeholder?: string;
  type?: string;
  min?: string;
  step?: string;
  required?: boolean;
  wide?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <td className={`px-2 py-2 ${wide ? "min-w-32" : "min-w-20"}`}>
      <input
        value={value}
        placeholder={placeholder}
        type={type}
        min={min}
        step={step}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
    </td>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
