"use client";

import Link from "next/link";
import { useState } from "react";
import { Barcode, Pencil, Printer, ReceiptText, Truck } from "lucide-react";
import type { ReceiptContext } from "@/lib/receipts/receipt-model";
import { ReceiptSettingsEditor } from "../receipts/receipt-settings-editor";
import LabelSettings from "./label-settings";
import PrinterConnection from "./printer-connection";

const tabs = [
  { id: "receipt", title: "Receipt Settings", icon: ReceiptText },
  { id: "barcode", title: "Barcode Label Settings", icon: Barcode },
  { id: "shipping", title: "Shipping Labels", icon: Truck },
] as const;

export default function PrinterSettings({ businessId, context, settings, storeUrl }: {
  businessId: string; storeUrl?: string; context: ReceiptContext; settings: Record<string, unknown>;
}) {
  const [tab, setTab] = useState<string>("receipt");
  // Mount a tab's editor and preview on first visit only; keep it mounted afterwards so drafts survive tab switches.
  const [visited, setVisited] = useState<string[]>(["receipt"]);
  const open = (id: string) => { setTab(id); setVisited(list => list.includes(id) ? list : [...list, id]); };
  return (
    <main className="mx-auto max-w-[1400px] space-y-6 pb-8">
      <header className="flex flex-wrap items-start justify-between gap-4 max-sm:hidden">
        <div>
        <h1 className="flex items-center gap-3 text-3xl font-bold"><Printer className="text-blue-600" />Printer Settings</h1>
        <p className="mt-2 text-slate-500">Customize receipts and labels. See changes in the live preview before saving.</p>
        </div>
        <Link href="/dashboard/settings/business#business-info" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          <Pencil size={16} />Edit your business info
        </Link>
      </header>
      <div className="max-sm:hidden"><PrinterConnection /></div>
      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 max-sm:grid max-sm:grid-cols-3 max-sm:gap-1 dark:border-slate-700 dark:bg-slate-900" aria-label="Printer settings sections">
        {tabs.map(({ id, title, icon: Icon }) => (
          <button type="button" key={id} aria-pressed={tab === id} aria-controls={`printer-${id}`} onClick={() => open(id)} className={`flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold max-sm:flex-col max-sm:justify-center max-sm:gap-1 max-sm:px-1 max-sm:py-2 max-sm:text-center max-sm:text-[11px] max-sm:leading-tight ${tab === id ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}><Icon size={18} />{title}</button>
        ))}
      </div>
      <section id="printer-receipt" hidden={tab !== "receipt"} aria-label="Receipt settings">
        <ReceiptSettingsEditor businessId={businessId} key={context.branchId} initial={context} />
      </section>
      <section id="printer-barcode" hidden={tab !== "barcode"} aria-label="Barcode label settings">
        {visited.includes("barcode") && <LabelSettings key={context.branchId} branchId={context.branchId} kind="barcode" settings={settings} store={context.store} />}
      </section>
      <section id="printer-shipping" hidden={tab !== "shipping"} aria-label="Shipping label settings">
        {visited.includes("shipping") && <LabelSettings key={context.branchId} branchId={context.branchId} kind="shipping" settings={settings} store={{ ...context.store, logoUrl: context.appearance.logoUrl, websiteUrl: storeUrl }} />}
      </section>
    </main>
  );
}
