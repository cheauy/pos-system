'use server';

import { requirePermission } from '@/lib/auth/require-permission';
import { createClient } from '@/lib/supabase/server';
import { parseImportBackup } from '@/lib/exports/import-backup';
import { revalidatePath } from 'next/cache';
import { exportGroups, selectedExportTables } from '@/lib/exports/catalog';
import { importColumns } from '@/lib/exports/import-columns';

export async function downloadImportTemplate(selected: string[]) {
  const tables = selectedExportTables(exportGroups.map(group => group.id), selected);
  const business = await requirePermission('exports.manage');
  if (business.role !== 'owner') throw new Error('Only the business owner can download import templates.');
  const backup = { version: 2, businessId: business.id, tables: Object.fromEntries(tables.map(table => [table, 0])), columns: Object.fromEntries(tables.map(table => [table, importColumns[table]])), data: Object.fromEntries(tables.map(table => [table, []])) };
  return {
    content: JSON.stringify(backup, null, 2),
    mime: 'application/json',
    filename: `tenh-import-template-${tables.length === 1 ? tables[0] : 'selected'}-${new Date().toISOString().slice(0, 10)}.json`,
    samples: tables.map(table => ({ table, count: 0, example: null })),
  };
}

export async function inspectBackup(text: string) {
  const business = await requirePermission('exports.manage');
  if (business.role !== 'owner') throw new Error('Only the business owner can import data.');
  const data = parseImportBackup(text, business.id);
  return Object.entries(data).map(([table, rows]) => ({ table, count: rows.length }));
}

export async function importBackup(text: string, selected: string[], confirmation?: { fingerprint: string; requestId: string; filename: string }) {
  const business = await requirePermission('exports.manage');
  if (business.role !== 'owner') throw new Error('Only the business owner can import data.');
  const payload = parseImportBackup(text, business.id, selected);
  const db = await createClient();
  const { data, error } = await db.rpc('tenh_import_business_safe', {
    p_business_id: business.id, p_kind: 'backup', p_mode: 'update', p_payload: payload,
    p_commit: Boolean(confirmation), p_expected: confirmation?.fingerprint ?? null,
    p_request_id: confirmation?.requestId ?? null, p_filename: confirmation?.filename ?? null,
  });
  if (error) throw new Error(error.message);
  if (confirmation) revalidatePath('/dashboard', 'layout');
  return data as { inserted: number; updated: number; skipped: number; rowCount: number; fingerprint: string };
}
