"use client";

import Link from 'next/link';
import PrintButton from '@/components/print-button';
import { useMemo, useState } from 'react';
import { ChevronLeft, Search, Truck } from 'lucide-react';
import ShippingLabelCard from '@/components/receipts/shipping-label';
import ShippingTemplateSelect from '@/components/receipts/shipping-template-select';
import { SHIPPING_LABEL_SIZES, shippingLabelSize, shippingTemplate, shippingCustomTemplates, type ShippingTemplateId } from '@/lib/receipts/shipping-templates';
import type { ShippingOrder } from '@/lib/receipts/shipping-label-markup';

type Customer = { name?: string | null; phone?: string | null; address?: string | null };
export type Order = ShippingOrder & {
  payment_status: string | null; guest_name: string | null; guest_phone: string | null; guest_address: string | null;
  fulfillment_type: string | null; customers: Customer | Customer[] | null; order_items: Array<{ quantity: number }>;
};

export default function ShippingLabelsClient({ businessName, businessPhone, businessAddress, businessLogo, businessWebsite, orders, settings }: {
  businessName: string; businessPhone: string; businessAddress: string; businessLogo?: string | null; businessWebsite?: string | null; orders: Order[]; settings: Record<string, unknown>;
}) {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [size, setSize] = useState(() => shippingLabelSize(settings.shipping_label_size).id);
  const customTemplates=useMemo(()=>shippingCustomTemplates(settings.shipping_custom_templates),[settings.shipping_custom_templates]);
  const [template, setTemplate] = useState<ShippingTemplateId>(() => shippingTemplate(settings.shipping_template,settings.shipping_custom_templates).id);
  const filtered = useMemo(() => orders.filter(order => `${order.order_number} ${order.guest_name ?? ''} ${order.guest_phone ?? ''} ${order.guest_address ?? ''}`.toLowerCase().includes(q.toLowerCase())), [orders, q]);
  const chosen = orders.filter(order => selected.includes(order.id));
  const previewSettings = useMemo(() => ({ ...settings, shipping_template: template,shipping_custom_qr_needs_review:template.startsWith('custom:')?customTemplates.find(entry=>`custom:${entry.id}`===template)?.needsReview===true:settings.shipping_custom_qr_needs_review }), [settings, template,customTemplates]);
  function toggle(id: string) { setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]); }
  const selectClass = 'mt-2 w-full min-w-0 rounded-xl border border-slate-200 bg-white p-3 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
  return <main className="mx-auto max-w-[1600px] space-y-5 pb-10">
    <div>
      <Link href="/dashboard/settings/printers" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600"><ChevronLeft size={16} />Printer Settings</Link>
      <h1 className="mt-3 flex items-center gap-3 text-3xl font-bold"><Truck />Shipping Labels</h1>
      <p className="mt-1 text-slate-500">Print labels only for delivery orders in this business.</p>
    </div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_460px]">
      <section className="min-w-0 rounded-2xl border bg-white p-5 shadow-sm">
        <div className="relative"><Search className="absolute left-3 top-3 text-slate-400" size={18} /><input value={q} onChange={event => setQ(event.target.value)} placeholder="Search order, customer, phone or address" className="w-full rounded-xl border py-2.5 pl-10 pr-3" /></div>
        <div className="mt-4 divide-y">{filtered.length ? filtered.map(order => {
          const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers;
          const name = order.guest_name || customer?.name || 'Customer';
          const phone = order.guest_phone || customer?.phone || '';
          const address = order.guest_address || customer?.address || '';
          return <label key={order.id} className="flex items-start gap-3 py-3">
            <input type="checkbox" className="mt-1" checked={selected.includes(order.id)} onChange={() => toggle(order.id)} />
            <div className="min-w-0 flex-1"><p className="font-semibold">{order.order_number} · {name}</p><p className="text-xs text-slate-500">{phone}</p><p className="truncate text-xs text-slate-500">{address || 'No delivery address'}</p></div><span className="font-bold">${Number(order.total).toFixed(2)}</span>
          </label>;
        }) : <div className="py-12 text-center text-slate-500">No delivery orders found.</div>}</div>
      </section>
      <aside className="min-w-0 rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="font-bold">Print preview</h2>
        <div className="mt-4 space-y-3">
          <ShippingTemplateSelect value={template} customTemplates={customTemplates} onChange={value=>{setTemplate(value);const saved=customTemplates.find(entry=>`custom:${entry.id}`===value);if(saved)setSize(shippingLabelSize(saved.layout.size).id);}} className={selectClass} />
          <label className="block text-sm font-semibold">Label size<select aria-label="Shipping label size" value={size} onChange={event => setSize(shippingLabelSize(event.target.value).id)} className={selectClass}>{SHIPPING_LABEL_SIZES.map(paper => <option key={paper.id} value={paper.id}>{paper.label}</option>)}</select></label>
          <p className="text-xs text-slate-500">{chosen.length} selected · Width {shippingLabelSize(size).width} mm × height {shippingLabelSize(size).height} mm</p>
          <p className="text-xs text-slate-500">These choices apply to this print batch. Save your defaults in Printer Settings. Print at 100% / Actual size using matching paper.</p>
        </div>
        <div id="shipping-label-print-area" className="my-4 max-h-[560px] space-y-3 overflow-auto">{chosen.map(order => <ShippingLabel key={order.id} order={order} businessName={businessName} businessPhone={businessPhone} businessAddress={businessAddress} businessLogo={businessLogo} businessWebsite={businessWebsite} size={size} settings={previewSettings} />)}</div>
        {!chosen.length && <p className="my-8 text-center text-sm text-slate-500">Select a delivery order to preview its label.</p>}
        <PrintButton selector="#shipping-label-print-area" label={`Print ${chosen.length} shipping label${chosen.length === 1 ? '' : 's'}`} disabled={!chosen.length} />
      </aside>
    </div>
    <ShippingPrintStyles size={size} />
  </main>;
}

