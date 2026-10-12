import { getRootHostname } from '@/lib/tenancy/domain';

export type SearchScan = { kind: 'order' | 'product' | 'linear'; value: string };
export const scanFormats = ['QR_CODE', 'EAN_13', 'EAN_8', 'UPC_A', 'CODE_128', 'CODE_39'] as const;

export function classifySearchScan(raw: string, format: string): SearchScan | null {
  if (typeof raw !== 'string' || raw.length > 512 || /[\x00-\x1f\x7f]/.test(raw)) return null;
  if (format !== 'QR_CODE') return scanFormats.includes(format as typeof scanFormats[number]) && raw.length > 0 && raw.length <= 80 && raw === raw.trim() ? { kind: 'linear', value: raw } : null;
  const value = raw.trim();
  if (/^[1-9][0-9]{11}$/.test(value) || /^TENH:ORDER:1:[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) return { kind: 'order', value };
  try {
    const url = new URL(value), root = getRootHostname();
    const trusted = (url.protocol === 'https:' || url.protocol === 'http:') && (url.hostname === root || url.hostname.endsWith(`.${root}`));
    const path = url.protocol === 'tenhpos:' && url.hostname === 'o' ? `/o${url.pathname}` : trusted ? url.pathname : '';
    if (!url.username && !url.password && !url.search && !url.hash && /^\/o\/[1-9][0-9]{11}\/?$/.test(path)) return { kind: 'order', value };
  } catch { /* Unknown QR text is never a navigation target. */ }
  return null;
}

export function cameraErrorMessage(failure: unknown): string {
  const name = failure instanceof Error ? failure.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access was denied. Allow camera access in your browser and try again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera is available on this device.';
  if (name === 'NotReadableError' || name === 'AbortError') return 'Camera is unavailable or in use. Close other camera apps and try again.';
  return 'Camera could not start. Please try again.';
}
