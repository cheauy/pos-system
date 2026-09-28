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
  constructor(message: string, public status: number, public uncertain?: boolean, public code?: string) { super(message); }
}
export type Scope = { businessId?: string; branchId?: string; userId?: string };
export async function api<T>(path: string, scope: Scope = {}, body?: unknown, signal?: AbortSignal, onUploadProgress?: (fraction: number | null) => void): Promise<T> {
  try { return await requestApi<T>(path, scope, body, signal, onUploadProgress); }
  catch (error) {
    // Only reads may be replayed. A cancelled save may already have committed.
    if (body === undefined && !signal?.aborted && error instanceof ApiError && ['connection_interrupted', 'request_timeout'].includes(error.code ?? '')) {
      return requestApi<T>(path, scope, body, signal, onUploadProgress);
    }
    throw error;
  }
}
async function requestApi<T>(path: string, scope: Scope, body?: unknown, signal?: AbortSignal, onUploadProgress?: (fraction: number | null) => void): Promise<T> {
  if (!auth) throw new Error('Mobile connection is not configured.');
  const { data: { session }, error } = await auth.auth.getSession();
  if (error || !session) throw new ApiError('Sign in again to continue.', 401);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  if (signal?.aborted) controller.abort();
  const multipart = typeof FormData !== 'undefined' && body instanceof FormData;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; abort(); }, multipart && onUploadProgress ? 120000 : 25000);
  try {
    const options = {
      method: body === undefined ? 'GET' : 'POST', signal: controller.signal, redirect: 'error',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(body === undefined || multipart ? {} : { 'Content-Type': 'application/json' }),
        ...(scope.businessId ? { 'X-Business-Id': scope.businessId } : {}),
        ...(scope.branchId ? { 'X-Branch-Id': scope.branchId } : {}),
      },
      ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }),
    } as RequestInit;
    const url = `${apiUrl}/api/mobile/${path}`;
    const result = multipart && onUploadProgress ? await new Promise<Response>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const cancel = () => xhr.abort();
      const clean = () => controller.signal.removeEventListener('abort', cancel);
      xhr.open('POST', url);
      for (const [name, value] of Object.entries(options.headers as Record<string, string>)) xhr.setRequestHeader(name, value);
      xhr.upload.onprogress = event => onUploadProgress(event.lengthComputable && event.total > 0 ? event.loaded / event.total : null);
      xhr.upload.onload = () => onUploadProgress(1);
      xhr.onload = () => {
        clean();
        try {
          if (!xhr.status || xhr.responseURL && xhr.responseURL !== url) throw new Error('Upload could not be confirmed. Check the saved records before retrying.');
          resolve(new Response(xhr.responseText, { status: xhr.status, headers: { 'content-type': xhr.getResponseHeader('content-type') || '' } }));
        } catch (error) { reject(error); }
      };
      xhr.onerror = () => { clean(); reject(new Error('Upload could not be confirmed. Check your connection and saved records.')); };
      xhr.onabort = () => { clean(); const error = new Error('Upload interrupted.'); error.name = 'AbortError'; reject(error); };
      controller.signal.addEventListener('abort', cancel, { once: true });
      if (controller.signal.aborted) { clean(); const error = new Error('Upload interrupted.'); error.name = 'AbortError'; reject(error); return; }
      try { xhr.send(body as FormData); } catch (error) { clean(); reject(error); }
    }) : await fetch(url, options);
    if (!result.headers.get('content-type')?.includes('application/json')) {
      throw new ApiError('Mobile API is unavailable. Update the server or check its address.', result.status);
    }
    const data = await result.json();
    if (!result.ok || data.success === false) throw new ApiError(data.error || data.message || 'Please try again.', result.status, data.uncertain, data.code);
    return data as T;
  } catch (error) {
    if (signal?.aborted) { const cancelled = new Error('Request cancelled.'); cancelled.name = 'AbortError'; throw cancelled; }
    if (timedOut) throw new ApiError(body === undefined ? 'The server took too long to respond. Check your connection and try again.' : 'The save could not be confirmed. Check its status before trying again.', 408, body !== undefined, 'request_timeout');
    if (!(error instanceof ApiError) && error instanceof Error && (error.name === 'AbortError' || /fetch failed|failed to fetch|network request failed|networkerror|FetchRequestCanceledException|request has been cancel/i.test(error.message))) {
      throw new ApiError(body === undefined ? 'Connection interrupted. Check your internet connection and try again.' : 'Connection interrupted. Check whether the change was saved before trying again.', 0, body !== undefined, 'connection_interrupted');
    }
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
  paymentMethod?: string; note?: string | null; guestName?: string | null; guestPhone?: string | null; guestAddress?: string | null;
  items?: { id: string; name: string; variant: string | null; imageUrl: string | null; quantity: number; subtotal: number }[];
};
export const money = (value: number, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value));
