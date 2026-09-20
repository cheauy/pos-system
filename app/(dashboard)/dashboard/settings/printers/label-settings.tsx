"use client";

import Link from "next/link";
import { useState } from "react";
import { Save } from "lucide-react";
import { LabelCard, getTemplate } from "../../barcodes/barcode-labels-client";
import { ShippingLabel } from "../../shipping-labels/shipping-labels-client";
import { saveBarcodeLabelSettings, saveShippingLabelSettings } from "../receipts/actions";

const barcodeFields = [
  ["name", "Product name"], ["price", "Price"], ["sku", "SKU / barcode text"],
  ["variant", "Size / color"], ["barcode", "Barcode"], ["image", "Product image"],
  ["storeName", "Store name"],
] as const;
const shippingFields = [
  ["storeName", "Store name"], ["storeAddress", "Store address"],
  ["storePhone", "Store phone number"], ["phone", "Customer phone"],
  ["orderNumber", "Order number"], ["cod", "Payment and amount"],
  ["itemCount", "Item count"], ["barcode", "Order barcode"],
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
  id: "sample-order", order_number: "WEB-123456", total: 37, payment_method: "COD",
  payment_status: "unpaid", guest_name: "Sample Customer", guest_phone: "012 345 678",
  guest_address: "123 Sample Street, Phnom Penh", fulfillment_type: "delivery",
  created_at: "2026-01-01T00:00:00Z", customers: null, order_items: [{ quantity: 2 }],
};

export default function LabelSettings({ kind, settings, store }: {
  kind: "barcode" | "shipping"; settings: Record<string, unknown>;
  store: { name: string; phone: string; address: string };
}) {
  const fields = kind === "barcode" ? barcodeFields : shippingFields;
  const sizes = kind === "barcode" ? ["40x20", "40x30", "50x30", "60x40", "80x50"] : ["80x50", "100x100", "100x150"];
  const initialSize = String(settings[`${kind}_label_size`] ?? "");
  const [size, setSize] = useState(sizes.includes(initialSize) ? initialSize : kind === "barcode" ? "50x30" : "100x150");
  const [template, setTemplate] = useState<"product" | "price">(() => {
    const value = settings.barcode_template;
    return value === "price" ? "price" : "product";
  });
  const [visible, setVisible] = useState<Record<string, boolean>>(() => Object.fromEntries(fields.map(([key]) => {
    const value = settings[`${kind}_show_${snake(key)}`] ?? (kind === "shipping" && key.startsWith("store") ? settings.shipping_show_sender : undefined);
    return [key, value == null ? !["image", "customText"].includes(key) : Boolean(value)];
  })));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save() {
    const data = new FormData();
    data.set(`${kind}LabelSize`, size);
    fields.forEach(([key]) => { if (visible[key]) data.set(`${kind}Show${upper(key)}`, "on"); });
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
  const previewSettings = Object.fromEntries(fields.map(([key]) => [`${kind}_show_${snake(key)}`, visible[key]]));
  return (
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-lg font-bold">{kind === "barcode" ? "Barcode Label Settings" : "Shipping Labels"}</h2>
        <p className="mt-1 text-sm text-slate-500">Choose a size and the details to print.</p>
        {message && <p role="status" className="my-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200">{message}</p>}
        <fieldset disabled={busy} className="mt-5 space-y-5 disabled:pointer-events-none disabled:opacity-60">
          <label className="block text-sm font-semibold">Label size<select value={size} onChange={event => setSize(event.target.value)} className={inputClass}>{sizes.map(value => <option key={value} value={value}>{value.replace("x", " × ")} mm{kind === "barcode" && value === "50x30" ? " — Default" : ""}</option>)}</select></label>
          {kind === "barcode" && <div><h3 className="text-sm font-semibold">Label layout</h3><div className="mt-3 grid gap-3 sm:grid-cols-2">{(["product", "price"] as const).map(value => <button type="button" key={value} aria-pressed={template === value} onClick={() => { setTemplate(value); setVisible({...getTemplate(value).elements}); }} className={`min-w-0 rounded-xl border p-3 ${template === value ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600 dark:bg-blue-950" : "border-slate-200 dark:border-slate-700"}`}><div className="overflow-auto pb-2"><div className="mx-auto w-fit"><LabelCard product={sampleProduct} businessName={store.name} size={value === "product" ? "40x30" : "50x30"} templateId={value} customText="" elements={getTemplate(value).elements}/></div></div><span className="text-sm font-semibold">{getTemplate(value).name}</span></button>)}</div></div>}

          <div className="grid gap-3 sm:grid-cols-2">{fields.map(([key, label]) => <label key={key} className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700"><input type="checkbox" checked={visible[key]} onChange={event => setVisible(previous => ({ ...previous, [key]: event.target.checked }))} className="accent-blue-600" />{label}</label>)}</div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => void save()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white"><Save size={18} />{busy ? "Saving…" : "Save settings"}</button>
            <Link href={kind === "barcode" ? "/dashboard/barcodes" : "/dashboard/shipping-labels"} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold dark:border-slate-700">Open label printer</Link>
          </div>
        </fieldset>
      </section>
      <aside className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 xl:sticky xl:top-6 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-lg font-bold">Live preview</h2>
        <p className="mt-1 text-sm text-slate-500">Sample data · {size.replace("x", " × ")} mm. Changes appear immediately.</p>
        <div className="mt-5 overflow-auto rounded-xl bg-slate-100 p-4 dark:bg-slate-800">
          <div className="mx-auto w-fit">
            {kind === "barcode" ? <LabelCard product={sampleProduct} businessName={store.name} size={size} templateId={template} customText="" elements={{ name: visible.name, price: visible.price, sku: visible.sku, variant: visible.variant, barcode: visible.barcode, image: visible.image, storeName: visible.storeName, customText: false }} /> : <ShippingLabel order={sampleOrder} businessName={store.name} businessPhone={store.phone} businessAddress={store.address} size={size} settings={previewSettings} />}
          </div>
        </div>
      </aside>
    </div>
  );
}
