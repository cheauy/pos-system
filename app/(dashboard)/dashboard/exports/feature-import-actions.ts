'use server';

import { requirePermission } from '@/lib/auth/require-permission';
import { createClient } from '@/lib/supabase/server';
import { allImportTables, csvKindForTable, productImportNotice } from '@/lib/exports/import-catalog';
import { backupCsvRows, emptyBackupCsvTemplate, parseCsv, recordsJsonToCsv, recordsTemplate } from '@/lib/exports/import-files';
import { parseImportBackup } from '@/lib/exports/import-backup';
import { commitCsvImport, previewCsvImport, type ImportMode } from './actions';
import { downloadImportTemplate, importBackup } from './import-actions';
import { unstable_rethrow } from 'next/navigation';

type Format = 'json' | 'csv';
type Confirmation = { fingerprint: string; requestId: string; filename: string };
type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

function importFailure(error: unknown) {
  unstable_rethrow(error);
  return { ok: false as const, message: error instanceof SyntaxError ? 'The file is not valid JSON. Check it or download a fresh template.' : error instanceof Error ? error.message : 'Could not finish the import. Please try again.' };
}

function checkFeature(feature: string) {
  if (feature !== 'all' && !allImportTables.includes(feature)) throw new Error('Choose a feature.');
}

async function readInput(feature: string, text: string, format: Format) {
  checkFeature(feature);
  const business = await requirePermission('exports.manage');
  if (business.role !== 'owner') throw new Error('Only the business owner can import data.');
  if (!['csv', 'json'].includes(format) || typeof text !== 'string' || Buffer.byteLength(text) > 10_000_000) throw new Error('Choose a CSV or JSON file under 10 MB.');
  text = text.replace(/^\uFEFF/, '');
  const kind = csvKindForTable(feature);
  let data: Record<string, Record<string, unknown>[]>;
  if (format === 'json') {
    const parsed = JSON.parse(text);
    if (parsed?.version === 2) data = parseImportBackup(text, business.id, feature === 'all' ? undefined : [feature]);
    else {
      if (!kind) throw new Error('Use this feature’s downloaded template with existing records.');
      if (kind === 'products' && business.productMode !== 'standard') throw new Error(productImportNotice(business.productMode));
      const csv = recordsJsonToCsv(text, kind);
      return { route: 'records' as const, kind, csv, rowCount: parseCsv(csv).length - 1, tables: [feature] };
    }
  } else {
    const headers = parseCsv(text)[0] ?? [];
    if (kind && !headers.includes('dataset')) {
      if (kind === 'products' && business.productMode !== 'standard') throw new Error(productImportNotice(business.productMode));
      if (parseCsv(text).length < 2) throw new Error('This template is empty. Add your records below the column headers.');
      return { route: 'records' as const, kind, csv: text, rowCount: Math.max(0, parseCsv(text).length - 1), tables: [feature] };
    }
    const payload = backupCsvRows(text, feature);
    const db = await createClient();
    const result = await db.rpc('tenh_import_csv_types', { p_business_id: business.id, p_payload: payload });
    if (result.error) throw new Error(`Check the CSV template values. ${result.error.message}`);
    data = result.data;
  }
  if (!Object.values(data).some(rows => rows.length > 0)) throw new Error('This template is empty. Add your records before importing.');
  const backup = JSON.stringify({ version: 2, businessId: business.id, tables: Object.fromEntries(Object.entries(data).map(([table, rows]) => [table, rows.length])), data });
  return { route: 'backup' as const, backup, tables: Object.keys(data), rowCount: Object.values(data).reduce((sum, rows) => sum + rows.length, 0) };
}

export async function inspectFeatureImport(feature: string, text: string, format: Format): Promise<ActionResult<{ route: 'records' | 'backup'; rowCount: number; tables: string[] }>> {
  try {
    const input = await readInput(feature, text, format);
    return { ok: true, data: { route: input.route, rowCount: input.rowCount, tables: input.tables } };
  } catch (error) { return importFailure(error); }
}

export async function runFeatureImport(feature: string, text: string, format: Format, mode: ImportMode, confirmation?: Confirmation) {
  try {
  const input = await readInput(feature, text, format);
  if (!['insert', 'merge', 'update'].includes(mode)) throw new Error('Choose an import option.');
  if (input.route === 'backup') {
    if (mode !== 'update') throw new Error('Backup files restore existing records. Review the import option first.');
    return { ok: true as const, data: await importBackup(input.backup, input.tables, confirmation) };
  }
  if (confirmation) {
    const result = await commitCsvImport(input.kind, mode, input.csv, confirmation.filename, confirmation);
    if (!result.ok) return { ok: false as const, message: result.message };
    return { ok: true as const, data: { ...result, fingerprint: confirmation.fingerprint, rowCount: input.rowCount } };
  }
  const result = await previewCsvImport(input.kind, input.csv, mode);
  if (!result.ok || !result.fingerprint) return { ok: false as const, message: result.errors.join('\n') || result.message };
  return { ok: true as const, data: { inserted: result.inserted ?? 0, updated: result.updated ?? 0, skipped: result.skipped ?? 0, fingerprint: result.fingerprint, rowCount: input.rowCount } };
  } catch (error) { return importFailure(error); }
}

export async function getFeatureTemplate(feature: string, format: Format) {
  try {
  checkFeature(feature);
  if (!['csv', 'json'].includes(format)) throw new Error('Choose JSON or CSV.');
  const business = await requirePermission('exports.manage');
  if (business.role !== 'owner') throw new Error('Only the business owner can download import templates.');
  const kind = csvKindForTable(feature, business.productMode);
  let content: string;
  if (kind) content = recordsTemplate(kind, format);
  else {
    const result = await downloadImportTemplate(feature === 'all' ? allImportTables : [feature]);
    content = format === 'json' ? result.content : emptyBackupCsvTemplate(JSON.parse(result.content).columns);
  }
  if (Buffer.byteLength(content) > 10_000_000) throw new Error('This template is larger than 10 MB. Choose a smaller feature.');
  return { ok: true as const, data: { filename: `tenh-${feature}-template.${format}`, content, mime: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8' } };
  } catch (error) { return importFailure(error); }
}
