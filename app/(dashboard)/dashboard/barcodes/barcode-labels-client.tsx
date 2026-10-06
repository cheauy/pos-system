"use client";
import { printTextScale } from "@/lib/receipts/receipt-model";
import { preparePrint } from '@/lib/printing/prepare-print';

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FileDown, Minus, Plus, Printer, X } from "lucide-react";

import { code39BarsExact, validateCode39 } from "@/lib/barcode/code39";
import ProductPicker, { type PromotionProduct } from "@/components/product-picker";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  image_url: string | null;
  variant_image_url: string | null;
  cost_price: number;
  selling_price: number;
  stock_quantity: number;
  size: string | null;
  color: string | null;
  category_id: string | null;
  is_active: boolean;
};

type Category = { id: string; name: string };

type TemplateId = "product" | "price";
type PreviewTab = "label" | "pdf";

type LabelElements = {
  name: boolean;
  variant: boolean;
  barcode: boolean;
  sku: boolean;
  price: boolean;
  image: boolean;
  storeName: boolean;
  customText: boolean;
};

type TemplateDefinition = { id: TemplateId; name: string; description: string; elements: LabelElements };

const templates: TemplateDefinition[] = [
  { id: "product", name: "Centered label", description: "Centered shop name, product, variant, SKU, barcode and bold price.", elements: { name:true,variant:true,barcode:true,sku:true,price:true,image:false,storeName:true,customText:false } },
  { id: "price", name: "Split-price label", description: "Product details on the left, large price on the right, barcode below.", elements: { name:true,variant:true,barcode:true,sku:true,price:true,image:false,storeName:true,customText:false } },
];

const sizeRank = new Map(["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"].map((value, index) => [value, index]));

function compareSizes(a: Product, b: Product) {
  const aValue = (a.size ?? "").trim().toUpperCase();
  const bValue = (b.size ?? "").trim().toUpperCase();
  const aRank = sizeRank.get(aValue);
  const bRank = sizeRank.get(bValue);
  if (aRank !== undefined || bRank !== undefined) return (aRank ?? 999) - (bRank ?? 999);
  return aValue.localeCompare(bValue, undefined, { numeric: true, sensitivity: "base" });
}

function money(value: number) {
  return `$${Number(value || 0).toFixed(2)}`;
}

const variantLabel = (product: Product) => [product.size, product.color].filter(Boolean).join(" / ");
const labelBarcode = (product: Product) => product.barcode || product.sku || "";

export function getTemplate(id: TemplateId) {
  return templates.find((template) => template.id === id) ?? templates[0];
}

