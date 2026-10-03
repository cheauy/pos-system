"use client";

import Link from "next/link";
import { useState } from "react";
import ShippingTemplateSelect from '@/components/receipts/shipping-template-select';
import { shippingTemplate, shippingCustomTemplates, type NamedShippingTemplate, type ShippingTemplateId } from '@/lib/receipts/shipping-templates';
import ShippingTemplateEditor, { type ShippingTemplateDraft } from './shipping-template-editor';
import { defaultShippingLayout, resizeShippingLayout, validateShippingLayout, type ShippingLayout } from '@/lib/receipts/shipping-layout';
import { shippingValues } from '@/lib/receipts/shipping-label-markup';
import { Save } from "lucide-react";
import { LabelCard, getTemplate } from "../../barcodes/barcode-labels-client";
import { ShippingLabel } from "../../shipping-labels/shipping-labels-client";
import { saveBarcodeLabelSettings, saveShippingLabelSettings, saveShippingCustomTemplate } from "../receipts/actions";

const barcodeFields = [
  ["name", "Product name"], ["price", "Price"], ["sku", "SKU / barcode text"],
  ["variant", "Size / color"], ["barcode", "Barcode"], ["image", "Product image"],
  ["storeName", "Store name"],
] as const;
const shippingFields = [
  ["storeName", "Store name"], ["storeAddress", "Store address"],
  ["storePhone", "Store phone number"], ["phone", "Customer phone"],
  ["orderNumber", "Order number"], ["cod", "Payment and amount"],
  ["itemCount", "Item count"], ["barcode", "Order QR code"],
  ["date", "Order date"], ["linearBarcode", "Order barcode"],
  ["logo", "Store logo (from Receipt Settings)"], ["footer", "Thank-you footer"],
] as const;
const snake = (key: string) => key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
const upper = (key: string) => key[0].toUpperCase() + key.slice(1);
const inputClass = "mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900";
const sampleProduct = {
  id: "sample-product", name: "Classic T-shirt", sku: "SHIRT-001", barcode: "123456789012",
  image_url: "/icon.svg", variant_image_url: null, cost_price: 10, selling_price: 18.5,
  stock_quantity: 10, size: "M", color: "Black", category_id: null, is_active: true,
};
const sampleOrder = {
  id: "00000000-0000-0000-0000-000000000000", order_number: "SAMPLE-ORDER", total: 18, payment_method: "COD",
  payment_status: "unpaid", guest_name: "Dara", guest_phone: "010123456",
  guest_address: "123 Sample Street, Phnom Penh", fulfillment_type: "delivery",
  created_at: "2026-09-28T08:56:00Z", customers: null, order_items: [{ quantity: 1 }],
};

