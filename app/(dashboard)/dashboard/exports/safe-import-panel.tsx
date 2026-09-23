'use client';

import { useRef, useState } from 'react';
import { Check, Download, FileText, Loader2, ShieldCheck, Upload, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { exportGroups } from '@/lib/exports/catalog';
import { csvImportTemplates, csvKindForTable, editableBackupTables, importDatasetLabel, productImportNotice } from '@/lib/exports/import-catalog';
import { getFeatureTemplate, inspectFeatureImport, runFeatureImport } from './feature-import-actions';
import type { ImportMode } from './actions';
import type { ProductMode } from '@/lib/business/types';
import Link from 'next/link';

type FileInfo = Extract<Awaited<ReturnType<typeof inspectFeatureImport>>, { ok: true }>['data'];
type Review = { inserted: number; updated: number; skipped: number; fingerprint: string; rowCount: number };

export default function SafeImportPanel({ isOwner, productMode }: { isOwner: boolean; productMode: ProductMode }) {
  const router = useRouter();
  const [feature, setFeature] = useState('products');
  const [templateFormat, setTemplateFormat] = useState<'csv' | 'json'>('csv');
  const [mode, setMode] = useState<ImportMode>(productMode === 'standard' ? 'insert' : 'update');
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [info, setInfo] = useState<FileInfo | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const locked = useRef(false);
  const requestId = useRef('');
  const input = useRef<HTMLInputElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const kind = csvKindForTable(feature, productMode);
  const existingProductsOnly = feature === 'products' && productMode !== 'standard';
  const featureLabel = feature === 'all' ? 'All features' : importDatasetLabel(feature);
  const protectedFeature = feature !== 'all' && !kind && !editableBackupTables.includes(feature);

  function fail(error: unknown) { setFailed(true); setMessage(typeof error === 'string' ? error : error instanceof Error ? error.message : 'Could not finish. Please try again.'); }
  function clearFile() {
    setFile(null); setText(''); setInfo(null); setReview(null); setMessage('');
    requestId.current = crypto.randomUUID();
    if (input.current) input.current.value = '';
  }
  function changeFeature(value: string) {
    if (locked.current) return;
    setFeature(value); setMode(csvKindForTable(value, productMode) ? 'insert' : 'update'); clearFile();
  }
  async function downloadTemplate() {
    if (locked.current) return;
    locked.current = true; setBusy('template'); setMessage('');
    try {
      const response = await getFeatureTemplate(feature, templateFormat);
      if (!response.ok) { fail(response.message); return; }
      const result = response.data;
      const url = URL.createObjectURL(new Blob([result.content], { type: result.mime }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = result.filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { fail(error); }
    finally { locked.current = false; setBusy(''); }
  }
  async function chooseFile(next: File | null) {
    if (locked.current || !next) return;
    clearFile(); setFile(next); locked.current = true; setBusy('file');
    try {
      const extension = next.name.toLowerCase().split('.').pop();
      if (extension !== 'csv' && extension !== 'json') throw new Error('Choose a CSV or JSON file.');
      if (next.size > 10_000_000) throw new Error('Maximum file size is 10 MB.');
      const content = await next.text();
      const response = await inspectFeatureImport(feature, content, extension);
      if (!response.ok) { fail(response.message); if (input.current) input.current.value = ''; return; }
      const details = response.data;
      setText(content); setFormat(extension); setInfo(details); setMode(details.route === 'backup' ? 'update' : 'insert');
    } catch (error) { fail(error); if (input.current) input.current.value = ''; }
    finally { locked.current = false; setBusy(''); }
  }
  async function validate() {
    if (locked.current || !info) return;
    locked.current = true; setBusy('validate'); setMessage(''); setReview(null);
    try {
      const result = await runFeatureImport(feature, text, format, mode);
      if (!result.ok) { fail(result.message); return; }
      setReview(result.data); requestAnimationFrame(() => reviewHeading.current?.focus());
    }
    catch (error) { fail(error); }
    finally { locked.current = false; setBusy(''); }
  }
  async function commit() {
    if (locked.current || !file || !info || !review) return;
    locked.current = true; setBusy('import'); setMessage('');
    try {
      const response = await runFeatureImport(feature, text, format, mode, { fingerprint: review.fingerprint, requestId: requestId.current, filename: file.name });
      if (!response.ok) { fail(response.message); setReview(null); return; }
      const result = response.data;
      clearFile(); setFailed(false); setMessage(`Done: ${result.inserted} added · ${result.updated} updated · ${result.skipped} skipped.`); router.refresh();
    } catch (error) { fail(error); setReview(null); }
    finally { locked.current = false; setBusy(''); }
  }

  return <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
    <div className="flex items-center gap-3"><span className="rounded-xl bg-blue-50 p-2.5 text-blue-600 dark:bg-blue-950/40"><Upload size={21} /></span><div><h2 className="text-xl font-bold">Import Data</h2><p className="text-xs text-slate-500">Choose. Upload. Review.</p></div></div>
    {!isOwner ? <p className="mt-5 text-sm text-slate-500">Only the business owner can import data.</p> : <fieldset disabled={Boolean(busy)} className="mt-6 space-y-5 disabled:opacity-70">
      <div>
        <label htmlFor="import-feature" className="text-sm font-semibold">1. Choose feature</label>
        <select id="import-feature" value={feature} onChange={event => changeFeature(event.target.value)} className={field}>
          {exportGroups.map(group => <optgroup key={group.id} label={group.label}>{group.tables.map(table => <option key={table} value={table}>{importDatasetLabel(table)}{!csvKindForTable(table, productMode) && !editableBackupTables.includes(table) ? ' (protected)' : ''}</option>)}</optgroup>)}
          <option value="all">All features (backup)</option>
        </select>
        {existingProductsOnly && <p className="mt-2 text-xs text-slate-500">{productMode === 'variant' ? 'Variant' : 'Configurable'} products: update existing only. <Link href="/dashboard/products" className="font-semibold text-blue-600 hover:underline">Add new in Products</Link>.</p>}
        <div className="mt-3 flex gap-2"><select aria-label="Template file type" value={templateFormat} onChange={event => setTemplateFormat(event.target.value as 'csv' | 'json')} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"><option value="csv">CSV</option><option value="json">JSON</option></select><button type="button" onClick={() => void downloadTemplate()} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">{busy === 'template' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}Download template</button></div>
        <details className="mt-3 text-xs text-slate-500"><summary className="w-fit cursor-pointer hover:text-blue-600">Template help</summary><div className="mt-2 space-y-2 leading-5"><p>Templates contain column names only. Your saved products and other records are not included.</p><p>{existingProductsOnly ? productImportNotice(productMode) : kind ? csvImportTemplates[kind].help : protectedFeature ? 'Existing history is checked only. Changed or missing records block import; sales and payments are never replayed.' : 'Enter existing record IDs and the values to update. To restore saved data, use an exported JSON backup.'}</p>{kind && <><p>Add your rows below the CSV headers, or add objects to the JSON records list. Matches use {csvImportTemplates[kind].match.toLowerCase()}.</p><p className="break-words"><strong>Fields: </strong>{csvImportTemplates[kind].csv.split('\n')[0].replaceAll(',', ', ')}</p></>}{!kind && <p>CSV: enter the dataset name for each row. JSON: add records inside data and update each dataset’s row count in tables. Keep IDs unchanged.</p>}<p>New records: 1,000 rows / 750 KB. Backups: 20,000 rows / 10 MB. Customer, supplier and stock imports use the current branch.</p></div></details>
      </div>
      <div>
        <h3 className="text-sm font-semibold">2. Upload file</h3>
        <div onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!locked.current) void chooseFile(event.dataTransfer.files[0] ?? null); }} className="mt-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/70 p-5 text-center dark:border-slate-700 dark:bg-slate-950/30">
          <input ref={input} type="file" accept=".csv,.json" className="sr-only" aria-label="Import CSV or JSON file" onChange={event => void chooseFile(event.target.files?.[0] ?? null)} />
          {file ? <><FileText className="mx-auto text-blue-600" size={24} /><p className="mt-2 truncate text-sm font-semibold" title={file.name}>{file.name}</p><p className="mt-1 text-xs text-slate-500">{busy === 'file' ? 'Reading file…' : info ? `${info.rowCount.toLocaleString()} records · ${info.route === 'backup' ? 'Backup' : format.toUpperCase()}` : 'Check the file below'}</p><button type="button" onClick={clearFile} className="mt-3 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-600"><X size={13} />Remove file</button></> : <><Upload className="mx-auto text-slate-400" size={24} /><button type="button" onClick={() => input.current?.click()} className="mt-2 text-sm font-semibold text-blue-600">Choose file</button><p className="mt-1 text-xs text-slate-500">or drop CSV / JSON here</p></>}
        </div>
        {info?.route === 'records' ? <label className="mt-3 block text-xs font-semibold">Import option<select value={mode} onChange={event => { setMode(event.target.value as ImportMode); setReview(null); setMessage(''); requestId.current = crypto.randomUUID(); }} className={field}><option value="insert">Add new only</option><option value="merge">Add new + update existing</option><option value="update">Update existing only</option></select></label> : <p className="mt-3 text-xs text-slate-500">{protectedFeature ? 'Protected history: verify only.' : info?.route === 'backup' || !kind ? 'Backup restore: existing records only.' : 'Default: add new only. Existing matches stay unchanged.'}</p>}
      </div>
      {review ? <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/20"><h3 ref={reviewHeading} tabIndex={-1} className="flex items-center gap-2 text-sm font-semibold outline-none"><Check size={17} className="text-emerald-600" />3. Review import</h3><p className="mt-1 text-xs text-slate-500">{featureLabel}{feature === 'all' ? ` · ${info?.tables.length ?? 0} datasets` : ''}</p><div className="mt-3 grid grid-cols-3 divide-x divide-emerald-200 text-center">{[[review.inserted, 'New'], [review.updated, 'Updates'], [review.skipped, 'Skipped']].map(([value, label]) => <div key={label}><strong className="block text-xl">{value}</strong><span className="text-xs text-slate-500">{label}</span></div>)}</div><p className="mt-3 text-xs text-slate-600 dark:text-slate-400">{mode === 'insert' ? 'Existing records stay unchanged.' : review.updated ? 'Matching values will be replaced.' : 'No existing values will change.'} Nothing is deleted.</p><div className="mt-3 flex gap-2"><button type="button" onClick={() => setReview(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">Back</button><button type="button" onClick={() => void commit()} className={`${primary} flex-1`}>{busy === 'import' ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}{busy === 'import' ? 'Importing…' : 'Confirm import'}</button></div></div> : <button type="button" disabled={!info} onClick={() => void validate()} className={`${primary} w-full`}>{busy === 'validate' ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}{busy === 'validate' ? 'Checking…' : 'Check file & continue'}</button>}
      <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400"><ShieldCheck size={13} />Validated first. All changes save together.</p>
    </fieldset>}
    {message && <p role={failed ? 'alert' : 'status'} className={`mt-4 whitespace-pre-line rounded-xl p-3 text-sm ${failed ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300' : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'}`}>{message}</p>}
  </section>;
}
const field = 'mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal dark:border-slate-700 dark:bg-slate-950';
const primary = 'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40';
