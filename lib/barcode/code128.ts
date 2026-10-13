// Code 128 symbol widths (ISO/IEC 15417), including start/check/stop symbols.
// Independent decoder regression tests use ZXing; no scanner internals are bundled.
const patterns = '212222,222122,222221,121223,121322,131222,122213,122312,132212,221213,221312,231212,112232,122132,122231,113222,123122,123221,223211,221132,221231,213212,223112,312131,311222,321122,321221,312212,322112,322211,212123,212321,232121,111323,131123,131321,112313,132113,132311,211313,231113,231311,112133,112331,132131,113123,113321,133121,313121,211331,231131,213113,213311,213131,311123,311321,331121,312113,312311,332111,314111,221411,431111,111224,111422,121124,121421,141122,141221,112214,112412,122114,122411,142112,142211,241211,221114,413111,241112,134111,111242,121142,121241,114212,124112,124211,411212,421112,421211,212141,214121,412121,111143,111341,131141,114113,114311,411113,411311,113141,114131,311141,411131,211412,211214,211232,2331112'.split(',');

export const BARCODE_DPI = 203;
export const BARCODE_MODULE_DOTS = 2;
export const BARCODE_MODULE_MM = BARCODE_MODULE_DOTS * 25.4 / BARCODE_DPI;
export const BARCODE_QUIET_MODULES = 10;

export function validateBarcode(value: unknown): string | null {
  if (typeof value !== 'string') return 'Barcode identifiers must be text strings to preserve leading zeros.';
  if (!value) return 'A saved barcode or legacy SKU is required to print a label.';
  if (value !== value.trim() || !value.trim()) return 'Barcodes cannot start or end with whitespace because scanner lookup trims scans. The saved identifier is unchanged.';
  if (value.length > 80 || /[^\x20-\x7e]/.test(value)) return 'Code 128 supports up to 80 printable ASCII characters. The saved identifier will not be changed.';
  return null;
}

/** New/replaced product identifiers are numeric; unchanged legacy text is separate. */
export function validateNewProductBarcode(value: unknown): string | null {
  const issue = validateBarcode(value);
  if (issue) return issue;
  return /^[0-9]{6,20}$/.test(value as string) ? null : 'New or replaced product barcodes must be numeric strings of 6 to 20 digits. Leading zeros are preserved; legacy identifiers are unchanged.';
}

/** Encode exact text. Numeric strings use pairs (Code C); never convert the payload to a number. */
export function code128Bars(value: string) {
  const error = validateBarcode(value);
  if (error) throw new Error(error);
  const numeric = /^[0-9]+$/.test(value);
  const codes: number[] = [numeric && value.length % 2 === 0 ? 105 : 104];
  if (numeric) {
    let offset = 0;
    if (value.length % 2) { codes.push(value.charCodeAt(0) - 32); offset = 1; if (value.length > 1) codes.push(99); }
    for (; offset < value.length; offset += 2) codes.push(Number(value.slice(offset, offset + 2)));
  } else {
    for (const character of value) codes.push(character.charCodeAt(0) - 32);
  }
  codes.push(codes.reduce((sum, code, index) => sum + code * (index || 1), 0) % 103, 106);
  const bars: { x: number; width: number }[] = [];
  let x = BARCODE_QUIET_MODULES;
  for (const code of codes) for (const [index, digit] of [...patterns[code]].entries()) {
    const width = Number(digit);
    if (index % 2 === 0) bars.push({ x, width });
    x += width;
  }
  return { text: value, bars, width: x + BARCODE_QUIET_MODULES };
}

/** Whole printer dots at 203 dpi, with an embedded ten-module white quiet zone on each side. */
export function barcodeGeometry(value: string, availableMm: number) {
  const code = code128Bars(value);
  const widthMm = code.width * BARCODE_MODULE_MM;
  if (!Number.isFinite(availableMm) || availableMm < widthMm) throw new Error(`Barcode needs ${widthMm.toFixed(1)} mm of printable width at 203 dpi. Choose a wider label; the identifier will not be shortened.`);
  return { ...code, widthMm, heightMm: 8 };
}

export function productBarcodeGeometry(value: string, size: string, hasImage = false, hasCustomText = false) {
  const [width, height] = size.split('x').map(Number);
  const scale = Math.min(width / 50, height / 30) * (hasImage ? .8 : hasCustomText ? .9 : 1);
  // Both 1 px borders, label padding and the barcode container's 2 mm side padding.
  return barcodeGeometry(value, width - 2 * 25.4 / 96 - 3 * scale - 4);
}
