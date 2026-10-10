"use client";
import { useLanguage } from "@/components/providers/language-provider";
import { formatUiText } from "@/lib/i18n/translations";

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
import ProductGalleryInput from "@/components/product-gallery-input";
import quickStyles from "./quick-fashion.module.css";
import { generateInternalBarcode } from "@/lib/barcode/generate";

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
  barcode: string;
  costPrice: string;
  sellingPrice: string;
  stockQuantity: string;
  lowStockQuantity: string;
  imageSlot: string | null;
};

type RunImageSlot = {
  file?: File;
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
    barcode: "",
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
  const { t: translateLabel } = useLanguage();

  const isShoes = businessType === "shoes";
  const isFashion = businessType === "fashion";
  const isGeneral = businessType === "general";
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
  const [sizePreset, setSizePreset] = useState(0);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [runImageSlots, setRunImageSlots] = useState<RunImageSlot[]>(() => [createRunImageSlot("initial-run")]);

  const activeRunImageSlot =
    runImageSlots.find((slot) => !slot.locked) ?? runImageSlots[runImageSlots.length - 1];



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
      setSizePreset(0);
      setSelectedSizes([]);
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

  function handleRunImageChange(
    slotId: string,
    event: React.ChangeEvent<HTMLInputElement>,
    variantId?: string,
  ) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Only JPG, PNG or WebP images are allowed.");
      event.target.value = "";
      return;
    }
    if (!file.size || file.size > 5 * 1024 * 1024) {
      toast.error("Image size must not exceed 5 MB.");
      event.target.value = "";
      return;
    }
    const preview = URL.createObjectURL(file);
    const previous = runImageSlots.find(slot => slot.id === slotId);
    if (previous?.preview) URL.revokeObjectURL(previous.preview);
    setRunImageSlots(current => {
      const next = { ...(current.find(slot => slot.id === slotId) ?? createRunImageSlot(slotId)), file, preview, name: file.name, locked: Boolean(variantId) || Boolean(previous?.locked) };
      return current.some(slot => slot.id === slotId) ? current.map(slot => slot.id === slotId ? next : slot) : [...current, next];
    });
    if (variantId) setVariants(rows => rows.map(row => row.id === variantId ? { ...row, imageSlot: slotId } : row));
  }

  return (
    <form ref={formRef} action={formAction} className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <label className="col-span-full flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-700 sm:flex-row sm:items-center sm:justify-between">Assign to Branch<select name="locationId" required defaultValue={branches[0]?.id||""} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm sm:max-w-xs"><option value="" disabled>Choose branch</option>{branches.map(b=><option key={b.id} value={b.id} data-i18n-ignore="true">{b.name}</option>)}</select></label>
      <input
        type="hidden"
        name="variants"
        value={JSON.stringify(
          variants.map((variant) => ({
            size: variant.size.trim(),
            color: variant.color.trim(),
            sku: variant.sku.trim(),
            barcode: variant.barcode,
            costPrice: Number(variant.costPrice),
            sellingPrice: Number(variant.sellingPrice),
            stockQuantity: Number(variant.stockQuantity),
            lowStockQuantity: Number(variant.lowStockQuantity),
            imageSlot: variant.imageSlot,
          })),
        )}
      />

      {runImageSlots.filter(slot => !slot.locked || variants.some(row => row.imageSlot === slot.id)).map((slot) => (
        <input
          key={slot.id}
          id={`run-image-${slot.id}`}
          name={`runImage_${slot.id}`}
          ref={node => { if (node && slot.file) { const data = new DataTransfer(); data.items.add(slot.file); node.files = data.files; } }}
          type="file"
          accept=".jpg,.jpeg,.png,.webp"
          onChange={(event) => handleRunImageChange(slot.id, event)}
          className="sr-only"
        />
      ))}

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 lg:col-span-2">
        <div><h2 className="text-sm font-bold text-slate-900">Product information</h2><p className="mt-1 text-xs text-slate-500">Add the name, category and details customers will see.</p></div>
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
                <option key={category.id} value={category.id} data-i18n-ignore="true">
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
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
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><ProductGalleryInput /></section>



      {isGeneral && (
        <label className="col-span-full flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <input
            type="checkbox"
            name="isOnline"
            defaultChecked
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span>
            <span className="block text-sm font-semibold text-slate-800">Show on online store</span>
            <span className="mt-0.5 block text-xs leading-5 text-slate-500">All variants will follow this online visibility when created.</span>
          </span>
        </label>
      )}

      {isSpecialVariant && (
        <section className="col-span-full rounded-2xl border border-teal-200 bg-teal-50/50 p-4 sm:p-5">
          <div className="flex items-start gap-2">
            <Zap size={17} className="mt-0.5 shrink-0 text-blue-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {isShoes ? "Quick shoe size run" : "Quick fashion size run"}
              </h3>
              <p className={`mt-0.5 text-[11px] leading-4 text-slate-500 ${isFashion ? quickStyles.legacy : ""}`}>
                Enter a colour, SKU prefix, prices and starting stock, then add a common size run in one tap.
              </p>
            </div>
          </div>

          {isFashion && <div className={quickStyles.desktop}>
            <p className="mt-1 text-xs text-slate-500">{translateLabel("Select sizes first, then click Add.")}</p>
            <div role="tablist" aria-label={translateLabel("Size presets")} className="mt-4 flex flex-wrap gap-2">
              {fashionSizeRuns.map((run, index) => <button key={run.label} type="button" role="tab" tabIndex={sizePreset === index ? 0 : -1} aria-selected={sizePreset === index} aria-controls="fashion-size-chips" id={`fashion-size-preset-${index}`} onClick={() => { setSizePreset(index); setSelectedSizes([]); }} onKeyDown={event => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === "Home" ? 0 : event.key === "End" ? fashionSizeRuns.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + fashionSizeRuns.length) % fashionSizeRuns.length;
                setSizePreset(next); setSelectedSizes([]);
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
              }} className={`min-h-10 rounded-lg border px-3 text-xs font-semibold transition-colors ${sizePreset === index ? "border-blue-600 bg-blue-600 text-white" : "border-blue-200 bg-white text-blue-700 hover:bg-blue-100"}`}>{translateLabel(run.label.replace("â€“", "–"))}</button>)}
            </div>
            <div id="fashion-size-chips" role="tabpanel" aria-labelledby={`fashion-size-preset-${sizePreset}`} className="mt-3 flex flex-wrap gap-2">
              {fashionSizeRuns[sizePreset].sizes.map(size => <button key={size} type="button" aria-pressed={selectedSizes.includes(size)} onClick={() => setSelectedSizes(current => current.includes(size) ? current.filter(value => value !== size) : [...current, size])} className={`min-h-10 min-w-12 rounded-lg border px-3 text-xs font-semibold transition-colors ${selectedSizes.includes(size) ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-blue-50"}`} data-i18n-ignore="true">{size}</button>)}
            </div>
          </div>}

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                    <span className="min-w-0 flex-1 truncate" data-i18n-ignore={Boolean(activeRunImageSlot.name)}>{activeRunImageSlot.name || "Selected image"}</span>
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

          <div className={`mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 ${isFashion ? quickStyles.legacy : ""}`}>
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
          {isFashion && <div className={quickStyles.desktop}>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-teal-200 pt-4">
              <p className="text-xs text-slate-600" aria-live="polite">{translateLabel("Selected sizes")}: <span data-i18n-ignore="true">{selectedSizes.join(", ") || "—"}</span></p>
              <button type="button" disabled={!selectedSizes.length || pending} onClick={() => { addSizeRun(fashionSizeRuns[sizePreset].sizes.filter(size => selectedSizes.includes(size))); setSelectedSizes([]); }} className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50">{formatUiText(translateLabel("Add {0} sizes"), [selectedSizes.length])}</button>
            </div>
          </div>}
        </section>
      )}

      <section className="col-span-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4">
          <div className="flex min-w-0 items-start gap-2">
            {isGeneral ? (
              <PackagePlus size={17} className="mt-0.5 shrink-0 text-slate-600" />
            ) : (
              <Shirt size={17} className="mt-0.5 shrink-0 text-slate-600" />
            )}
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {isShoes
                  ? "Shoe sizes & colours"
                  : isFashion
                    ? "Clothing sizes & colours"
                    : isGeneral
                      ? "Options & variants"
                      : "Variants"}
              </h3>
              <p className="text-[11px] text-slate-500">
                {variants.length} variant{variants.length === 1 ? "" : "s"} · {totalStock} total stock
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => setVariants(rows => rows.map(row => row.barcode.trim() ? row : { ...row, barcode: generateInternalBarcode() }))} className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-700">Generate missing barcodes</button>
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
                <th className="px-2 py-2 text-left font-semibold">{isGeneral ? "Size / option" : "Size"}</th>
                <th className="px-2 py-2 text-left font-semibold">{isGeneral ? "Color" : "Colour"}</th>
                <th className="px-2 py-2 text-left font-semibold">SKU</th>
                <th className="px-2 py-2 text-left font-semibold">Barcode</th>
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
                  <td colSpan={10} className="px-4 py-8 text-center">
                    <p className="text-xs font-semibold text-slate-600">{isGeneral ? "No variants added" : "No sizes or variants added"}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {isGeneral
                        ? "Use Add Variant to create options with their own SKU, price and stock."
                        : "Use Add Size or a quick size run to add inventory rows."}
                    </p>
                  </td>
                </tr>
              )}
              {variants.map((variant) => {
                const pairKey = `${variant.color.trim().toLowerCase()}|${variant.size.trim().toLowerCase()}`;
                const duplicate = duplicateCombinations.has(pairKey);
                return (
                  <tr key={variant.id} className={duplicate ? "bg-amber-50" : "bg-white"}>
                    <td className="w-20 px-2 py-2">
                      <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg p-1 text-teal-700 hover:bg-teal-50" title="Upload or replace this size's image">
                        {runImageSlots.find(slot => slot.id === variant.imageSlot)?.preview ? (
                          <img src={runImageSlots.find(slot => slot.id === variant.imageSlot)?.preview ?? ""} alt={formatUiText(translateLabel("{0} {1}"), [variant.color || (translateLabel("Variant")), variant.size || (translateLabel("image"))])} className="h-10 w-10 rounded-lg border border-slate-200 object-contain"  data-i18n-ignore-attributes="alt"/>
                        ) : <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-dashed border-teal-300 bg-teal-50"><Upload size={16} /></span>}
                        <span className="text-[10px] font-semibold">{variant.imageSlot ? "Replace" : "Upload"}</span>
                        <input type="file" accept=".jpg,.jpeg,.png,.webp" aria-label={formatUiText(translateLabel("Upload image for {0} {1}"), [variant.color || (translateLabel("variant")), variant.size || (translateLabel("new size"))])} className="sr-only" onChange={event => { handleRunImageChange(`size-${variant.id}`, event, variant.id); event.target.value = ""; }}  data-i18n-ignore-attributes="aria-label"/>
                      </label>
                    </td>
                    <CellInput
                      value={variant.size}
                      placeholder={isGeneral ? "500ml / 128GB / Large" : isShoes ? "41" : "M"}
                      required={isSpecialVariant}
                      onChange={(value) => updateVariant(variant.id, "size", value)}
                    />
                    <CellInput
                      value={variant.color}
                      placeholder={isGeneral ? "Optional" : "Black"}
                      required={isSpecialVariant}
                      onChange={(value) => updateVariant(variant.id, "color", value)}
                    />
                    <CellInput
                      value={variant.sku}
                      placeholder={isGeneral ? "ITEM-001-BLK" : "TEE01-BLK-M"}
                      required
                      onChange={(value) => updateVariant(variant.id, "sku", value)}
                      wide
                    />
                    <CellInput value={variant.barcode} placeholder="Scan, type or generate" wide onChange={(value) => updateVariant(variant.id, "barcode", value)} />
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

      <div className="sticky -bottom-4 col-span-full flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:-bottom-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500"><span className="font-semibold text-slate-800">{variants.length} variants</span> · {totalStock} units ready to create</p>
      <button
        type="submit"
        disabled={pending || variants.length === 0 || duplicateCombinations.size > 0}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {pending ? (
          <>
            <Loader2 size={17} className="animate-spin" /> Creating...
          </>
        ) : (
          <>
            <PackagePlus size={17} /> {isShoes
              ? "Create Shoe & Inventory"
              : isFashion
                ? "Create Style & Inventory"
                : isGeneral
                  ? "Create Product & Inventory"
                  : "Create Variant Product"}
          </>
        )}
      </button>
      </div>
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
