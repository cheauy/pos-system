"use client";

import { ArrowLeft, Check, ChevronLeft, ChevronRight, Loader2, Package, SlidersHorizontal, Plus, RotateCcw, Save, Shirt, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import ActionMenu from "@/components/anchored-action-menu";
import ProductGalleryInput from "@/components/product-gallery-input";
import { generateInternalBarcode } from "@/lib/barcode/generate";
import { MAX_SAVE_UPLOAD_BYTES, shrinkPhoto, uploadBytes } from "@/lib/images/shrink-photo";
import { compareColorSize, MAX_EDIT_VARIANTS, missingVariantCombinations, normalizeVariantText, splitVariantValues, validateEditableVariants } from "@/lib/products/variant-editor";
import { stockAdjustmentLink } from "@/lib/inventory/stock-adjustment";
import { deleteProductGroup, deleteProductVariants, updateProductGroup } from "../../actions";

type Category = { id: string; name: string };
type Product = { id: string; name: string; categoryId: string | null; description: string; barcode: string; imageUrl: string | null; images: string[]; galleryUrls: string[]; productType: string; variantGroupId: string | null; isActive: boolean; isOnline: boolean };
type InitialVariant = { isOnline?: boolean; barcode?: string; id: string; size: string; color: string; sku: string; costPrice: string; sellingPrice: string; stockQuantity: string; lowStockQuantity: string; isActive: boolean; imageUrl: string | null; variantImageUrl: string | null; imageSlot: string | null; expectedUpdatedAt?: string | null };
type Variant = Omit<InitialVariant, "id" | "imageUrl" | "variantImageUrl" | "imageSlot"> & { id: string | null; localId: string; imageKey: string | null };
type ImageAsset = { key: string; url: string; file: File | null; label: string };
type Draft = { name: string; description: string; categoryId: string; barcode: string; showOnline: boolean; mainImageKey: string | null; variants: Variant[] };
type Confirmation = { kind: "remove-image"; key: string } | { kind: "remove-all-images" } | { kind: "discard" } | { kind: "delete-variants"; ids: string[] } | { kind: "delete-product" };
const inputClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50";
const buttonClass = "inline-flex h-9 w-fit items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45";
const primaryClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45";
const destructiveClass = "inline-flex h-9 w-fit items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-45";
function createDraft(product: Product, initial: InitialVariant[]): Draft {
  return { name: product.name, description: product.description, categoryId: product.categoryId ?? "", barcode: product.barcode, showOnline: product.isOnline, mainImageKey: product.imageUrl,
    variants: initial.map(row => ({ id: row.id, localId: row.id, size: row.size, color: row.color, sku: row.sku, barcode: row.barcode ?? "", costPrice: row.costPrice, sellingPrice: row.sellingPrice, stockQuantity: row.stockQuantity, lowStockQuantity: row.lowStockQuantity, isActive: row.isActive, isOnline: row.isOnline ?? product.isOnline, imageKey: row.variantImageUrl, expectedUpdatedAt: row.expectedUpdatedAt })) };
}
function initialAssets(product: Product, rows: InitialVariant[]): ImageAsset[] {
  return Array.from(new Set([product.imageUrl, ...product.images, ...rows.map(row => row.variantImageUrl)].filter((url): url is string => Boolean(url))))
    .map((url, i) => ({ key: url, url, file: null, label: i === 0 && url === product.imageUrl ? "Main image" : `Product image ${i + 1}` }));
}
function fingerprint(draft: Draft) { return JSON.stringify(draft); }
function skuPart(value: string) { return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24); }

