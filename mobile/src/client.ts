import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import { secureStorage } from './secure-storage';

export const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
export const configured = Boolean(apiUrl && url && key);
export const deviceStorage = secureStorage({
  ...SecureStore,
  setItemAsync: (name, value) => SecureStore.setItemAsync(name, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
});

// Native keychain storage only; never bundle a Supabase service-role key.
export const auth = configured ? createClient(url, key, {
  auth: {
    storage: deviceStorage,
    autoRefreshToken: true, persistSession: true, detectSessionInUrl: false,
  },
}) : null;
AppState.addEventListener('change', state => {
  if (state === 'active') auth?.auth.startAutoRefresh();
  else auth?.auth.stopAutoRefresh();
});

export class ApiError extends Error {
  constructor(message: string, public status: number, public uncertain?: boolean) { super(message); }
}
export type Scope = { businessId?: string; branchId?: string; userId?: string };
export async function api<T>(path: string, scope: Scope = {}, body?: unknown, signal?: AbortSignal): Promise<T> {
  if (!auth) throw new Error('Mobile connection is not configured.');
  const { data: { session }, error } = await auth.auth.getSession();
  if (error || !session) throw new ApiError('Sign in again to continue.', 401);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 25000);
  const multipart = typeof FormData !== 'undefined' && body instanceof FormData;
  try {
    const result = await fetch(`${apiUrl}/api/mobile/${path}`, {
      method: body === undefined ? 'GET' : 'POST', signal: controller.signal, redirect: 'error',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(body === undefined || multipart ? {} : { 'Content-Type': 'application/json' }),
        ...(scope.businessId ? { 'X-Business-Id': scope.businessId } : {}),
        ...(scope.branchId ? { 'X-Branch-Id': scope.branchId } : {}),
      },
      ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }),
    });
    if (!result.headers.get('content-type')?.includes('application/json')) {
      throw new ApiError('Mobile API is unavailable. Update the server or check its address.', result.status);
    }
    const data = await result.json();
    if (!result.ok || data.success === false) throw new ApiError(data.error || data.message || 'Please try again.', result.status, data.uncertain);
    return data as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Connection timed out. Check your connection and retry.');
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

export type Workspace = {
  userId: string;
  business: { id: string; name: string; role: string; subscriptionStatus: string; expiresAt: string | null };
  branchId: string; branches: { id: string; name: string }[]; permissions: string[];
};
export type Order = {
  id: string; orderNumber: string; customerName: string; customerPhone: string | null;
  customerAddress?: string | null; total: number; status: string; onlineStatus: string | null;
  paymentState: string; source: string; createdAt: string; updatedAt: string | null;
  paymentMethod?: string;
  items?: { id: string; name: string; variant: string | null; imageUrl: string | null; quantity: number; subtotal: number }[];
};
export const money = (value: number, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value));