export default function BarcodeLabelsClient({
  businessName,
  products,
  categories,
  settings,
}: {
  businessName: string;
  products: Product[];
  categories: Category[];
  settings: Record<string, unknown>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState("all");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const templateId: TemplateId = settings.barcode_template === "price" ? "price" : "product";
  const labelSize = ["40x20", "40x30", "50x30", "60x40", "80x50"].includes(String(settings.barcode_label_size)) ? String(settings.barcode_label_size) : "50x30";
  const [previewTab, setPreviewTab] = useState<PreviewTab>("label");
  const [previewIndex, setPreviewIndex] = useState(0);
  const showElements: LabelElements = {
    name: settings.barcode_show_name !== false,
    variant: settings.barcode_show_variant !== false,
    barcode: settings.barcode_show_barcode !== false,
    sku: settings.barcode_show_sku !== false,
    price: settings.barcode_show_price !== false,
    image: Boolean(settings.barcode_show_image),
    storeName: settings.barcode_show_store_name !== false,
    customText: false,
  };

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products) if (product.category_id) counts.set(product.category_id, (counts.get(product.category_id) ?? 0) + 1);
    return counts;
  }, [products]);

  const filtered = useMemo(
    () => products.filter((product) => categoryId === "all" || product.category_id === categoryId),
    [products, categoryId],
  );

  // Picker groups by product name; variants listed size first (XS → XXL), then colour.
  const pickerProducts = useMemo<PromotionProduct[]>(() => [...filtered]
    .sort((a, b) => a.name.localeCompare(b.name) || compareSizes(a, b) || (a.color ?? "").localeCompare(b.color ?? ""))
    .map((product) => ({ id: product.id, name: product.name, variant: variantLabel(product), sku: product.sku, image: product.variant_image_url ?? product.image_url })),
  [filtered]);

  const selectedProducts = useMemo(() => { const ids = new Set(selected); return products.filter((product) => ids.has(product.id)); }, [products, selected]);
  const barcodeErrors = useMemo(() => showElements.barcode ? selectedProducts.flatMap(product => {
    const error = validateCode39(labelBarcode(product));
    return error ? [`${product.name}: ${error}`] : [];
  }) : [], [selectedProducts, showElements.barcode]);

  const currentPreview =
    selectedProducts.length > 0
      ? selectedProducts[Math.min(previewIndex, selectedProducts.length - 1)]
      : filtered[0] ?? products[0] ?? null;

  function setQuantity(id: string, value: number) {
    const safe = Math.max(1, Math.min(999, Math.floor(value || 1)));
    setQuantities((current) => ({ ...current, [id]: safe }));
  }

  const printLock = useRef(false);
  const [printing, setPrinting] = useState(false), [printError, setPrintError] = useState('');
  // Phones: the Label/PDF preview opens full screen from the bottom bar.
  const [previewOpen, setPreviewOpen] = useState(false);
  useEffect(() => {
    if (!previewOpen) return;
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setPreviewOpen(false); };
    const wide = window.matchMedia("(min-width: 640px)"); const onWide = () => { if (wide.matches) setPreviewOpen(false); };
    window.addEventListener("keydown", onKey); wide.addEventListener("change", onWide);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", onKey); wide.removeEventListener("change", onWide); };
  }, [previewOpen]);
  // Mount the print sheet on demand and keep it until the dialog closes; some
  // browsers return from window.print() before the snapshot is taken.
  const [printSheet, setPrintSheet] = useState(false);
  useEffect(() => {
    const open = () => setPrintSheet(true), close = () => setPrintSheet(false);
    window.addEventListener("beforeprint", open); window.addEventListener("afterprint", close);
    return () => { window.removeEventListener("beforeprint", open); window.removeEventListener("afterprint", close); };
  }, []);
  async function printLabels() {
    if (!selectedProducts.length || printLock.current) return;
    if (barcodeErrors.length) { setPrintError("Printing blocked. " + barcodeErrors.join(" ")); return; }
    printLock.current = true; setPrinting(true); setPrintError(''); setPrintSheet(true);
    // Wait one frame so React has committed the sheet before images/fonts are checked.
    try { await new Promise(resolve => requestAnimationFrame(resolve)); await preparePrint(document, '#barcode-print-area'); window.print(); }
    catch (error) { setPrintSheet(false); setPrintError(error instanceof Error ? error.message : 'Could not prepare labels for printing.'); }
    finally { printLock.current = false; setPrinting(false); }
  }

  const printedLabels = selectedProducts.flatMap((product) => {
    const count = quantities[product.id] ?? 1;
    return Array.from({ length: Math.max(1, count) }, (_, index) => ({ product, key: `${product.id}-${index}` }));
  });
  const labelCount = printedLabels.length;

  return (
    <main className="min-w-0 space-y-4 pb-8 max-sm:pb-24">
      {!previewOpen && <div className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex justify-center gap-2 px-4 sm:hidden">
        <button type="button" onClick={() => setPreviewOpen(true)} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-800 shadow-lg">Preview ({labelCount})</button>
        <button type="button" disabled={!selectedProducts.length || printing || barcodeErrors.length > 0} onClick={printLabels} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-blue-600 px-5 text-sm font-semibold text-white shadow-lg disabled:opacity-50"><Printer size={17} />Print ({selectedProducts.length})</button>
      </div>}
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Barcode & Label Printing</h1>
          <p className="mt-1 text-slate-500">Print scan-ready barcode labels for products and exact variants.</p>
        </div>
        <button type="button" disabled={!selectedProducts.length || printing || barcodeErrors.length > 0} onClick={printLabels}
          className="inline-flex items-center gap-2 self-start rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 max-sm:hidden">
          <Printer size={17} />
          Print Selected ({selectedProducts.length})
        </button>
      </header>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_410px]">
        <section className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <nav aria-label="Categories" className="flex gap-2 overflow-x-auto pb-1">
            {[{ id: "all", name: "All", count: products.length }, ...categories.filter((category) => categoryCounts.has(category.id)).map((category) => ({ ...category, count: categoryCounts.get(category.id) ?? 0 }))].map((category) => (
              <button key={category.id} type="button" aria-pressed={categoryId === category.id} onClick={() => setCategoryId(category.id)}
                className={`shrink-0 rounded-xl border px-4 py-2 text-sm font-semibold transition ${categoryId === category.id ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-600"}`}>
                {category.name} <span className={categoryId === category.id ? "text-blue-100" : "text-slate-400"}>({category.count})</span>
              </button>
            ))}
          </nav>

          <ProductPicker products={pickerProducts} value={selected} onChange={setSelected} />

          {selectedProducts.length > 0 && <div className="rounded-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5 text-sm">
              <span className="font-semibold text-slate-800">Labels to print</span>
              <span className="text-slate-500">{selectedProducts.length} variant{selectedProducts.length === 1 ? "" : "s"} · {labelCount} label{labelCount === 1 ? "" : "s"}</span>
            </div>
            <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
              {selectedProducts.map((product) => (
                <li key={product.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{product.name}</p>
                    <p className="truncate text-xs text-slate-500">{variantLabel(product) || "Standard"}{product.barcode ? ` · ${product.barcode}` : ""}</p>
                  </div>
                  <div className="flex items-center overflow-hidden rounded-lg border border-slate-200">
                    <button type="button" aria-label={`One fewer label for ${product.name}`} onClick={() => setQuantity(product.id, (quantities[product.id] ?? 1) - 1)} className="grid h-8 w-8 place-items-center text-slate-500 hover:bg-slate-50"><Minus size={13} /></button>
                    <input type="number" min={1} max={999} aria-label={`Labels for ${product.name}`} value={quantities[product.id] ?? 1} onChange={(event) => setQuantity(product.id, Number(event.target.value))} className="h-8 w-10 border-x border-slate-200 text-center text-sm outline-none" />
                    <button type="button" aria-label={`One more label for ${product.name}`} onClick={() => setQuantity(product.id, (quantities[product.id] ?? 1) + 1)} className="grid h-8 w-8 place-items-center text-slate-500 hover:bg-slate-50"><Plus size={13} /></button>
                  </div>
                  <button type="button" aria-label={`Remove ${product.name}`} onClick={() => setSelected((current) => current.filter((id) => id !== product.id))} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"><X size={15} /></button>
                </li>
              ))}
            </ul>
          </div>}
        </section>

        <aside role={previewOpen ? "dialog" : undefined} aria-modal={previewOpen || undefined} aria-label="Label preview" className={`${previewOpen ? "fixed inset-0 z-50 overflow-y-auto overscroll-contain rounded-none pt-14" : "max-sm:hidden"} min-w-0 overflow-hidden border border-slate-200 bg-white shadow-sm sm:static sm:block sm:overflow-hidden sm:rounded-2xl sm:pt-0 2xl:sticky 2xl:top-4 2xl:self-start`}>
          {previewOpen && <button type="button" aria-label="Close label preview" onClick={() => setPreviewOpen(false)} className="absolute right-3 top-3 z-10 grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-700 sm:hidden"><X size={20} /></button>}
          <div className="grid grid-cols-2 border-b border-slate-200">
            {(["label", "pdf"] as const).map((tab) => (
              <button key={tab} type="button" onClick={() => setPreviewTab(tab)}
                className={`border-b-2 px-4 py-3 text-sm font-semibold ${previewTab === tab ? "border-blue-600 text-blue-600" : "border-transparent text-slate-600"}`}>
                {tab === "label" ? "Label Preview" : "PDF Preview"}
              </button>
            ))}
          </div>

          <div className="space-y-5 p-4">
            <div className="rounded-xl bg-slate-50 p-4">
              {previewTab === "label" ? (
                <div>
                  <div className="flex min-h-[240px] items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 p-6">
                    {currentPreview ? (
                      <LabelCard fontSize={settings.font_size} density={settings.density} product={currentPreview} businessName={businessName} size={labelSize} templateId={templateId} elements={showElements} customText="" />
                    ) : (
                      <p className="text-sm text-slate-500">No product available for preview.</p>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-center gap-4 text-sm text-slate-500">
                    <button type="button" aria-label="Previous label" disabled={selectedProducts.length <= 1} onClick={() => setPreviewIndex((current) => Math.max(0, current - 1))}
                      className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-white disabled:opacity-40"><ChevronLeft size={16} /></button>
                    <span>{selectedProducts.length ? `${Math.min(previewIndex, selectedProducts.length - 1) + 1} / ${selectedProducts.length}` : "Preview"}</span>
                    <button type="button" aria-label="Next label" disabled={selectedProducts.length <= 1 || previewIndex >= selectedProducts.length - 1} onClick={() => setPreviewIndex((current) => Math.min(selectedProducts.length - 1, current + 1))}
                      className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-white disabled:opacity-40"><ChevronRight size={16} /></button>
                  </div>
                </div>
              ) : (
                <div className="mx-auto aspect-[210/297] max-h-[360px] overflow-hidden rounded-md border border-slate-300 bg-white p-4 shadow-sm">
                  <div className="grid grid-cols-2 gap-2">
                    {(selectedProducts.length ? selectedProducts : filtered.slice(0, 8)).slice(0, 8).map((product) => (
                      <div key={product.id} className="origin-top-left scale-[0.55]">
                        <LabelCard fontSize={settings.font_size} density={settings.density} product={product} businessName={businessName} size={labelSize} templateId={templateId} elements={showElements} customText="" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button type="button" disabled={!selectedProducts.length || printing || barcodeErrors.length > 0} onClick={printLabels}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">
              <FileDown size={18} />
              Generate PDF
            </button>
            <button type="button" disabled={!selectedProducts.length || printing || barcodeErrors.length > 0} onClick={printLabels}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40">
              <Printer size={18} />
              Print Labels
            </button>
          </div>
        </aside>
      </div>

      {barcodeErrors.length > 0 && <div role="alert" className="no-print rounded-xl bg-red-50 p-3 text-sm text-red-700"><p>Printing blocked. Saved barcode values are unchanged. Edit the barcode or use a compatible encoder before printing.</p><ul>{barcodeErrors.map((error, index) => <li key={index}>{error}</li>)}</ul></div>}
      {printError && <p role="alert" className="no-print rounded-xl bg-red-50 p-3 text-sm text-red-700">{printError}</p>}
      {printing && <p role="status" className="no-print text-sm text-slate-600">Preparing images and fonts…</p>}
      <div id="barcode-print-area" className="hidden print:block">
        {barcodeErrors.length === 0 && printSheet && printedLabels.map(({ product, key }) => (
          <LabelCard fontSize={settings.font_size} density={settings.density} key={key} product={product} businessName={businessName} size={labelSize} templateId={templateId} elements={showElements} customText="" />
        ))}
      </div>

      <style jsx global>{`
        @media print {
          @page { margin: 4mm; }
          body * { visibility: hidden !important; }
          #barcode-print-area, #barcode-print-area * { visibility: visible !important; }
          #barcode-print-area { display: flex !important; position: absolute; inset: 0 auto auto 0; flex-wrap: wrap; align-content: flex-start; gap: 2mm; }
          .barcode-label { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>
    </main>
  );
}

export function LabelCard({
  product,
  businessName,
  size,
  templateId,
  elements,
  customText,
  fontSize, density,
}: {
  product: Product;
  businessName: string;
  size: string;
  templateId: TemplateId;
  elements: LabelElements;
  customText: string;
  fontSize?:unknown; density?:unknown;
}) {
  const value = labelBarcode(product);
  const barcodeError = elements.barcode ? validateCode39(value) : null;
  if (barcodeError) return <div role="alert" className="no-print rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{product.name}: {barcodeError} Saved barcode values are unchanged.</div>;
  const data = elements.barcode ? code39BarsExact(value) : { text: value, bars: [], width: 0 };
  const [width, height] = size.split("x").map(Number);
  const image = product.variant_image_url ?? product.image_url;
  const split = templateId === "price";
  const scale = Math.min(width / 50, height / 30) * (elements.image && image ? 0.8 : elements.customText && customText ? 0.9 : 1);
  const textScale=scale*printTextScale(fontSize);
  const details = <div style={{minWidth:0,flex:1}}>
    {elements.storeName && <div style={{fontSize:9*textScale,lineHeight:1.1,fontWeight:700,marginBottom:2*scale,overflowWrap:"anywhere"}}>{businessName}</div>}
    {elements.image && image && <img src={image} alt="" style={{width:20*scale,height:20*scale,objectFit:"contain",margin:"0 auto"}}/>}
    {elements.name && <div style={{fontSize:12*textScale,fontWeight:800,lineHeight:1.05,overflowWrap:"anywhere"}}>{product.name}</div>}
    {elements.variant && <div style={{fontSize:9*textScale,lineHeight:1.2}}>{[product.color,product.size].filter(Boolean).join(" / ")}</div>}
    {elements.sku && <div style={{fontSize:8*textScale,lineHeight:1.3,overflowWrap:"anywhere"}}>SKU: {product.sku || data.text}</div>}
  </div>;
  return <div className="barcode-label border border-slate-200 bg-white text-black" style={{width:`${width}mm`,height:`${height}mm`,boxSizing:"border-box",padding:`${1.5*scale}mm`,display:"flex",flexDirection:"column",justifyContent:"space-between",gap:(density==="compact"?1:2)*scale,overflow:"hidden",textAlign:split?"left":"center",fontFamily:"Arial, sans-serif"}}>
    <div style={{display:"flex",gap:5*scale,alignItems:"center"}}>
      {details}
      {split && elements.price && <div style={{borderLeft:"1px solid black",paddingLeft:5*scale,flexShrink:0}}><div style={{fontSize:7*textScale,letterSpacing:1}}>PRICE</div><div style={{fontSize:20*textScale,fontWeight:900,lineHeight:1.2}}>{money(product.selling_price)}</div></div>}
    </div>
    {elements.barcode && <div style={{textAlign:"center",padding:"0 2mm"}}><svg shapeRendering="crispEdges" viewBox={`0 0 ${data.width} 44`} style={{width:"100%",height:`${(split?8:6)*scale}mm`,display:"block"}} preserveAspectRatio="none" aria-label={`Barcode ${data.text}`}>{data.bars.map((bar,index)=><rect key={index} x={bar.x} y="0" width={bar.width} height="44" fill="black"/>)}</svg><div style={{fontSize:8*textScale,letterSpacing:1,lineHeight:1.1}}>{data.text}</div></div>}
    {!split && elements.price && <div style={{fontSize:19*textScale,fontWeight:900,lineHeight:1}}>{money(product.selling_price)}</div>}
  </div>;
}