export default function EditProductClient({ product, categories, initialVariants, businessType, branchId, canCreateVariants = false, canDisable = false, canAdjustStock = false }: { product: Product; categories: Category[]; initialVariants: InitialVariant[]; businessType?: string; branchId: string; canCreateVariants?: boolean; canDisable?: boolean; canAdjustStock?: boolean }) {
  const router = useRouter();
  const supportsVariants = product.productType === "variant" && Boolean(product.variantGroupId);
  const [draft, setDraft] = useState(() => createDraft(product, initialVariants));
  const [savedFingerprint, setSavedFingerprint] = useState(() => fingerprint(createDraft(product, initialVariants)));
  const [assets, setAssets] = useState<ImageAsset[]>(() => initialAssets(product, initialVariants));
  const objectUrls = useRef(new Set<string>());
  const busyRef = useRef(false);
  const refreshingRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [mustReload, setMustReload] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(new Set<string>());
  const [page, setPage] = useState(1);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [deleteText, setDeleteText] = useState("");
  const [visibility, setVisibility] = useState<{ ids: string[]; pos: boolean; online: boolean } | null>(null);
  const [runImageKey, setRunImageKey] = useState<string | null>(null);
  const [add, setAdd] = useState({ colors: "", sizes: "", prefix: "", cost: initialVariants[0]?.costPrice ?? "0", price: initialVariants[0]?.sellingPrice ?? "0" });
  const [galleryChanged, setGalleryChanged] = useState(false);
  const [galleryVersion, setGalleryVersion] = useState(0);
  const dirty = galleryChanged || fingerprint(draft) !== savedFingerprint;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const loadedRef = useRef({ product, initialVariants, branchId });

  function releaseUploads() { objectUrls.current.forEach(url => URL.revokeObjectURL(url)); objectUrls.current.clear(); }
  function resetDraft() {
    releaseUploads(); setRunImageKey(null); setGalleryChanged(false); setGalleryVersion(value => value + 1);
    const next = createDraft(product, initialVariants);
    setRunImageKey(null); setDraft(next); setSavedFingerprint(fingerprint(next)); setAssets(initialAssets(product, initialVariants));
    setSelected(new Set()); setError(""); setStale(false); setMustReload(false); setPage(1);
  }
  useEffect(() => {
    const previous = loadedRef.current;
    if (previous.product === product && previous.initialVariants === initialVariants && previous.branchId === branchId) return;
    loadedRef.current = { product, initialVariants, branchId };
    // New prop objects from an unchanged refresh are not a conflicting edit.
    const unchanged = JSON.stringify(previous) === JSON.stringify({ product, initialVariants, branchId });
    if (unchanged && !refreshingRef.current) return;
    // Preserve drafts if another user actually changed the saved product.
    if (dirtyRef.current && !refreshingRef.current && previous.product.id === product.id && previous.branchId === branchId) { setStale(true); return; }
    const next = createDraft(product, initialVariants);
    objectUrls.current.forEach(url => URL.revokeObjectURL(url)); objectUrls.current.clear();
    setRunImageKey(null); setDraft(next); setSavedFingerprint(fingerprint(next)); setAssets(initialAssets(product, initialVariants));
    setSelected(new Set()); setError(""); setStale(false); setMustReload(false); setBusy(false);
    busyRef.current = false; refreshingRef.current = false;
  }, [product, initialVariants, branchId]);
  useEffect(() => () => { objectUrls.current.forEach(url => URL.revokeObjectURL(url)); }, []);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (dirtyRef.current || busyRef.current) { event.preventDefault(); event.returnValue = ""; } };
    const navigate = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download") || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (!dirtyRef.current && !busyRef.current) return;
      if (busyRef.current || !window.confirm("Leave this page? Unsaved product edits will be lost.")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, []);

  const assetMap = useMemo(() => new Map(assets.map(asset => [asset.key, asset])), [assets]);
  const imageUrl = (key: string | null) => key ? assetMap.get(key)?.url ?? null : null;
  const mainImageUrl = imageUrl(draft.mainImageKey);
  const validation = useMemo(() => validateEditableVariants(draft.variants, supportsVariants), [draft.variants, supportsVariants]);
  const sortedVariants = useMemo(() => [...draft.variants].sort(compareColorSize), [draft.variants]);
  const pageSize = 10, pageCount = Math.max(1, Math.ceil(sortedVariants.length / pageSize)), safePage = Math.min(page, pageCount);
  const visible = sortedVariants.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selectedRows = draft.variants.filter(row => selected.has(row.localId));
  const allVisible = visible.length > 0 && visible.every(row => selected.has(row.localId));
  const combinations = useMemo(() => missingVariantCombinations(draft.variants, splitVariantValues(add.colors), splitVariantValues(add.sizes)), [draft.variants, add.colors, add.sizes]);

  function updateRow(localId: string, field: keyof Variant, value: string | boolean | null) {
    setDraft(current => ({ ...current, variants: current.variants.map(row => row.localId === localId ? { ...row, [field]: value } : row) }));
  }
  function selectRows(ids: string[]) { setSelected(new Set(ids)); }
  function toggleRow(id: string) { setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function togglePage() { setSelected(current => { const next = new Set(current); visible.forEach(row => allVisible ? next.delete(row.localId) : next.add(row.localId)); return next; }); }
  async function uploadImage(event: ChangeEvent<HTMLInputElement>, ids: string[] | "run") {
    const chosen = event.target.files?.[0]; event.target.value = "";
    if (!chosen || !ids.length) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(chosen.type)) { toast.error("Choose a JPG, PNG or WebP image."); return; }
    if (chosen.size > 5 * 1024 * 1024 || !chosen.size) { toast.error("Choose a non-empty image up to 5 MB."); return; }
    // Shrink like the gallery does, so several colour photos fit one save request.
    let file: File;
    try { file = await shrinkPhoto(chosen); } catch { toast.error("Unable to read this photo."); return; }
    const asset = { key: `upload-${crypto.randomUUID()}`, url: URL.createObjectURL(file), file, label: file.name };
    objectUrls.current.add(asset.url); setAssets(current => [...current, asset]);
    if (ids === "run") { setRunImageKey(asset.key); return; }
    setDraft(current => ({ ...current, variants: current.variants.map(row => ids.includes(row.localId) ? { ...row, imageKey: asset.key } : row) }));
  }
  function addOne() {
    const row: Variant = { id: null, localId: crypto.randomUUID(), color: "", size: "", sku: "", costPrice: draft.variants[0]?.costPrice ?? "0", sellingPrice: draft.variants[0]?.sellingPrice ?? "0", stockQuantity: "0", lowStockQuantity: "5", isActive: true, isOnline: draft.showOnline, imageKey: null };
    if (draft.variants.length >= MAX_EDIT_VARIANTS) { toast.error(`Maximum ${MAX_EDIT_VARIANTS} variants.`); return; }
    setDraft(current => ({ ...current, variants: [...current.variants, row] }));
    setPage(1); selectRows([row.localId]);
    toast.info("New row added. Enter its colour, size and unique SKU before saving.");
  }
  function generateVariants() {
    if (!combinations.length || draft.variants.length + combinations.length > MAX_EDIT_VARIANTS) return;
    const seenSkus = new Set(draft.variants.map(row => normalizeVariantText(row.sku)));
    const prefix = skuPart(add.prefix) || skuPart(draft.name) || "ITEM";
    const additions: Variant[] = combinations.map(pair => {
      const base = `${prefix}-${skuPart(pair.color) || "CLR"}-${skuPart(pair.size) || "SIZE"}`;
      let sku = base, suffix = 2;
      while (seenSkus.has(normalizeVariantText(sku))) sku = `${base}-${suffix++}`;
      seenSkus.add(normalizeVariantText(sku));
      return { ...pair, id: null, localId: crypto.randomUUID(), sku, costPrice: add.cost, sellingPrice: add.price, stockQuantity: "0", lowStockQuantity: "5", isActive: true, isOnline: draft.showOnline, imageKey: runImageKey };
    });
    const next = [...draft.variants, ...additions], invalid = validateEditableVariants(next, true);
    if (invalid) { toast.error(invalid); return; }
    setDraft(current => ({ ...current, variants: next })); selectRows(additions.map(row => row.localId));
    setPage(1);
    toast.success(`${additions.length} new variants added to your draft. Existing combinations were skipped.`);
  }
  function openStockAdjustment(rows: Variant[]) {
    if (busy || mustReload || stale) { toast.error("Reload the saved product before adjusting stock."); return; }
    if (dirty || rows.some(row => !row.id)) { toast.error("Save or discard product changes first. New variants must be saved before adjusting stock."); return; }
    if (!canAdjustStock) { toast.error("You do not have permission to adjust stock."); return; }
    if (rows.some(row => !row.isActive)) { toast.error("Activate and save the selected variants before adjusting stock."); return; }
    try { router.push(stockAdjustmentLink(rows.map(row => row.id!), branchId, rows.length > 30 ? sessionStorage : undefined)); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to open the stock selection."); }
  }
  function requestDelete(ids: string[]) {
    const targets = draft.variants.filter(row => ids.includes(row.localId));
    if (!targets.length) return;
    if (targets.some(row => row.id) && (dirty || mustReload || stale)) { toast.error("Save or discard your draft before removing saved variants. This prevents losing other edits."); return; }
    if (targets.length === draft.variants.length) { setDeleteText(""); setConfirmation({ kind: "delete-product" }); }
    else setConfirmation({ kind: "delete-variants", ids: [...ids] });
  }
  function refreshProduct() { refreshingRef.current = true; router.refresh(); }
  async function confirmAction() {
    if (!confirmation || busyRef.current) return;
    if (confirmation.kind === "discard") { resetDraft(); setConfirmation(null); return; }
    if (confirmation.kind === "remove-image") {
      const key = confirmation.key;
      setDraft(current => ({ ...current, mainImageKey: current.mainImageKey === key ? null : current.mainImageKey, variants: current.variants.map(row => row.imageKey === key ? { ...row, imageKey: null } : row) }));
      setConfirmation(null); return;
    }
    if (confirmation.kind === "remove-all-images") {
      setDraft(current => ({ ...current, mainImageKey: null, variants: current.variants.map(row => ({ ...row, imageKey: null })) }));
      setConfirmation(null); return;
    }
    const targets = confirmation.kind === "delete-variants" ? draft.variants.filter(row => confirmation.ids.includes(row.localId)) : draft.variants;
    const savedIds = targets.flatMap(row => row.id ? [row.id] : []);
    if (!savedIds.length) {
      setDraft(current => ({ ...current, variants: current.variants.filter(row => !targets.some(target => target.localId === row.localId)) }));
      setSelected(new Set()); setConfirmation(null); return;
    }
    if (dirty || mustReload || stale) { toast.error("Save or discard changes before removing saved rows."); return; }
    busyRef.current = true; setBusy(true);
    try {
      const all = confirmation.kind === "delete-product";
      const result = all ? await deleteProductGroup(product.id, branchId) : await deleteProductVariants(product.id, savedIds, branchId);
      if (!result.success) { toast.error(result.message); return; }
      setConfirmation(null); setSelected(new Set()); toast.success(all ? "Product removed from this branch. Historical records are kept." : result.message);
      if (all) router.push("/dashboard/products");
      else if (savedIds.includes(product.id) && result.remainingProductId) router.replace(`/dashboard/products/${result.remainingProductId}/edit`);
      refreshProduct();
    } catch { toast.error("Removal could not be confirmed. Reload the product before trying again."); setMustReload(true); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current || mustReload || stale || !dirty) return;
    const invalid = validateEditableVariants(draft.variants, supportsVariants);
    if (invalid) { setError(invalid); toast.error(invalid); return; }
    if (draft.name.trim().length < 2) { setError("Enter a product name with at least two characters."); return; }
    busyRef.current = true; setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    form.set("productId", product.id); form.set("branchId", branchId); form.set("name", draft.name.trim());
    form.set("categoryId", draft.categoryId); form.set("description", draft.description); form.set("barcode", !supportsVariants ? draft.variants[0]?.barcode ?? draft.barcode : draft.barcode);
    form.set("isOnline", String(draft.showOnline));
    const uploads = new Set<string>();
    if (draft.mainImageKey === product.imageUrl) form.set("mainImageAction", "keep");
    else if (!draft.mainImageKey) form.set("mainImageAction", "remove");
    else {
      const asset = assetMap.get(draft.mainImageKey);
      if (!asset) { setError("Choose the main image again."); busyRef.current = false; setBusy(false); return; }
      form.set("mainImageAction", asset.file ? "upload" : "existing");
      if (asset.file) { form.set("mainImageSlot", asset.key); uploads.add(asset.key); }
      else form.set("mainImageUrl", asset.url);
    }
    form.set("variants", JSON.stringify(draft.variants.map(row => {
      const initial = initialVariants.find(saved => saved.id === row.id), asset = row.imageKey ? assetMap.get(row.imageKey) : null;
      const unchanged = Boolean(initial && row.imageKey === initial.variantImageUrl);
      const imageAction = unchanged ? "keep" : !asset ? "remove" : asset.file ? "upload" : "existing";
      if (asset?.file && !unchanged) uploads.add(asset.key);
      return { id: row.id, size: row.size.trim(), color: row.color.trim(), sku: row.sku.trim(), barcode: row.barcode, costPrice: row.costPrice, sellingPrice: row.sellingPrice,
        stockQuantity: row.stockQuantity, lowStockQuantity: row.lowStockQuantity, isActive: row.isActive, isOnline: row.isOnline, expectedUpdatedAt: row.expectedUpdatedAt ?? null,
        imageAction, variantImageUrl: imageAction === "existing" ? asset?.url : null, imageSlot: imageAction === "upload" ? asset?.key : null };
    })));
    uploads.forEach(key => { const asset = assetMap.get(key); if (asset?.file) form.set(`runImage_${key}`, asset.file); });
    // An oversized request is rejected before the action runs; say so definitely and keep the draft.
    if (uploadBytes(form) > MAX_SAVE_UPLOAD_BYTES) {
      const message = "These photos are too large to save together (15 MB limit). Remove or replace some photos, or save them in smaller batches. Nothing was saved.";
      setError(message); toast.error(message); busyRef.current = false; setBusy(false); return;
    }
    try {
      const result = await updateProductGroup({ success: false, message: "" }, form);
      if (!result.success) { setError(result.message); setMustReload(Boolean(result.refreshRequired)); toast.error(result.message); return; }
      toast.success(result.message); setGalleryChanged(false); setSavedFingerprint(fingerprint(draft)); refreshProduct();
      // Keep submission locked until fresh IDs / versions arrive, so a new
      // variant cannot be inserted again by a second click after Save succeeds.
    } catch { setMustReload(true); setError("The save result is uncertain. Reload and review the product before retrying; do not add the variants again."); }
    finally { if (!refreshingRef.current) { busyRef.current = false; setBusy(false); } }
  }
  function reload() { if (!dirty || window.confirm("Reload saved product data? Unsaved edits will be discarded.")) { dirtyRef.current = false; busyRef.current = false; window.location.reload(); } }

  return (
    <main className="mx-auto max-w-[1440px] space-y-3 pb-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div><Link href="/dashboard/products" className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-500"><ArrowLeft size={15} /> Back to Products</Link>
          <h1 className="text-2xl font-bold text-slate-950">Edit Product</h1></div>
        {canDisable && <button type="button" disabled={busy} onClick={() => requestDelete(draft.variants.map(row => row.localId))} className={`${destructiveClass} ml-auto`}><Trash2 size={14} /> Remove whole product</button>}
        {busy && <button type="button" onClick={reload} className={buttonClass}>Reload saved product</button>}
        <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${dirty ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{dirty ? "Unsaved changes" : "Saved product"}</span>
      </header>
      {(error || stale || mustReload) && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        {error || "This product changed while you were editing. Your draft was kept; reload to review the saved version."}
        {(stale || mustReload) && <button type="button" onClick={reload} className="ml-3 font-bold underline">Reload saved product</button>}
      </div>}
      <form onSubmit={save}>
        <fieldset disabled={busy} className="min-w-0 space-y-3">
          <div className="grid grid-cols-1 items-start gap-2 lg:grid-cols-3">
            <div className="order-1 min-w-0 space-y-2 lg:col-span-2">
              <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900"><Package size={17} /> Product information</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Product name"><input required minLength={2} maxLength={160} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} className={inputClass} /></Field>
                  <Field label="Category"><select value={draft.categoryId} onChange={e => setDraft({ ...draft, categoryId: e.target.value })} className={inputClass}><option value="">No category</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
                  <div className="sm:col-span-2"><Field label="Description"><textarea value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} rows={2} className={`${inputClass} h-auto py-2`} /></Field></div>
                </div>
              </section>
      {supportsVariants && canCreateVariants && <details className="rounded-xl border border-slate-200 bg-white px-4 py-3"><summary className="cursor-pointer text-sm font-bold text-slate-900">Quick size run<span className="ml-2 text-xs font-normal text-slate-500">Add several sizes together</span></summary>
        <p className="text-sm text-slate-500">Enter colours and sizes separated by commas. Every colour gets every size; existing combinations are skipped.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Colours"><input value={add.colors} placeholder="Black, White, Blue" onChange={e => setAdd({ ...add, colors: e.target.value })} className={inputClass} /></Field><Field label="Sizes"><input value={add.sizes} placeholder={businessType === "shoes" ? "36, 37, 38, 39" : "S, M, L, XL"} onChange={e => setAdd({ ...add, sizes: e.target.value })} className={inputClass} /></Field></div>
        <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-dashed border-teal-300 bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-teal-700">{runImageKey && imageUrl(runImageKey) ? <img src={imageUrl(runImageKey)!} alt="Quick size run" className="h-8 w-8 rounded object-contain" /> : <Upload size={16} />} {runImageKey ? "Replace run image" : "Upload run image"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Quick size run image" onChange={event => uploadImage(event, "run")} /></label>
        <div className="mt-2 flex flex-wrap gap-2">{[{ label: "XS–XXL", sizes: "XS, S, M, L, XL, XXL" }, { label: "Shoes 35–40", sizes: "35, 36, 37, 38, 39, 40" }, { label: "Shoes 40–45", sizes: "40, 41, 42, 43, 44, 45" }].map(run => <button key={run.label} type="button" onClick={() => setAdd({ ...add, sizes: run.sizes })} className={buttonClass}>{run.label}</button>)}</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3"><Field label="SKU prefix (optional)"><input value={add.prefix} placeholder={skuPart(draft.name) || "ITEM"} onChange={e => setAdd({ ...add, prefix: e.target.value })} className={inputClass} /></Field>{([["cost", "Cost price"], ["price", "Selling price"]] as const).map(([key, label]) => <Field key={key} label={label}><input type="number" min="0" step="0.01" value={add[key]} onChange={e => setAdd({ ...add, [key]: e.target.value })} className={inputClass} /></Field>)}</div>
        <div className="mt-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-900"><strong>{combinations.length} new variants</strong><p className="mt-1 text-xs">New sizes start at zero stock. Save first, then use Adjust stock.</p>{combinations.length > 0 && <p className="mt-2 text-xs">{combinations.slice(0, 10).map(pair => `${pair.color} / ${pair.size}`).join(" · ")}{combinations.length > 10 ? " …" : ""}</p>}{combinations.length + draft.variants.length > MAX_EDIT_VARIANTS && <p className="mt-2 font-semibold">Maximum {MAX_EDIT_VARIANTS} total variants. Add fewer combinations.</p>}</div>
        <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={!combinations.length || combinations.length + draft.variants.length > MAX_EDIT_VARIANTS} onClick={generateVariants} className={primaryClass}>Add {combinations.length} to draft</button></div>
      </details>}
            </div>

              <section className="order-4 col-span-full min-w-0 rounded-xl border border-slate-200 bg-white">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
                  <div><h2 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Shirt size={17} /> {supportsVariants ? businessType === "fashion" ? "Clothing sizes & colours" : businessType === "shoes" ? "Shoe sizes & colours" : "Variants" : "Inventory & pricing"}</h2><p className="mt-1 text-xs text-slate-500">Edit sizes, colours and prices below.</p></div>
                  {supportsVariants && canCreateVariants && <div className="flex flex-wrap gap-2"><button type="button" onClick={addOne} className={buttonClass}><Plus size={14} /> {businessType === "fashion" || businessType === "shoes" ? "Add Size" : "Add Variant"}</button></div>}
                </div>
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-2.5 py-1.5 text-xs">
                  <button type="button" onClick={() => selectRows(selectedRows.length ? [] : draft.variants.map(row => row.localId))} className={buttonClass}>{selectedRows.length ? "Clear" : "Select All"}</button>
                  <button type="button" onClick={() => setDraft(current => ({ ...current, variants: current.variants.map(row => row.barcode?.trim() ? row : { ...row, barcode: generateInternalBarcode() }) }))} className={buttonClass}>Generate missing barcodes</button>
                  <ActionMenu label="Actions" disabled={!selectedRows.length}>
                    {canAdjustStock && <button type="button" onClick={() => openStockAdjustment(selectedRows)} className={buttonClass}><SlidersHorizontal size={13} /> Adjust stock ({selectedRows.length})</button>}
                    <label className={`${buttonClass} cursor-pointer`}><Upload size={13} /> Upload for selected<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Upload image for selected variants" onChange={event => uploadImage(event, selectedRows.map(row => row.localId))} /></label>
                    <button type="button" disabled={!canDisable} onClick={() => setVisibility({ ids: selectedRows.map(row => row.localId), pos: selectedRows.every(row => row.isActive), online: selectedRows.every(row => row.isOnline) })} className={buttonClass}>Hide selected</button>
                    {supportsVariants && (canDisable || selectedRows.every(row => !row.id)) && <button type="button" onClick={() => requestDelete(selectedRows.map(row => row.localId))} className={destructiveClass}><Trash2 size={13} /> Remove selected</button>}
                  </ActionMenu>
                </div>
                {validation && <p className="m-3 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800" role="status">{validation}</p>}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1000px] text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="p-3"><input type="checkbox" checked={allVisible} onChange={togglePage} aria-label="Select this page" /></th><th className="p-2">Image</th><th className="p-2">Size</th><th className="p-2">Colour</th><th className="p-2">SKU</th><th className="p-2">Cost</th><th className="p-2">Price</th><th className="p-2">Inventory</th><th className="p-2">Low stock</th><th className="p-2">Status</th><th className="p-2">Action</th></tr></thead>
                    <tbody>
                      {visible.map((row, index) => {
                        const label = `${row.color || "New colour"} ${row.size || "New size"}`, preview = imageUrl(row.imageKey) ?? mainImageUrl;
                        return <Fragment key={row.localId}>
                          {(index === 0 || normalizeVariantText(visible[index - 1].color) !== normalizeVariantText(row.color)) && <tr className="bg-blue-50/50"><td colSpan={11} className="px-3 py-2"><span className="font-bold text-slate-700">{row.color.trim() || "New / unassigned colour"}</span><button type="button" onClick={() => selectRows(draft.variants.filter(item => normalizeVariantText(item.color) === normalizeVariantText(row.color)).map(item => item.localId))} className="ml-3 text-blue-700 underline">Select this colour</button></td></tr>}
                          <tr className={`border-t border-slate-100 ${selected.has(row.localId) ? "bg-blue-50/30" : "bg-white"}`}>
                            <td className="p-3"><input type="checkbox" checked={selected.has(row.localId)} onChange={() => toggleRow(row.localId)} aria-label={`Select ${label}`} /></td>
                            <td className="p-2"><div className="relative w-16"><label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg p-1 text-teal-700 hover:bg-teal-50">
                              {preview ? <img src={preview} alt={label} className="h-10 w-10 rounded-lg border border-slate-200 object-contain" /> : <span className="grid h-10 w-10 place-items-center rounded-lg border border-dashed border-teal-300 bg-teal-50"><Upload size={16} /></span>}
                              <span className="text-[10px] font-semibold">{preview ? "Replace" : "Upload"}</span>
                              <input type="file" accept="image/jpeg,image/png,image/webp" aria-label={`Upload image for ${label}`} className="sr-only" onChange={event => uploadImage(event, [row.localId])} />
                            </label>{row.imageKey && <button type="button" aria-label={`Remove image override for ${label}`} title="Use main product image" onClick={() => updateRow(row.localId, "imageKey", null)} className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full border border-slate-200 bg-white text-red-600"><X size={12} /></button>}</div></td>
                            <td className="p-2"><Cell label={`Size ${label}`} value={row.size} onChange={value => updateRow(row.localId, "size", value)} /></td>
                            <td className="p-2"><Cell label={`Colour ${label}`} value={row.color} onChange={value => updateRow(row.localId, "color", value)} /></td>
                            <td className="min-w-36 p-2"><Cell label={`SKU ${label}`} value={row.sku} onChange={value => updateRow(row.localId, "sku", value)} />{!row.id && <span className="text-[10px] font-semibold text-blue-600">New · not saved</span>}<input aria-label={`Barcode for ${label}`} placeholder="Barcode" value={row.barcode ?? ""} onChange={e => updateRow(row.localId, "barcode", e.target.value)} className={`${inputClass} mt-1 text-xs`} /></td>
                            <td className="p-2"><Cell label={`Cost ${label}`} number value={row.costPrice} onChange={value => updateRow(row.localId, "costPrice", value)} /></td>
                            <td className="p-2"><Cell label={`Price ${label}`} number value={row.sellingPrice} onChange={value => updateRow(row.localId, "sellingPrice", value)} /></td>
                            <td className="min-w-36 p-2"><button type="button" disabled={!row.id || !canAdjustStock} onClick={() => openStockAdjustment([row])} aria-label={`Adjust stock ${label}`} className={buttonClass}><SlidersHorizontal size={13} /> Adjust stock</button><p className="mt-1 text-[10px] text-slate-500">{row.id ? `Current: ${row.stockQuantity}` : "Save variant first · starts at 0"}</p></td>
                            <td className="p-2"><Cell label={`Low stock ${label}`} number integer value={row.lowStockQuantity} onChange={value => updateRow(row.localId, "lowStockQuantity", value)} /></td>
                            <td className="p-2"><button type="button" disabled={!canDisable} aria-label={`Toggle status for ${label}`} onClick={() => updateRow(row.localId, "isActive", !row.isActive)} className={`rounded-full px-2 py-1 text-[10px] font-bold ${row.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{row.isActive ? "Active" : "Hidden"}</button></td>
                            <td className="p-2">{supportsVariants && (canDisable || !row.id) && <button type="button" onClick={() => requestDelete([row.localId])} aria-label={`Remove variant ${label}`} className="grid h-8 w-8 place-items-center rounded-lg text-red-600 hover:bg-red-50"><Trash2 size={15} /></button>}</td>
                          </tr>
                        </Fragment>;
                      })}
                      {!visible.length && <tr><td colSpan={11} className="p-8 text-center text-slate-500">No variants yet. Add a size or use Quick size run above.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 p-3 text-xs text-slate-500"><p>{sortedVariants.length ? (safePage - 1) * pageSize + 1 : 0}–{Math.min(safePage * pageSize, sortedVariants.length)} of {sortedVariants.length} shown · {draft.variants.length} total</p><div className="flex items-center gap-2"><button type="button" aria-label="Previous page" disabled={safePage === 1} onClick={() => setPage(safePage - 1)} className={buttonClass}><ChevronLeft size={15} /></button><span>{safePage} / {pageCount}</span><button type="button" aria-label="Next page" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} className={buttonClass}><ChevronRight size={15} /></button></div></div>
              </section>
            <aside className="order-2 min-w-0 space-y-4 lg:col-start-3 lg:row-start-1">
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><ProductGalleryInput key={`${product.id}:${initialVariants[0]?.expectedUpdatedAt}:${galleryVersion}`} initialUrls={product.galleryUrls?.length ? product.galleryUrls : product.imageUrl ? [product.imageUrl] : []} onChange={() => setGalleryChanged(true)} /></section>
            </aside>
          </div>
          <div className="sticky bottom-2 z-40 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
            <span className="mr-auto hidden text-xs font-semibold text-slate-500 sm:block">{busy ? "Saving / refreshing…" : dirty ? "Review changes, then save" : "No unsaved changes"}</span>
            <button type="button" onClick={() => setConfirmation({ kind: "discard" })} disabled={!dirty || busy} className={buttonClass}><RotateCcw size={14} /> Discard</button>
            <button type="submit" disabled={!dirty || busy || Boolean(validation) || mustReload || stale} className={`${primaryClass} whitespace-nowrap`}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {busy ? "Saving…" : "Save Changes"}</button>
          </div>
        </fieldset>
      </form>
      {visibility && <Modal title={`Visibility for ${visibility.ids.length} selected`} onClose={() => setVisibility(null)}>
        <div className="space-y-4 py-3">
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={visibility.pos} onChange={event => setVisibility({ ...visibility, pos: event.target.checked })} /> Show in POS</label>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={visibility.online} onChange={event => setVisibility({ ...visibility, online: event.target.checked })} /> Show online</label>
          <p className="text-xs text-slate-500">Changes apply to the selected variants when you save. Hidden POS variants also remain hidden online.</p>
        </div>
        <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setVisibility(null)} className={buttonClass}>Cancel</button><button type="button" onClick={() => { setDraft(current => ({ ...current, variants: current.variants.map(row => visibility.ids.includes(row.localId) ? { ...row, isActive: visibility.pos, isOnline: visibility.online } : row) })); setVisibility(null); }} className={primaryClass}><Check size={15} /> Done</button></div>
      </Modal>}
      {confirmation && <Modal title={confirmation.kind === "discard" ? "Discard unsaved changes?" : confirmation.kind === "delete-product" ? "Remove whole product from this branch?" : confirmation.kind === "delete-variants" ? `Remove ${confirmation.ids.length} variants?` : confirmation.kind === "remove-all-images" ? "Remove all product images?" : "Remove this image everywhere on this product?"} onClose={() => { if (!busy) setConfirmation(null); }} locked={busy}>
        <p className="text-sm leading-6 text-slate-600">{confirmation.kind === "discard" ? "Product details, variant edits and image changes will return to the last loaded version. Nothing will be saved." : confirmation.kind === "delete-product" || confirmation.kind === "delete-variants" ? "Saved rows are removed from the current branch immediately after confirmation, not on Save. Remaining stock in this branch is set to zero and recorded in the stock ledger within the same database operation. Historical records and other branches are kept. Choose Hide instead to keep the rows visible here." : confirmation.kind === "remove-all-images" ? "The main image and every variant image will be cleared in this draft. Save to apply, or Discard to undo. Stored files are kept." : "This removes the image from the main image and every variant using it in this draft. Unaffected images stay. Save to apply, or Discard to undo."}</p>
        {confirmation.kind === "delete-product" && <div className="mt-4"><Field label="Type REMOVE to confirm"><input value={deleteText} onChange={e => setDeleteText(e.target.value)} className={inputClass} autoComplete="off" /></Field></div>}
        <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setConfirmation(null)} className={buttonClass}>Cancel</button><button type="button" disabled={busy || (confirmation.kind === "delete-product" && deleteText !== "REMOVE")} onClick={confirmAction} className={destructiveClass}>{busy && <Loader2 size={14} className="animate-spin" />}{confirmation.kind === "discard" ? "Discard changes" : confirmation.kind === "remove-all-images" || confirmation.kind === "remove-image" ? "Remove from draft" : "Confirm removal"}</button></div>
      </Modal>}
    </main>
  );
}
function Modal({ title, onClose, locked = false, children }: { title: string; onClose: () => void; locked?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null), titleId = useId();
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!locked) onClose(); }} className="m-auto max-h-[85vh] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl backdrop:bg-slate-950/40"><div className="mb-3 flex items-start justify-between gap-3"><h3 id={titleId} className="text-base font-bold">{title}</h3><button type="button" aria-label="Close dialog" disabled={locked} onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><X size={18} /></button></div>{children}</dialog>;
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>{children}</label>; }
function Cell({ label, value, onChange, number = false, integer = false }: { label: string; value: string; onChange: (value: string) => void; number?: boolean; integer?: boolean }) {
  return <input aria-label={label} value={value} type={number ? "number" : "text"} min={number ? "0" : undefined} step={number ? integer ? "1" : "0.01" : undefined} onChange={e => onChange(e.target.value)} className="h-9 w-full min-w-16 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100" />;
}
