"use client";

import Link from "next/link";
import { useState } from "react";
import { Barcode, Printer, ReceiptText, Truck } from "lucide-react";
import type { ReceiptContext } from "@/lib/receipts/receipt-model";
import { ReceiptSettingsEditor } from "../receipts/receipt-settings-editor";
import LabelSettings from "./label-settings";

const tabs = [
  { id: "receipt", title: "Receipt Settings", icon: ReceiptText },
  { id: "barcode", title: "Barcode Label Settings", icon: Barcode },
  { id: "shipping", title: "Shipping Labels", icon: Truck },
] as const;

export default function PrinterSettings({ businessId, context, settings }: {
  businessId: string; context: ReceiptContext; settings: Record<string, unknown>;
}) {
  const [tab, setTab] = useState<string>("receipt");
  return (
    <main className="mx-auto max-w-[1400px] space-y-6 pb-8">
      <Link href="/dashboard/settings" className="text-sm font-semibold text-blue-600">← Settings</Link>
      <header>
        <h1 className="flex items-center gap-3 text-3xl font-bold"><Printer className="text-blue-600" />Printer Settings</h1>
        <p className="mt-2 text-slate-500">Customize receipts and labels. See changes in the live preview before saving.</p>
      </header>
      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900" aria-label="Printer settings sections">
        {tabs.map(({ id, title, icon: Icon }) => (
          <button type="button" key={id} aria-pressed={tab === id} aria-controls={`printer-${id}`} onClick={() => setTab(id)} className={`flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold ${tab === id ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}><Icon size={18} />{title}</button>
        ))}
      </div>
      <section id="printer-receipt" hidden={tab !== "receipt"} aria-label="Receipt settings">
        <ReceiptSettingsEditor businessId={businessId} initial={context} />
      </section>
      <section id="printer-barcode" hidden={tab !== "barcode"} aria-label="Barcode label settings">
        <LabelSettings kind="barcode" settings={settings} store={context.store} />
      </section>
      <section id="printer-shipping" hidden={tab !== "shipping"} aria-label="Shipping label settings">
        <LabelSettings kind="shipping" settings={settings} store={context.store} />
      </section>
    </main>
  );
}
