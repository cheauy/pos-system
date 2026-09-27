import { AsyncLocalStorage } from 'node:async_hooks';

// Set only by the authenticated mobile route, never from browser cookies.
export const mobileRequest = new AsyncLocalStorage<{
  token: string;
  businessId?: string;
  branchId?: string;
}>();

export class MobileSelectionError extends Error {}

export function mobileSelection(value: string | null) {
  if (!value) return undefined;
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) {
    throw new MobileSelectionError('Invalid workspace selection.');
  }
  return value;
}
