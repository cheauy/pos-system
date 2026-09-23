import { allImportTables, csvImportTemplates, type CsvImportKind } from './import-catalog';

export function parseCsv(text: string): string[][] {
  text = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false, closed = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { field += '"'; index++; }
        else { quoted = false; closed = true; }
      } else field += char;
    } else if (char === ',' || char === '\n') {
      row.push(closed ? field : field.replace(/\r$/, '')); field = ''; closed = false;
      if (char === '\n') { rows.push(row); row = []; }
    } else if (char === '"') {
      if (field) throw new Error('CSV contains an unexpected quote. Use the downloaded template.');
      quoted = true;
    } else if (closed) {
      if (char !== '\r') throw new Error('CSV contains text after a closing quote.');
    } else field += char;
  }
  if (quoted) throw new Error('CSV has an unclosed quoted field.');
  if (field || row.length || closed) { row.push(closed ? field : field.replace(/\r$/, '')); rows.push(row); }
  return rows.filter(items => items.some(item => item.trim() !== ''));
}

const cell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;

export function recordsJsonToCsv(text: string, kind: CsvImportKind): string {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed) && (parsed?.version !== 1 || parsed?.entity !== kind)) throw new Error('This JSON template belongs to another feature. Download the matching template.');
  const records = Array.isArray(parsed) ? parsed : parsed.records;
  if (!Array.isArray(records) || !records.length || records.length > 1000) throw new Error('Include 1 to 1,000 records.');
  const allowed = csvImportTemplates[kind].csv.split('\n')[0].split(',');
  for (const row of records) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.entries(row).some(([key, value]) => !allowed.includes(key) || (value !== null && !['string', 'number', 'boolean'].includes(typeof value)))) throw new Error('JSON fields do not match the template. Keep the field names and use plain values.');
  }
  // Missing required fields remain blank and are rejected by the shared validator.
  return [allowed.map(cell).join(','), ...records.map(row => allowed.map(key => cell(row[key])).join(','))].join('\n');
}

export function recordsTemplate(kind: CsvImportKind, format: 'json' | 'csv') {
  const template = csvImportTemplates[kind];
  const headers = parseCsv(template.csv)[0];
  if (format === 'csv') return headers.join(',') + '\r\n';
  return JSON.stringify({ version: 1, entity: kind, columns: headers, records: [] }, null, 2);
}

export function emptyBackupCsvTemplate(columns: Record<string, string[]>) {
  return '\uFEFF' + ['dataset', '__tenh_escaped', '__tenh_nulls', ...new Set(Object.values(columns).flat())].map(cell).join(',') + '\r\n';
}

export function backupCsvTemplate(data: Record<string, Record<string, unknown>[]>) {
  const columns = [...new Set(Object.values(data).flatMap(rows => rows.flatMap(row => Object.keys(row))))];
  const output = [['dataset', '__tenh_escaped', '__tenh_nulls', ...columns].map(cell).join(',')];
  for (const [table, rows] of Object.entries(data)) {
    if (!rows.length) { output.push([table, '[]', '[]', ...columns.map(() => '')].map(cell).join(',')); continue; }
    for (const row of rows) {
      const escaped: string[] = [];
      const values = columns.map(key => {
        const value = row[key];
        const raw = value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
        if (/^\s*[=+@-]/.test(raw)) { escaped.push(key); return "'" + raw; }
        return raw;
      });
      output.push([table, JSON.stringify(escaped), JSON.stringify(columns.filter(key => row[key] === null)), ...values].map(cell).join(','));
    }
  }
  return '\uFEFF' + output.join('\r\n');
}

export function backupCsvRows(text: string, feature: string): Record<string, Record<string, string | null>[]> {
  const matrix = parseCsv(text.replace(/^\uFEFF/, ''));
  if (matrix.length < 2 || matrix.length > 20_001) throw new Error('Include 1 to 20,000 rows.');
  const headers = matrix[0].map(value => value.trim());
  if (headers.some(header => !header) || new Set(headers).size !== headers.length) throw new Error('CSV column names must be unique and non-empty.');
  if (feature === 'all' && !headers.includes('dataset')) throw new Error('Choose a feature, or use an All features template with a dataset column.');
  const output: Record<string, Record<string, string | null>[]> = {};
  for (const [index, cells] of matrix.slice(1).entries()) {
    if (cells.length !== headers.length) throw new Error(`Row ${index + 2}: the number of values does not match the columns.`);
    const source = Object.fromEntries(headers.map((key, column) => [key, cells[column]]));
    const table = source.dataset || feature;
    if (!allImportTables.includes(table)) throw new Error(`Row ${index + 2}: choose a valid feature.`);
    if (feature !== 'all' && table !== feature) continue;
    const escaped = source.__tenh_escaped ? JSON.parse(source.__tenh_escaped) : [];
    const nulls = source.__tenh_nulls ? JSON.parse(source.__tenh_nulls) : [];
    const reserved = ['dataset', '__tenh_escaped', '__tenh_nulls'];
    if ([escaped, nulls].some(keys => !Array.isArray(keys) || keys.some(key => typeof key !== 'string' || !headers.includes(key) || reserved.includes(key)))) throw new Error(`Row ${index + 2}: invalid template formatting. Download a fresh template.`);
    const row = Object.fromEntries(headers.filter(key => !reserved.includes(key)).map(key => {
      let value = source[key];
      if (escaped.includes(key)) {
        if (!value.startsWith("'")) throw new Error(`Row ${index + 2}: keep the template formatting column unchanged.`);
        value = value.slice(1);
      } else if (!('__tenh_escaped' in source) && /^'\s*[=+@-]/.test(value)) throw new Error('Use the Import CSV template to preserve phone numbers and spreadsheet-safe text.');
      return [key, value === '' && (!('__tenh_nulls' in source) || nulls.includes(key)) ? null : value];
    }));
    output[table] ??= [];
    if (Object.values(row).some(value => value !== null && value !== '')) output[table].push(row);
  }
  if (!Object.keys(output).length) throw new Error('This file does not contain the selected feature.');
  return output;
}
