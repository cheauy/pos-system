import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import LanguageProvider, { useLanguage } from '../../components/providers/language-provider';
import ExportClient from '../../app/(dashboard)/dashboard/exports/export-client';
import ShippingTemplateEditor, { type ShippingTemplateDraft } from '../../app/(dashboard)/dashboard/settings/printers/shipping-template-editor';
import { orderQrSvg } from '../../lib/orders/order-qr';
import { defaultShippingLayout, resizeShippingLayout, validateShippingLayout } from '../../lib/receipts/shipping-layout';

type Call = { name: string; args: unknown[] };
const calls: Call[] = [], saved: ShippingTemplateDraft[] = [];
let failSave = false, owner = true;
declare global { interface Window { layoutFixture: { calls: Call[]; saved: ShippingTemplateDraft[]; failNextSave: () => void; setOwner: (next: boolean) => void; initial: ShippingTemplateDraft } } }
const wait = () => new Promise(resolve => setTimeout(resolve, 180));
export function useRouter() { return { refresh: () => calls.push({ name: 'refresh', args: [] }) }; }
export function Link({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) { return <a {...props}>{children}</a>; }
export default Link;
export async function exportBusinessData(groups: string[], format: string, tables: string[], allBranches: boolean) {
  calls.push({ name: 'export', args: [groups, format, tables, allBranches] }); await wait();
  return { encoding: 'text', content: 'synthetic fixture only', mime: 'text/plain', filename: `synthetic.${format}`, rowCount: tables.length, sheetCount: format === 'xlsx' ? tables.length : 0 };
}
export async function buildExport(entity: string, format: string) { calls.push({ name: 'staff-export', args: [entity, format] }); await wait(); return { ok: true, content: 'synthetic', mime: 'text/plain', filename: `synthetic.${format}`, rowCount: 1 }; }
export async function buildExportAll() { return buildExport('all', 'json'); }
export async function getFeatureTemplate(feature: string, format: string) { calls.push({ name: 'template', args: [feature, format] }); return { ok: true, data: { content: 'name,sku\n', mime: 'text/plain', filename: `synthetic-template.${format}` } }; }
export async function inspectFeatureImport(feature: string, text: string, format: string) {
  calls.push({ name: 'inspect', args: [feature, format] }); await wait();
  if (text.includes('INVALID')) return { ok: false, message: 'Synthetic validation error: check the file columns.' };
  return { ok: true, data: { rowCount: 2, route: text.includes('BACKUP') ? 'backup' : 'records', tables: [feature] } };
}
export async function runFeatureImport(feature: string, text: string, format: string, mode: string, confirmation?: unknown) {
  calls.push({ name: confirmation ? 'confirm' : 'validate', args: [feature, format, mode, confirmation] }); await wait();
  return { ok: true, data: { inserted: text.includes('BACKUP') ? 0 : 2, updated: text.includes('BACKUP') ? 2 : 0, skipped: 0, fingerprint: 'synthetic-review' } };
}
const initial: ShippingTemplateDraft = { id: 'synthetic-template', mode: 'create', name: 'Synthetic courier label', layout: resizeShippingLayout(defaultShippingLayout('80x50'), '80x50', 20.6) };
window.layoutFixture = { calls, saved, initial, failNextSave: () => { failSave = true; }, setOwner: next => { owner = next; } };
const values = { businessName: 'Synthetic shop', shopName: 'Synthetic shop', customerName: 'Synthetic recipient', customerPhone: '000000000', customerAddress: 'Synthetic address', orderNumber: '#1001', orderCode: '123456789012', qrMinimumMm: '20.6', qrPayload: 'https://tenhpos.com/o/123456789012', qr: orderQrSvg('123456789012') };
const jobs = [{ id: 'synthetic-job', direction: 'export', entity: 'products', format: 'csv', mode: null, filename: 'synthetic-products.csv', row_count: 2, status: 'completed', error_message: null, created_at: '2026-10-12T01:00:00Z' }];
function Fixture() {
  const { language, setLanguage } = useLanguage();
  const [draft, setDraft] = useState<ShippingTemplateDraft | null>(null), [showJobs, setShowJobs] = useState(true), [isOwner, setOwner] = useState(owner);
  return <><div className="fixture-tools"><button onClick={() => setLanguage(language === 'en' ? 'km' : 'en')}>Fixture language</button><button onClick={() => setDraft(structuredClone(initial))}>Open shipping editor</button><button onClick={() => setDraft({ ...structuredClone(initial), mode: 'update' })}>Open existing template</button><button onClick={() => setShowJobs(!showJobs)}>Toggle synthetic history</button><button onClick={() => setOwner(!isOwner)}>Toggle fixture role</button></div>
    <header className="fixture-header"><span aria-hidden="true">☰</span><div><small>TENH POS · Synthetic fixture</small><strong>Backup &amp; Export</strong></div><span>Main Branch</span></header>
    <main className="fixture-content"><ExportClient recentJobs={showJobs ? jobs : []} isOwner={isOwner} productMode="variant" /></main>
    {draft && <ShippingTemplateEditor initial={draft} values={values} onClose={() => setDraft(null)} onSave={async next => { calls.push({ name: 'save', args: [next.mode] }); await wait(); if (failSave) { failSave = false; throw Error('Synthetic save error. Please try again.'); } validateShippingLayout(next.layout, 20.6); saved.push(structuredClone(next)); setDraft(null); }} />}
  </>;
}
createRoot(document.getElementById('root')!).render(<LanguageProvider initialLanguage="en"><div className="workspace-theme"><Fixture /></div></LanguageProvider>);
