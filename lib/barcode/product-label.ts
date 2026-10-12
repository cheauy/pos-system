import { code39BarsExact, validateCode39 } from './code39';
import { productBarcodeGeometry, validateBarcode } from './code128';
export function validateProductLabel(value: string, preservation: boolean) {
  return preservation ? validateBarcode(value) : validateCode39(value);
}
export function productLabelGeometry(value: string, size: string, hasImage = false, hasCustomText = false, preservation = false) {
  if (preservation) return { ...productBarcodeGeometry(value, size, hasImage, hasCustomText), format: 'CODE_128' };
  const symbol = code39BarsExact(value), quiet = 20;
  const [width, height] = size.split('x').map(Number);
  const scale = Math.min(width / 50, height / 30) * (hasImage ? .8 : hasCustomText ? .9 : 1);
  // Established fixed-label sizing stays available while the new contract is off.
  return { ...symbol, bars: symbol.bars.map(bar => ({ ...bar, x: bar.x + quiet })), width: symbol.width + 2 * quiet, widthMm: width - 2 * 25.4 / 96 - 3 * scale - 4, heightMm: 8, format: 'CODE_39' };
}
