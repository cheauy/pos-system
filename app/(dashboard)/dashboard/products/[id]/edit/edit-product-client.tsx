"use client";

import {
  ArrowLeft,
  ArrowUpDown,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  ImagePlus,
  Loader2,
  Package,
  Pencil,
  Plus,
  Save,
  Search,
  Shirt,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import {
  deleteProductGroup,
  deleteProductVariants,
  setProductVariantsActive,
  updateProductGroup,
  type UpdateProductGroupState,
} from "../../actions";

type Category = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  name: string;
  categoryId: string | null;
  description: string;
  barcode: string;
  imageUrl: string | null;
  images: string[];
  productType: string;
  variantGroupId: string | null;
  isActive: boolean;
  isOnline: boolean;
};

type VariantRow = {
  localId: string;
  id: string | null;
  size: string;
  color: string;
  sku: string;
  costPrice: string;
  sellingPrice: string;
  stockQuantity: string;
  lowStockQuantity: string;
  isActive: boolean;
  imageUrl: string | null;
  variantImageUrl: string | null;
  imageSlot: string | null;
};

type InitialVariant = Omit<VariantRow, "localId"> & { id: string };

type BulkConfirm = {
  kind: "hide" | "delete";
};

type RunImageSlot = {
  id: string;
  preview: string | null;
  name: string;
  locked: boolean;
};

function createRunImageSlot(id: string): RunImageSlot {
  return { id, preview: null, name: "", locked: false };
}

const initialState: UpdateProductGroupState = {
  success: false,
  message: "",
};

const inputClass =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

const fashionSizeRuns = [
  { label: "XS – XXL", sizes: ["XS", "S", "M", "L", "XL", "XXL"] },
  { label: "Women 24 – 32", sizes: ["24", "25", "26", "27", "28", "29", "30", "31", "32"] },
  { label: "Men 28 – 38", sizes: ["28", "30", "32", "34", "36", "38"] },
];

