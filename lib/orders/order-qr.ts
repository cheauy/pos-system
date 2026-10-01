import { create } from 'qrcode';
import { getAppUrl, getRootHostname } from '@/lib/tenancy/domain';

const legacyPrefix = 'TENH:ORDER:1:';
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const orderCode = /^[1-9][0-9]{11}$/;

export type ScannedOrder = { kind: 'code'; code: string } | { kind: 'id'; id: string };

export function isOrderCode(value: unknown): value is string {
  return typeof value === 'string' && orderCode.test(value);
}

/** Opens the native app via Universal/App Links, else the web /o/ route. */
export function orderLink(code: string) {
  if (!isOrderCode(code)) throw new Error('Invalid order code.');
  return getAppUrl(`/o/${code}`);
}

/**
 * Accepts the order link (any TENH host or the tenhpos:// scheme), a bare
 * 12-digit code from the barcode, and legacy TENH:ORDER:1:<uuid> labels.
 */
export function parseOrderQr(raw: string): ScannedOrder | null {
  const value: string = typeof raw === 'string' ? raw.trim() : '';
  if (orderCode.test(value)) return { kind: 'code', code: value };
  if (value.startsWith(legacyPrefix)) {
    const id = value.slice(legacyPrefix.length);
    return uuid.test(id) ? { kind: 'id', id: id.toLowerCase() } : null;
  }
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  const root = getRootHostname();
  const trustedHost = url.protocol === 'tenhpos:' || ((url.protocol === 'https:' || url.protocol === 'http:')
    && (url.hostname === root || url.hostname.endsWith(`.${root}`)));
  if (!trustedHost) return null;
  // tenhpos://o/<code> parses "o" as the host; https links have it in the path.
  const segments = [url.hostname, ...url.pathname.split('/')].filter(Boolean);
  const index = segments.lastIndexOf('o');
  const code = index >= 0 ? segments[index + 1] : undefined;
  return isOrderCode(code) ? { kind: 'code', code } : null;
}

// Four-module quiet zone; vector output stays sharp on screen and paper.
export function orderQrSvg(code: string) {
  const { modules } = create(orderLink(code), { errorCorrectionLevel: 'M' });
  const size = modules.size + 8;
  let path = '';
  for (let y = 0; y < modules.size; y++) for (let x = 0; x < modules.size; x++) {
    if (modules.get(y, x)) path += `M${x + 4} ${y + 4}h1v1h-1z`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
