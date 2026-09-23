import { exportGroups } from './catalog';

export function parseImportBackup(text: string, businessId: string, selected?: string[]) {
  if (Buffer.byteLength(text, 'utf8') > 10_000_000) throw new Error('Keep backup imports below 10 MB.');
  const backup = JSON.parse(text);
  if (!backup || backup.version !== 2 || backup.businessId !== businessId || !backup.data || Array.isArray(backup.data) || typeof backup.data !== 'object') {
    throw new Error('Choose a JSON backup exported from this business. Other business backups cannot be imported.');
  }
  const allowed: string[] = exportGroups.flatMap(group => [...group.tables]);
  const tables = Object.keys(backup.data);
  if (!tables.length || tables.some(table => !allowed.includes(table))) throw new Error('Backup contains unsupported datasets.');
  let total = 0;
  for (const table of tables) {
    const rows = backup.data[table];
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error(`Invalid rows in ${table}.`);
    if (backup.tables?.[table] !== rows.length) throw new Error(`Record count does not match ${table}. The backup may be incomplete.`);
    total += rows.length;
  }
  if (total > 20_000) throw new Error('Import at most 20,000 records per file. Export smaller groups separately.');
  if (selected && (!selected.length || new Set(selected).size !== selected.length || selected.some(table => !tables.includes(table)))) throw new Error('Select valid datasets from this backup.');
  return Object.fromEntries((selected ?? tables).map(table => [table, backup.data[table]])) as Record<string, Record<string, unknown>[]>;
}
