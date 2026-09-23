import ExcelJS from 'exceljs';

export async function exportWorkbook(data: Record<string, Record<string, unknown>[]>): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TENH POS';
  const usedNames = new Set<string>();
  for (const [dataset, rows] of Object.entries(data)) {
    if (rows.length > 1_048_575) throw new Error(`${dataset} exceeds Excel's sheet limit. Choose JSON to export every record.`);
    const base = dataset.replace(/[\\/*?:\[\]]/g, ' ').replace(/^'+|'+$/g, '').slice(0, 31) || 'Dataset';
    let name = base;
    for (let suffix = 2; usedNames.has(name.toLowerCase()); suffix++) {
      name = `${base.slice(0, 31 - String(suffix).length - 1)}_${suffix}`;
    }
    usedNames.add(name.toLowerCase());
    const sheet = workbook.addWorksheet(name);
    const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
    if (!keys.length) {
      sheet.addRow(['No records in this dataset']);
      sheet.getColumn(1).width = 32;
      continue;
    }
    if (keys.length > 16_384) throw new Error(`${dataset} exceeds Excel's column limit. Choose JSON instead.`);
    sheet.addRow(keys);
    for (const row of rows) {
      sheet.addRow(keys.map(key => {
        const value = row[key];
        if (value === null || value === undefined) return null;
        if (typeof value === 'number' || typeof value === 'boolean') return value;
        const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
        if (text.length > 32_767) throw new Error(`${dataset}.${key} exceeds Excel's cell limit. Choose JSON to keep the full value.`);
        // Strings remain text, including leading '='; never create executable formulas.
        return text;
      }));
    }
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length + 1, column: keys.length } };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    sheet.columns.forEach((column, index) => { column.width = Math.min(42, Math.max(16, keys[index].length + 3)); });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64');
}
