'use client';

import { useEffect } from 'react';

export default function PhotoCache() {
  useEffect(() => {
    if (!window.isSecureContext || !('serviceWorker' in navigator)) return;
    const storageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!storageUrl) return;
    const register = () => { void (async () => {
      const existing = await navigator.serviceWorker.getRegistration('/');
      const worker = existing?.active ?? existing?.waiting ?? existing?.installing;
      if (worker && new URL(worker.scriptURL).pathname !== '/photo-cache-sw.js') return;
      const query = new URLSearchParams({ storageOrigin: new URL(storageUrl).origin });
      await navigator.serviceWorker.register(`/photo-cache-sw.js?${query}`, { scope: '/', updateViaCache: 'none' });
    })().catch(() => { /* Browser HTTP caching remains available when workers are blocked. */ }); };
    // Warm the optional cache after initial rendering rather than compete with it.
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(register, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(register, 1500);
    return () => clearTimeout(id);
  }, []);
  return null;
}