export default function LabelSettings({ kind, settings, store, branchId }: {
  branchId?:string; kind: "barcode" | "shipping"; settings: Record<string, unknown>;
  store: { name: string; phone: string; address: string; logoUrl?: string | null; websiteUrl?: string | null };
}) {
  const fields = kind === "barcode" ? barcodeFields : shippingFields;
  const sizes = kind === "barcode" ? ["40x20", "40x30", "50x30", "60x40", "80x50"] : ["80x50", "100x100", "100x150"];
  const initialSize = String(settings[`${kind}_label_size`] ?? "");
  const [size, setSize] = useState(sizes.includes(initialSize) ? initialSize : kind === "barcode" ? "50x30" : "100x150");
  const [shippingTemplateId, setShippingTemplateId] = useState<ShippingTemplateId>(() => shippingTemplate(settings.shipping_template,settings.shipping_custom_templates).id);
  const [namedTemplates,setNamedTemplates]=useState<NamedShippingTemplate[]>(()=>shippingCustomTemplates(settings.shipping_custom_templates));
  const [editor,setEditor]=useState<ShippingTemplateDraft|null>(null);
  const sampleValues=shippingValues(sampleOrder,store,'USD',true);
  const [customLayout, setCustomLayout] = useState<ShippingLayout>(() => {
    const paper = kind === 'shipping' ? size : '100x150';
    const saved = typeof settings.shipping_custom_layout === 'string' ? validateShippingLayout(JSON.parse(settings.shipping_custom_layout)) : defaultShippingLayout(paper);
    return resizeShippingLayout(saved, paper,Number(sampleValues.qrMinimumMm));
  });
  const [template, setTemplate] = useState<"product" | "price">(() => {
    const value = settings.barcode_template;
    return value === "price" ? "price" : "product";
  });
  const [visible, setVisible] = useState<Record<string, boolean>>(() => Object.fromEntries(fields.map(([key]) => {
    const value = settings[`${kind}_show_${snake(key)}`] ?? (kind === "shipping" && key.startsWith("store") ? settings.shipping_show_sender : undefined);
    return [key, value == null ? !["image", "customText"].includes(key) : Boolean(value)];
  })));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(settings.shipping_custom_qr_needs_review === true ? "The saved QR was too small for reliable printing and has been enlarged. Review the layout, then Save settings before printing custom labels." : "");
  async function save() {
    const data = new FormData();
    if(branchId)data.set("branchId",branchId);
    data.set(`${kind}LabelSize`, size);
    fields.forEach(([key]) => { if (visible[key]) data.set(`${kind}Show${upper(key)}`, "on"); });
    if (kind === "shipping") {
      data.set("shippingTemplate", shippingTemplateId);
      data.set("shippingCustomLayout", JSON.stringify(customLayout));
    }
    if (kind === "barcode") {
      data.set("barcodeTemplate", template);
      data.set("barcodeCustomText", "");
    }
    setBusy(true); setMessage("");
    try {
      if(kind === "shipping") {
        await saveShippingLabelSettings(data);
      } else await saveBarcodeLabelSettings(data);
      setMessage("Settings saved. The label printer will use this layout.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save settings. Please retry.");
    } finally { setBusy(false); }
  }
  async function saveNamedTemplate(draft:ShippingTemplateDraft){
    const data=new FormData();if(branchId)data.set('branchId',branchId);data.set('shippingLabelSize',draft.layout.size);data.set('shippingTemplate',`custom:${draft.id}`);data.set('shippingCustomTemplateDraft',JSON.stringify({id:draft.id,name:draft.name,layout:draft.layout}));data.set('shippingCustomTemplateMode',draft.mode);if(draft.original)data.set('shippingCustomTemplateOriginal',JSON.stringify(draft.original));
    fields.forEach(([key])=>{if(visible[key])data.set(`shippingShow${upper(key)}`,'on');});
    const result=await saveShippingCustomTemplate(data);setNamedTemplates(shippingCustomTemplates(result.customTemplates));setShippingTemplateId(`custom:${draft.id}`);setSize(draft.layout.size);setEditor(null);setMessage(result.warning??`Template "${draft.name}" saved and selected.`);
  }
  function chooseTemplate(value:ShippingTemplateId){
    if(value==='custom'){
      const layout=resizeShippingLayout(customLayout,size,Number(sampleValues.qrMinimumMm));
      if(!layout.elements.some(element=>element.field==='text')&&layout.elements.length<40)layout.elements.push({id:crypto.randomUUID(),field:'text',text:'',richText:[],x:5,y:84,width:90,height:10,fontSize:12,bold:false,align:'left'});
      setEditor({id:crypto.randomUUID(),name:'',mode:'create',layout});return;
    }
    setShippingTemplateId(value);setMessage('');const entry=namedTemplates.find(item=>`custom:${item.id}`===value);if(entry)setSize(entry.layout.size);
  }
  const selectedNamed=namedTemplates.find(entry=>`custom:${entry.id}`===shippingTemplateId);
  const previewSettings = {shipping_template:shippingTemplateId,shipping_custom_templates:JSON.stringify(namedTemplates),shipping_custom_qr_needs_review:selectedNamed?.needsReview===true,shipping_custom_layout:JSON.stringify(customLayout),shipping_sample_preview:true,font_size:settings.font_size,density:settings.density,...Object.fromEntries(fields.map(([key]) => [`${kind}_show_${snake(key)}`, visible[key]]))};
  return (
    <>
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-lg font-bold">{kind === "barcode" ? "Barcode Label Settings" : "Shipping Labels"}</h2>
        <p className="mt-1 text-sm text-slate-500">{kind === "shipping" ? "Choose an English, Khmer or custom template, then select the paper size." : "Choose a size and the details to print."}</p>
        {message && <p role="status" className="my-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200">{message}</p>}
        <fieldset disabled={busy} className="mt-5 min-w-0 space-y-5 disabled:pointer-events-none disabled:opacity-60">
          {kind === "shipping" && <div><ShippingTemplateSelect value={shippingTemplateId} customTemplates={namedTemplates} onChange={chooseTemplate} className={inputClass} /><p className="mt-2 text-xs text-slate-500">{shippingTemplate(shippingTemplateId,JSON.stringify(namedTemplates)).description}</p></div>}
          <label className="block text-sm font-semibold">Label size<select aria-label={kind === "shipping" ? "Shipping label size" : "Barcode label size"} value={size} onChange={event => {setSize(event.target.value);if(kind === "shipping")setCustomLayout(current=>resizeShippingLayout(current,event.target.value,Number(sampleValues.qrMinimumMm)));}} className={inputClass}>{sizes.map(value => <option key={value} value={value}>{value.replace("x", " × ")} mm{kind === "barcode" && value === "50x30" ? " — Default" : ""}</option>)}</select></label>
          {kind === "shipping" && <p className="text-xs text-slate-500">Width {size.split("x")[0]} mm × height {size.split("x")[1]} mm. {shippingTemplateId.startsWith('custom') ? 'Positions and field boxes scale with the paper. Font sizes stay as chosen; check for clipped text after resizing. Add or remove fields in the editor.' : 'Changing paper size selects its compact, square or portrait layout.'} The QR code stays square.</p>}
          {kind === "shipping" && (selectedNamed || shippingTemplateId==='custom') && <button type="button" onClick={()=>setEditor(selectedNamed?{id:selectedNamed.id,name:selectedNamed.name,layout:resizeShippingLayout(selectedNamed.layout,size,Number(sampleValues.qrMinimumMm)),mode:'update',original:selectedNamed}:{id:crypto.randomUUID(),name:'',layout:resizeShippingLayout(customLayout,size,Number(sampleValues.qrMinimumMm)),mode:'create'})} className="rounded-xl border px-4 py-2">{selectedNamed?'Edit template':'Open custom editor'}</button>}
          {kind === "barcode" && <div><h3 className="text-sm font-semibold">Label layout</h3><div className="mt-3 grid gap-3 sm:grid-cols-2">{(["product", "price"] as const).map(value => <button type="button" key={value} aria-pressed={template === value} onClick={() => { setTemplate(value); setVisible({...getTemplate(value).elements}); }} className={`min-w-0 rounded-xl border p-3 ${template === value ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600 dark:bg-blue-950" : "border-slate-200 dark:border-slate-700"}`}><div className="overflow-auto pb-2"><div className="mx-auto w-fit"><LabelCard fontSize={settings.font_size} density={settings.density} product={sampleProduct} businessName={store.name} size={value === "product" ? "40x30" : "50x30"} templateId={value} customText="" elements={getTemplate(value).elements}/></div></div><span className="text-sm font-semibold">{getTemplate(value).name}</span></button>)}</div></div>}

          {(kind !== "shipping" || !shippingTemplateId.startsWith("custom")) && <div className="grid gap-3 sm:grid-cols-2">{fields.map(([key, label]) => <label key={key} className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700"><input type="checkbox" checked={visible[key]} onChange={event => setVisible(previous => ({ ...previous, [key]: event.target.checked }))} className="accent-blue-600" />{label}</label>)}</div>}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => void save()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white"><Save size={18} />{busy ? "Saving…" : "Save settings"}</button>
            <Link href={kind === "barcode" ? "/dashboard/barcodes" : "/dashboard/shipping-labels"} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold dark:border-slate-700">Open label printer</Link>
          </div>
        </fieldset>
      </section>
      <aside className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 xl:sticky xl:top-6 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-lg font-bold">Live preview</h2>
        <p className="mt-1 text-sm text-slate-500">{kind === "shipping" ? shippingTemplate(shippingTemplateId,JSON.stringify(namedTemplates)).name + " · Sample data" : "Sample data"} · {size.replace("x", " × ")} mm. Changes appear immediately.</p>
        {kind === "shipping" && <p className="mt-2 text-xs text-slate-500">Print at 100% / Actual size with matching paper and no browser headers or footers. Long content is checked before website printing.</p>}
        {kind === "shipping" && shippingTemplateId.startsWith('custom') && <p className="mt-2 text-xs text-slate-500">Example Order QR code: sample only, does not open an order. Printed orders use their existing order QR link.</p>}
        <div className="mt-5 overflow-auto rounded-xl bg-slate-100 p-4 dark:bg-slate-800">
          <div className="mx-auto w-fit">
            {kind === "barcode" ? <LabelCard fontSize={settings.font_size} density={settings.density} product={sampleProduct} businessName={store.name} size={size} templateId={template} customText="" elements={{ name: visible.name, price: visible.price, sku: visible.sku, variant: visible.variant, barcode: visible.barcode, image: visible.image, storeName: visible.storeName, customText: false }} /> : <ShippingLabel order={sampleOrder} businessName={store.name} businessPhone={store.phone} businessAddress={store.address} businessLogo={store.logoUrl} businessWebsite={store.websiteUrl} size={size} settings={previewSettings} />}
          </div>
        </div>
      </aside>
    </div>
    {editor&&<ShippingTemplateEditor initial={editor} values={sampleValues} onClose={()=>setEditor(null)} onSave={saveNamedTemplate}/>}
    </>
  );
}