function skuPart(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

function newVariant(
  localId: string,
  imageUrl: string | null = null,
): VariantRow {
  return {
    localId,
    id: null,
    size: "",
    color: "",
    sku: "",
    costPrice: "0",
    sellingPrice: "0",
    stockQuantity: "0",
    lowStockQuantity: "5",
    isActive: true,
    imageUrl,
    variantImageUrl: null,
    imageSlot: null,
  };
}

function hydrateVariants(rows: InitialVariant[]): VariantRow[] {
  return rows.map((row, index) => ({
    ...row,
    localId: row.id ? `saved-${row.id}` : `initial-${index}`,
  }));
}

export default function EditProductClient({
  product,
  categories,
  initialVariants,
  businessType,
}: {
  product: Product;
  categories: Category[];
  initialVariants: InitialVariant[];
  businessType?: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const quickFileInputRef = useRef<HTMLInputElement>(null);
  const variantCounterRef = useRef(1);
  const runSlotCounterRef = useRef(1);
  const [state, formAction, pending] = useActionState(updateProductGroup, initialState);
  const [deletePending, startDeleteTransition] = useTransition();
  const [bulkPending, startBulkTransition] = useTransition();

  const isGeneralShop = businessType === "general";
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description);
  const [barcode, setBarcode] = useState(product.barcode);
  const [categoryId, setCategoryId] = useState(product.categoryId ?? "");
  const [variants, setVariants] = useState<VariantRow[]>(hydrateVariants(initialVariants));
  const [showOnline, setShowOnline] = useState(product.isOnline);

  const [imagePreview, setImagePreview] = useState<string | null>(product.imageUrl);
  const [localImageUrl, setLocalImageUrl] = useState<string | null>(null);
  const [runImageSlots, setRunImageSlots] = useState<RunImageSlot[]>(() => [createRunImageSlot("run-0")]);
  const [selectedGalleryImage, setSelectedGalleryImage] = useState<string | null>(product.imageUrl);

  const activeRunImageSlot =
    runImageSlots.find((slot) => !slot.locked) ?? runImageSlots[runImageSlots.length - 1];

  function nextVariantId() {
    const id = `new-${variantCounterRef.current}`;
    variantCounterRef.current += 1;
    return id;
  }

  function nextRunSlot() {
    const id = `run-${runSlotCounterRef.current}`;
    runSlotCounterRef.current += 1;
    return createRunImageSlot(id);
  }

  const [quickColor, setQuickColor] = useState("Black");
  const [quickSkuPrefix, setQuickSkuPrefix] = useState("");
  const [quickCost, setQuickCost] = useState("0");
  const [quickPrice, setQuickPrice] = useState("0");
  const [quickStock, setQuickStock] = useState("0");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState<BulkConfirm | null>(null);
  const [bulkColor, setBulkColor] = useState("");
  const [bulkCost, setBulkCost] = useState("");
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkStock, setBulkStock] = useState("");
  const [bulkLowStock, setBulkLowStock] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [variantSearch, setVariantSearch] = useState("");
  const [variantColor, setVariantColor] = useState("all");
  const [variantStatus, setVariantStatus] = useState("all");
  const [variantSort, setVariantSort] = useState("size-asc");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const supportsVariants = product.productType === "variant" && Boolean(product.variantGroupId);

  useEffect(() => {
    setVariants(hydrateVariants(initialVariants));
    setSelected(new Set());
  }, [initialVariants]);

  useEffect(() => {
    setShowOnline(product.isOnline);
    setImagePreview(product.imageUrl);
    setSelectedGalleryImage(product.imageUrl);
  }, [product.isOnline, product.imageUrl]);

  useEffect(() => {
    return () => {
      if (localImageUrl) URL.revokeObjectURL(localImageUrl);
    };
  }, [localImageUrl]);

  useEffect(() => {
    if (!state.message) return;
    if (state.success) {
      toast.success(state.message);
      for (const slot of runImageSlots) {
        if (slot.preview) URL.revokeObjectURL(slot.preview);
      }
      runSlotCounterRef.current = 1;
      setRunImageSlots([createRunImageSlot("run-0")]);
      if (localImageUrl) URL.revokeObjectURL(localImageUrl);
      setLocalImageUrl(null);
      setSelected(new Set());
      setSelectedGalleryImage(product.imageUrl);
      router.refresh();
    } else {
      toast.error(state.message);
    }
  }, [state, router]);

  const totalStock = useMemo(
    () => variants.reduce((sum, row) => sum + Math.max(0, Number(row.stockQuantity) || 0), 0),
    [variants],
  );

  const duplicateSku = useMemo(() => {
    const seen = new Set<string>();
    for (const row of variants) {
      const sku = row.sku.trim().toLowerCase();
      if (!sku) continue;
      if (seen.has(sku)) return sku;
      seen.add(sku);
    }
    return "";
  }, [variants]);

  const variantColors = useMemo(
    () =>
      Array.from(
        new Set(
          variants
            .map((row) => row.color.trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [variants],
  );

  const filteredVariants = useMemo(() => {
    const keyword = variantSearch.trim().toLowerCase();
    const rows = variants.filter((row) => {
      if (variantColor !== "all" && row.color !== variantColor) return false;
      if (variantStatus === "active" && !row.isActive) return false;
      if (variantStatus === "hidden" && row.isActive) return false;
      if (!keyword) return true;
      return [row.size, row.color, row.sku]
        .some((value) => value.toLowerCase().includes(keyword));
    });

    return [...rows].sort((a, b) => {
      switch (variantSort) {
        case "size-desc":
          return b.size.localeCompare(a.size, undefined, { numeric: true });
        case "color-asc":
          return a.color.localeCompare(b.color);
        case "color-desc":
          return b.color.localeCompare(a.color);
        case "sku-asc":
          return a.sku.localeCompare(b.sku);
        case "stock-asc":
          return Number(a.stockQuantity) - Number(b.stockQuantity);
        case "stock-desc":
          return Number(b.stockQuantity) - Number(a.stockQuantity);
        case "price-asc":
          return Number(a.sellingPrice) - Number(b.sellingPrice);
        case "price-desc":
          return Number(b.sellingPrice) - Number(a.sellingPrice);
        case "size-asc":
        default:
          return a.size.localeCompare(b.size, undefined, { numeric: true });
      }
    });
  }, [variants, variantSearch, variantColor, variantStatus, variantSort]);

  useEffect(() => {
    setPage(1);
  }, [variantSearch, variantColor, variantStatus, variantSort]);

  const pageCount = Math.max(1, Math.ceil(filteredVariants.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleVariants = filteredVariants.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selectedCount = selected.size;
  const allVisibleSelected =
    visibleVariants.length > 0 && visibleVariants.every((row) => selected.has(row.localId));
  const showOnPos = variants.some((row) => row.isActive);

  const galleryImages = useMemo(() => {
    const runPreviews = runImageSlots
      .map((slot) => slot.preview)
      .filter((value): value is string => Boolean(value));
    const items = [
      ...(localImageUrl ? [localImageUrl] : []),
      ...product.images,
      ...runPreviews,
    ].filter(Boolean) as string[];
    return Array.from(new Set(items));
  }, [localImageUrl, product.images, runImageSlots]);

  const largeImage =
    selectedGalleryImage && galleryImages.includes(selectedGalleryImage)
      ? selectedGalleryImage
      : imagePreview ?? galleryImages[0] ?? null;

  function updateVariant(
    localId: string,
    field: keyof Omit<VariantRow, "localId" | "id" | "imageUrl" | "variantImageUrl" | "imageSlot">,
    value: string | boolean,
  ) {
    setVariants((current) =>
      current.map((row) => (row.localId === localId ? { ...row, [field]: value } : row)),
    );
  }

  function addVariant() {
    if (!supportsVariants) return;
    setVariants((current) => [...current, newVariant(nextVariantId(), imagePreview)]);
    setPage(Math.max(1, Math.ceil((variants.length + 1) / pageSize)));
  }

  function addSizeRun(sizes: string[]) {
    if (!supportsVariants) return;
    const color = quickColor.trim() || "Default";
    const base = skuPart(quickSkuPrefix) || skuPart(name) || "STYLE";
    const colorCode = skuPart(color).slice(0, 8) || "CLR";
    const existingKeys = new Set(
      variants.map((row) => `${row.color.trim().toLowerCase()}|${row.size.trim().toLowerCase()}`),
    );
    const runImageSlotId = activeRunImageSlot?.preview ? activeRunImageSlot.id : null;
    const generated = sizes
      .filter((size) => !existingKeys.has(`${color.toLowerCase()}|${size.toLowerCase()}`))
      .map((size) => ({
        ...newVariant(nextVariantId(), activeRunImageSlot?.preview ?? imagePreview),
        size,
        color,
        sku: `${base}-${colorCode}-${size}`,
        costPrice: quickCost || "0",
        sellingPrice: quickPrice || "0",
        stockQuantity: quickStock || "0",
        lowStockQuantity: "5",
        imageSlot: runImageSlotId,
      }));

    if (generated.length === 0) {
      toast.info("Those sizes already exist for this colour.");
      return;
    }
    setVariants((current) => [...current, ...generated]);
    setPage(Math.max(1, Math.ceil((variants.length + generated.length) / pageSize)));

    if (runImageSlotId) {
      setRunImageSlots((current) => [
        ...current.map((slot) =>
          slot.id === runImageSlotId ? { ...slot, locked: true } : slot,
        ),
        nextRunSlot(),
      ]);
    }
  }

  function setAllActive(next: boolean) {
    setVariants((current) => current.map((row) => ({ ...row, isActive: next })));
  }

  function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Only JPG, PNG or WebP images are allowed.");
      event.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Product image must not exceed 5 MB.");
      event.target.value = "";
      return;
    }
    if (localImageUrl) URL.revokeObjectURL(localImageUrl);
    const url = URL.createObjectURL(file);
    setLocalImageUrl(url);
    setImagePreview(url);
    setSelectedGalleryImage(url);
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
      toast.error("Product image must not exceed 5 MB.");
      event.target.value = "";
      return;
    }
    setRunImageSlots((current) =>
      current.map((slot) => {
        if (slot.id !== slotId) return slot;
        if (slot.preview) URL.revokeObjectURL(slot.preview);
        const url = URL.createObjectURL(file);
        setSelectedGalleryImage(url);
        return { ...slot, preview: url, name: file.name };
      }),
    );
  }

  function toggleSelected(localId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(localId)) next.delete(localId);
      else next.add(localId);
      return next;
    });
  }

  function toggleVisibleSelection() {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleVariants.forEach((row) => next.delete(row.localId));
      else visibleVariants.forEach((row) => next.add(row.localId));
      return next;
    });
  }

  function applyBulkEdit() {
    if (selectedCount === 0) return;
    setVariants((current) =>
      current.map((row) => {
        if (!selected.has(row.localId)) return row;
        return {
          ...row,
          color: bulkColor.trim() ? bulkColor.trim() : row.color,
          costPrice: bulkCost.trim() ? bulkCost : row.costPrice,
          sellingPrice: bulkPrice.trim() ? bulkPrice : row.sellingPrice,
          stockQuantity: !row.id && bulkStock.trim() ? bulkStock : row.stockQuantity,
          lowStockQuantity: bulkLowStock.trim() ? bulkLowStock : row.lowStockQuantity,
        };
      }),
    );
    setBulkEditOpen(false);
    setBulkColor("");
    setBulkCost("");
    setBulkPrice("");
    setBulkStock("");
    setBulkLowStock("");
    toast.success("Bulk edits applied. Save Changes to persist them.");
  }

  function runBulkConfirmedAction() {
    if (!bulkConfirm || bulkPending) return;
    const selectedRows = variants.filter((row) => selected.has(row.localId));
    const existingIds = selectedRows.map((row) => row.id).filter((id): id is string => Boolean(id));

    startBulkTransition(async () => {
      if (bulkConfirm.kind === "hide") {
        if (existingIds.length > 0) {
          const result = await setProductVariantsActive(product.id, existingIds, false);
          if (!result.success) {
            toast.error(result.message);
            return;
          }
        }
        setVariants((current) =>
          current.map((row) => (selected.has(row.localId) ? { ...row, isActive: false } : row)),
        );
        toast.success(`${selectedRows.length} variant${selectedRows.length === 1 ? "" : "s"} hidden.`);
      } else {
        if (selectedRows.length >= variants.length) {
          toast.error("Keep at least one variant. Use Delete Product to remove the whole style.");
          return;
        }
        if (existingIds.length > 0) {
          const result = await deleteProductVariants(product.id, existingIds);
          if (!result.success) {
            toast.error(result.message);
            return;
          }
        }
        setVariants((current) => current.filter((row) => !selected.has(row.localId)));
        toast.success(`${selectedRows.length} variant${selectedRows.length === 1 ? "" : "s"} deleted.`);
      }
      setSelected(new Set());
      setBulkConfirm(null);
      router.refresh();
    });
  }

  function handleDelete() {
    startDeleteTransition(async () => {
      const result = await deleteProductGroup(product.id);
      if (!result.success) {
        toast.error(result.message);
        setDeleteOpen(false);
        return;
      }
      toast.success(result.message);
      router.push("/dashboard/products");
      router.refresh();
    });
  }

  return (
    <main className="space-y-4 pb-10">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link
            href="/dashboard/products"
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-blue-600"
          >
            <ArrowLeft size={15} /> Back to Products
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">Edit Product</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isGeneralShop
              ? "Update product details, barcode, pricing, inventory and visibility."
              : "Update product details, variants, pricing, inventory and images."}
          </p>
        </div>
      </div>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="productId" value={product.id} />
        <input type="hidden" name="isOnline" value={showOnline ? "true" : "false"} />
        {isGeneralShop && !supportsVariants && <input type="hidden" name="barcode" value={barcode} />}
        <input
          type="hidden"
          name="variants"
          value={JSON.stringify(
            variants.map((row) => ({
              id: row.id,
              size: row.size.trim(),
              color: row.color.trim(),
              sku: row.sku.trim(),
              costPrice: Number(row.costPrice),
              sellingPrice: Number(row.sellingPrice),
              stockQuantity: Number(row.stockQuantity),
              lowStockQuantity: Number(row.lowStockQuantity),
              isActive: row.isActive,
              imageSlot: row.imageSlot,
            })),
          )}
        />

        {runImageSlots.map((slot) => (
          <input
            key={slot.id}
            ref={slot.id === activeRunImageSlot?.id ? quickFileInputRef : undefined}
            id={`edit-run-image-${slot.id}`}
            name={`runImage_${slot.id}`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => handleRunImageChange(slot.id, event)}
            className="sr-only"
          />
        ))}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending || variants.length === 0 || Boolean(duplicateSku)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save Changes
          </button>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
          <div className="space-y-4">
            <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
                <Package size={17} className="text-blue-600" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Basic Information</h2>
                  <p className="text-xs text-slate-500">
                    {isGeneralShop
                      ? "Edit the product name, category, barcode and description."
                      : "Edit the product name, category and description."}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 p-4 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-4">
                  <Field label="Product name" required>
                    <input
                      name="name"
                      required
                      minLength={2}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Category">
                    <select
                      name="categoryId"
                      value={categoryId}
                      onChange={(event) => setCategoryId(event.target.value)}
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
                  {isGeneralShop && !supportsVariants && (
                    <Field label="Barcode">
                      <input
                        value={barcode}
                        onChange={(event) => setBarcode(event.target.value)}
                        placeholder="Scan or enter barcode"
                        className={inputClass}
                      />
                    </Field>
                  )}
                </div>

                <Field label="Description">
                  <textarea
                    name="description"
                    rows={6}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder={isGeneralShop ? "Product details, brand, model or notes..." : "Product details, material, fit or notes..."}
                    className="min-h-32 w-full resize-none rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </Field>
              </div>
            </section>

            {supportsVariants && !isGeneralShop && (
              <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 shadow-sm">
                <div className="flex items-start gap-2">
                  <Zap size={17} className="mt-0.5 shrink-0 text-blue-600" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Quick fashion size run</h3>
                    <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                      Add common sizes quickly. One optional colour image is shared by every size in that run.
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <MiniField label="Colour" value={quickColor} placeholder="Black" onChange={setQuickColor} />
                  <MiniField label="SKU prefix" value={quickSkuPrefix} placeholder="TEE01" onChange={setQuickSkuPrefix} />
                  <MiniField label="Cost price" value={quickCost} type="number" onChange={setQuickCost} />
                  <MiniField label="Selling price" value={quickPrice} type="number" onChange={setQuickPrice} />
                  <MiniField label="Initial stock per size" value={quickStock} type="number" onChange={setQuickStock} />
                  <label htmlFor={activeRunImageSlot ? `edit-run-image-${activeRunImageSlot.id}` : undefined} className="block">
                    <span className="mb-1 block text-[10px] font-semibold text-slate-600">Colour image (optional)</span>
                    <span className="flex h-9 cursor-pointer items-center gap-2 overflow-hidden rounded-lg border border-blue-200 bg-white px-2 text-[11px] font-semibold text-slate-600 transition hover:bg-blue-50">
                      {activeRunImageSlot?.preview ? (
                        <>
                          <img src={activeRunImageSlot.preview} alt="Colour run" className="h-6 w-6 rounded object-cover" />
                          <span className="min-w-0 flex-1 truncate">{activeRunImageSlot.name || "Selected image"}</span>
                        </>
                      ) : (
                        <>
                          <Upload size={13} className="text-blue-600" /> Image for all sizes in this run
                        </>
                      )}
                    </span>
                  </label>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {fashionSizeRuns.map((run) => (
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

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-2">
                  {isGeneralShop ? (
                    <Package size={17} className="text-blue-600" />
                  ) : (
                    <Shirt size={17} className="text-blue-600" />
                  )}
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">{isGeneralShop ? "Inventory & pricing" : "Variants"}</h2>
                    <p className="text-xs text-slate-500">
                      {isGeneralShop
                        ? "Manage SKU, optional size/color, price, stock and visibility."
                        : "Manage clothing sizes, colours, price, stock and visibility."}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {selectedCount > 0 && (
                    <>
                      <span className="rounded-lg bg-blue-50 px-2.5 py-2 text-xs font-bold text-blue-700">
                        {selectedCount} selected
                      </span>
                      <button
                        type="button"
                        onClick={() => setBulkEditOpen(true)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Pencil size={14} /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkConfirm({ kind: "hide" })}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                      >
                        <Eye size={14} /> Hide
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkConfirm({ kind: "delete" })}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-600 hover:bg-red-100"
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </>
                  )}
                  {supportsVariants && (
                    <button
                      type="button"
                      onClick={addVariant}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white transition hover:bg-blue-700"
                    >
                      <Plus size={14} /> Add Variant
                    </button>
                  )}
                </div>
              </div>

              <div className="grid gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-3 md:grid-cols-[minmax(220px,1fr)_160px_150px_190px]">
                <label className="relative block">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={variantSearch}
                    onChange={(event) => setVariantSearch(event.target.value)}
                    placeholder={isGeneralShop ? "Search option, color or SKU..." : "Search size, colour or SKU..."}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                </label>

                <select
                  value={variantColor}
                  onChange={(event) => setVariantColor(event.target.value)}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 outline-none focus:border-blue-400"
                >
                  <option value="all">All colours</option>
                  {variantColors.map((color) => (
                    <option key={color} value={color}>{color}</option>
                  ))}
                </select>

                <select
                  value={variantStatus}
                  onChange={(event) => setVariantStatus(event.target.value)}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 outline-none focus:border-blue-400"
                >
                  <option value="all">All status</option>
                  <option value="active">Active</option>
                  <option value="hidden">Hidden</option>
                </select>

                <label className="relative block">
                  <ArrowUpDown size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select
                    value={variantSort}
                    onChange={(event) => setVariantSort(event.target.value)}
                    className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs font-medium text-slate-700 outline-none focus:border-blue-400"
                  >
                    <option value="size-asc">Size A–Z</option>
                    <option value="size-desc">Size Z–A</option>
                    <option value="color-asc">Colour A–Z</option>
                    <option value="color-desc">Colour Z–A</option>
                    <option value="sku-asc">SKU A–Z</option>
                    <option value="stock-asc">Stock low → high</option>
                    <option value="stock-desc">Stock high → low</option>
                    <option value="price-asc">Price low → high</option>
                    <option value="price-desc">Price high → low</option>
                  </select>
                </label>
              </div>

              {duplicateSku && (
                <div className="mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                  Duplicate SKU detected. Every variant must use a unique SKU.
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="min-w-[1020px] w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-10 px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleVisibleSelection}
                          aria-label="Select visible variants"
                        />
                      </th>
                      <th className="w-14 px-3 py-2.5">Image</th>
                      <th className="px-3 py-2.5">{isGeneralShop ? "Size / option" : "Size"}</th>
                      <th className="px-3 py-2.5">{isGeneralShop ? "Color" : "Colour"}</th>
                      <th className="px-3 py-2.5">SKU</th>
                      <th className="px-3 py-2.5">Cost Price</th>
                      <th className="px-3 py-2.5">Selling Price</th>
                      <th className="px-3 py-2.5">Stock</th>
                      <th className="px-3 py-2.5">Low Stock</th>
                      <th className="px-3 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleVariants.map((row) => (
                      <tr key={row.localId} className="bg-white align-middle">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selected.has(row.localId)}
                            onChange={() => toggleSelected(row.localId)}
                            aria-label={`Select ${row.size || row.sku}`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          {row.imageUrl ? (
                            <img src={row.imageUrl} alt="Variant" loading="lazy" decoding="async" className="h-8 w-8 rounded-md border border-slate-200 object-cover" />
                          ) : (
                            <div className="grid h-8 w-8 place-items-center rounded-md bg-slate-100 text-slate-400">
                              <Shirt size={13} />
                            </div>
                          )}
                        </td>
                        <td className="p-2"><CellInput value={row.size} placeholder={isGeneralShop ? "500ml / 128GB" : "M"} onChange={(value) => updateVariant(row.localId, "size", value)} /></td>
                        <td className="p-2"><CellInput value={row.color} placeholder={isGeneralShop ? "Optional" : "Black"} onChange={(value) => updateVariant(row.localId, "color", value)} /></td>
                        <td className="p-2 min-w-40"><CellInput value={row.sku} placeholder={isGeneralShop ? "ITEM-001" : "STYLE-BLK-M"} onChange={(value) => updateVariant(row.localId, "sku", value)} /></td>
                        <td className="p-2"><CellInput type="number" value={row.costPrice} onChange={(value) => updateVariant(row.localId, "costPrice", value)} /></td>
                        <td className="p-2"><CellInput type="number" value={row.sellingPrice} onChange={(value) => updateVariant(row.localId, "sellingPrice", value)} /></td>
                        <td className="p-2">{row.id ? <a href={`/dashboard/inventory/adjustments?product=${row.id}`} className="text-sm font-semibold text-blue-600 underline" title="Adjust stock with a reason">{row.stockQuantity} · Adjust</a> : <CellInput type="number" value={row.stockQuantity} onChange={(value) => updateVariant(row.localId, "stockQuantity", value)} />}</td>
                        <td className="p-2"><CellInput type="number" value={row.lowStockQuantity} onChange={(value) => updateVariant(row.localId, "lowStockQuantity", value)} /></td>
                        <td className="p-2">
                          <button
                            type="button"
                            onClick={() => updateVariant(row.localId, "isActive", !row.isActive)}
                            className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${row.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                          >
                            {row.isActive ? "Active" : "Inactive"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  Showing {(safePage - 1) * pageSize + (filteredVariants.length ? 1 : 0)}–{Math.min(safePage * pageSize, filteredVariants.length)} of {filteredVariants.length} filtered variants · {variants.length} total
                </p>
                <div className="flex items-center gap-1">
                  <button type="button" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 disabled:opacity-40"><ChevronLeft size={15} /></button>
                  <span className="grid h-8 min-w-8 place-items-center rounded-lg bg-blue-600 px-2 text-xs font-bold text-white">{safePage}</span>
                  <button type="button" disabled={safePage >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 disabled:opacity-40"><ChevronRight size={15} /></button>
                </div>
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-bold text-slate-900">Product Image</h2>
              <p className="mt-1 text-xs text-slate-500">
                {isGeneralShop
                  ? "Main product image used in POS and the online store."
                  : "Main style image first; colour-run images appear as gallery thumbnails."}
              </p>

              <input ref={fileInputRef} type="file" name="image" accept="image/jpeg,image/png,image/webp" onChange={handleImageChange} className="sr-only" />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="group relative mt-3 flex aspect-[1.08/1] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
              >
                {largeImage ? (
                  <img src={largeImage} alt="Product preview" className="h-full w-full object-cover" />
                ) : (
                  <span className="m-auto flex flex-col items-center gap-2 text-slate-400"><ImagePlus size={34} /><span className="text-xs font-semibold">Add product image</span></span>
                )}
                <span className="absolute bottom-2 right-2 rounded-lg bg-white/95 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 shadow-sm ring-1 ring-slate-200">
                  {largeImage ? "Change" : "Choose Image"}
                </span>
              </button>

              {(galleryImages.length > 1 || supportsVariants) && (
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {galleryImages.map((image, index) => (
                    <button
                      key={image}
                      type="button"
                      title={index === 0 ? "Main style image" : "Colour / run image"}
                      onClick={() => setSelectedGalleryImage(image)}
                      className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 bg-slate-50 ${selectedGalleryImage === image ? "border-blue-500" : "border-slate-200"}`}
                    >
                      <img src={image} alt="Product thumbnail" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    </button>
                  ))}
                  {supportsVariants && (
                    <button
                      type="button"
                      title="Choose an image for the next Quick fashion size run"
                      onClick={() => quickFileInputRef.current?.click()}
                      className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-500 transition hover:border-blue-400 hover:text-blue-600"
                    >
                      <Plus size={16} />
                      <span className="mt-1 text-[9px] font-semibold">Add</span>
                    </button>
                  )}
                </div>
              )}
              <p className="mt-2 text-[10px] text-slate-400">
                {isGeneralShop
                  ? "This image is used as the main POS and storefront product image."
                  : "Main image is the POS/storefront list fallback. Colour images are loaded when that colour is opened."}
              </p>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-bold text-slate-900">Showing</h2>
              <p className="mt-1 text-xs text-slate-500">Control where this product can appear.</p>

              <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                <input
                  type="checkbox"
                  checked={showOnPos}
                  onChange={(event) => setAllActive(event.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-xs font-bold text-slate-800">Show on POS</span>
                  <span className="mt-0.5 block text-[10px] text-slate-500">
                    {isGeneralShop ? "Turning this off hides this product from POS." : "Turning this off makes every variant inactive."}
                  </span>
                </span>
              </label>

              <label className="mt-2 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                <input
                  type="checkbox"
                  checked={showOnline}
                  onChange={(event) => setShowOnline(event.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-xs font-bold text-slate-800">Show online</span>
                  <span className="mt-0.5 block text-[10px] text-slate-500">
                    {isGeneralShop ? "Controls this product on your public store." : "Controls online visibility for the whole style."}
                  </span>
                </span>
              </label>

              <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-xs">
                <div><p className="text-slate-400">{isGeneralShop ? "Stock records" : "Variants"}</p><p className="mt-1 font-bold text-slate-900">{variants.length}</p></div>
                <div><p className="text-slate-400">Total Stock</p><p className="mt-1 font-bold text-slate-900">{totalStock}</p></div>
              </div>
            </section>

            <section className="rounded-xl border border-red-200 bg-white p-4 shadow-sm">
              <button type="button" onClick={() => setDeleteOpen(true)} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-red-300 text-sm font-semibold text-red-600 transition hover:bg-red-50">
                <Trash2 size={15} /> Delete Product
              </button>
            </section>
          </aside>
        </div>
      </form>

      {bulkEditOpen && (
        <Modal title={`Edit ${selectedCount} selected variants`} onClose={() => setBulkEditOpen(false)}>
          <p className="text-sm text-slate-500">Leave a field blank to keep its current value.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Colour"><input value={bulkColor} onChange={(e) => setBulkColor(e.target.value)} className={inputClass} placeholder="Keep current" /></Field>
            <Field label="Cost price"><input type="number" min="0" step="0.01" value={bulkCost} onChange={(e) => setBulkCost(e.target.value)} className={inputClass} placeholder="Keep current" /></Field>
            <Field label="Selling price"><input type="number" min="0" step="0.01" value={bulkPrice} onChange={(e) => setBulkPrice(e.target.value)} className={inputClass} placeholder="Keep current" /></Field>
            <Field label="Stock"><input type="number" min="0" value={bulkStock} onChange={(e) => setBulkStock(e.target.value)} className={inputClass} placeholder="Keep current" /></Field>
            <Field label="Low-stock alert"><input type="number" min="0" value={bulkLowStock} onChange={(e) => setBulkLowStock(e.target.value)} className={inputClass} placeholder="Keep current" /></Field>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setBulkEditOpen(false)} className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700">Cancel</button>
            <button type="button" onClick={applyBulkEdit} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white">Apply</button>
          </div>
        </Modal>
      )}

      {bulkConfirm && (
        <Modal title={bulkConfirm.kind === "hide" ? "Hide selected variants?" : "Delete selected variants?"} onClose={() => !bulkPending && setBulkConfirm(null)}>
          <p className="text-sm leading-5 text-slate-500">
            {bulkConfirm.kind === "hide"
              ? "Selected sizes/colours will become inactive and will not appear in POS or online. Other variants stay active."
              : "Selected variants will be permanently deleted when safe. Variants already used in sales, purchases or inventory history cannot be deleted."}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" disabled={bulkPending} onClick={() => setBulkConfirm(null)} className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 disabled:opacity-50">Cancel</button>
            <button
              type="button"
              disabled={bulkPending}
              onClick={runBulkConfirmedAction}
              className={`inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-white disabled:opacity-50 ${bulkConfirm.kind === "delete" ? "bg-red-600" : "bg-amber-600"}`}
            >
              {bulkPending && <Loader2 size={14} className="animate-spin" />}
              {bulkConfirm.kind === "delete" ? "Delete" : "Hide"}
            </button>
          </div>
        </Modal>
      )}

      {deleteOpen && (
        <Modal title="Delete product?" onClose={() => !deletePending && setDeleteOpen(false)}>
          <p className="text-sm text-slate-500">
            This deletes the whole style and all of its variant rows. Products used in sales, purchases or inventory history are protected and cannot be deleted.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setDeleteOpen(false)} className="h-9 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700">Cancel</button>
            <button type="button" disabled={deletePending} onClick={handleDelete} className="inline-flex h-9 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
              {deletePending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Delete Product
            </button>
          </div>
        </Modal>
      )}

      {state.success && <div className="sr-only" aria-live="polite"><CheckCircle2 /> {state.message}</div>}
    </main>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/35 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-base font-bold text-slate-950">{title}</h3>
          <button type="button" onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={17} /></button>
        </div>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-700">{label} {required && <span className="text-red-500">*</span>}</span>
      {children}
    </label>
  );
}

function MiniField({ label, value, placeholder, type = "text", onChange }: { label: string; value: string; placeholder?: string; type?: "text" | "number"; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold text-slate-600">{label}</span>
      <input type={type} min={type === "number" ? "0" : undefined} step={type === "number" ? "0.01" : undefined} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-lg border border-blue-200 bg-white px-2.5 text-xs text-slate-800 outline-none focus:border-blue-400" />
    </label>
  );
}

function CellInput({ value, type = "text", placeholder, onChange }: { value: string; type?: "text" | "number"; placeholder?: string; onChange: (value: string) => void }) {
  return (
    <input type={type} min={type === "number" ? "0" : undefined} step={type === "number" ? "0.01" : undefined} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="h-8 w-full min-w-20 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
  );
}