/** Compatibility export used by Printer Settings and each saved order. */
export function ShippingLabel({ order, businessName, businessPhone, businessAddress, businessLogo, businessWebsite, size, settings }: {
  order: ShippingOrder; businessName: string; businessPhone: string; businessAddress: string; businessLogo?: string | null; businessWebsite?: string | null; size: string; settings: Record<string, unknown>;
}) {
  const store = useMemo(() => ({ name: businessName, phone: businessPhone, address: businessAddress, logoUrl: businessLogo, websiteUrl: businessWebsite }), [businessName, businessPhone, businessAddress, businessLogo, businessWebsite]);
  return <ShippingLabelCard order={order} store={store} settings={settings} size={size} />;
}

export function ShippingPrintStyles({ size }: { size: string }) {
  const { width, height } = shippingLabelSize(size);
  return <style media="print">{`@page{size:${width}mm ${height}mm!important;margin:0!important}
 html,body{width:${width}mm!important;min-width:${width}mm!important;margin:0!important;padding:0!important;background:white!important}
 body *:has(#shipping-label-print-area){display:block!important;position:static!important;margin:0!important;padding:0!important;overflow:visible!important;height:auto!important;min-height:0!important;max-height:none!important;transform:none!important}
 body *:not(:has(#shipping-label-print-area)):not(#shipping-label-print-area):not(#shipping-label-print-area *){display:none!important}
 #shipping-label-print-area,#shipping-label-print-area *{visibility:visible!important;color:black!important}
 #shipping-label-print-area{display:block!important;position:static!important;margin:0!important;padding:0!important;max-height:none!important;overflow:visible!important}
 #shipping-label-print-area .no-print{display:none!important}
 #shipping-label-print-area .shipping-label-preview{display:block!important;break-after:page;break-inside:avoid;page-break-inside:avoid;margin:0!important;padding:0!important;box-shadow:none!important}
 #shipping-label-print-area .shipping-label-preview:last-child{break-after:auto;page-break-after:auto}
 .shipping-label{break-inside:avoid;break-after:auto;margin:0!important;box-shadow:none!important}
 `}</style>;
}
