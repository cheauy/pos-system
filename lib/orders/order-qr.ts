import { create } from 'qrcode';

const prefix = 'TENH:ORDER:1:';
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function orderQrPayload(id: string) {
  if (!uuid.test(id)) throw new Error('Invalid order ID.');
  return prefix + id.toLowerCase();
}
export function parseOrderQr(value: string): string | null {
  if (!value.startsWith(prefix)) return null;
  const id = value.slice(prefix.length);
  return uuid.test(id) ? id.toLowerCase() : null;
}
// Four-module quiet zone; vector output stays sharp on screen and paper.
export function orderQrSvg(id: string) {
  const { modules } = create(orderQrPayload(id), { errorCorrectionLevel: 'M' });
  const size = modules.size + 8;
  let path = '';
  for (let y = 0; y < modules.size; y++) for (let x = 0; x < modules.size; x++) {
    if (modules.get(y, x)) path += `M${x + 4} ${y + 4}h1v1h-1z`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
