// A shared counter keeps overlapping navigation, actions and requests from
// hiding the indicator while another operation is still running.
export function createActivityStore() {
  const active = new Set<symbol>();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(listener => listener());
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => active.size > 0,
    begin() {
      const token = Symbol(); active.add(token); emit();
      return () => { if (active.delete(token)) emit(); };
    },
  };
}

export const activity = createActivityStore();

export function shouldTrackRequest(input: RequestInfo | URL, init: RequestInit | undefined, origin: string, serviceOrigin?: string) {
  try {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input), origin);
    const headers = new Headers(init?.headers ?? request?.headers);
    if (headers.has('next-router-prefetch') || headers.has('next-router-segment-prefetch') || headers.get('purpose') === 'prefetch') return false;
    if (url.origin === serviceOrigin) return /^\/(rest|storage|auth)\/v1\//.test(url.pathname);
    if (url.origin !== origin || url.pathname === '/api/connection') return false;
    if (url.pathname.startsWith('/_next/') || /\.(?:svg|png|jpe?g|webp|avif|gif|ico|woff2?|css|js|map)$/i.test(url.pathname)) return false;
    return true;
  } catch { return false; }
}

export function trackedFetch(original: typeof fetch, options: {
  origin: string; serviceOrigin?: string; begin: () => () => void; onNetworkFailure: () => void;
}): typeof fetch {
  return async (input, init) => {
    if (!shouldTrackRequest(input, init, options.origin, options.serviceOrigin)) return original(input, init);
    const finish = options.begin();
    try {
      const response = await original(input, init);
      const type = response.headers.get('content-type') ?? '';
      // Observe a clone, leaving the original response, stream and errors intact.
      // RSC streams can continue after headers arrive; keep showing activity until
      // their content is received. Never drain long-lived event streams or files.
      if (response.body && /(?:application\/json|text\/x-component)/i.test(type)) {
        try {
          const reader = response.clone().body!.getReader();
          void (async () => {
            try { while (!(await reader.read()).done) { /* Discard observed chunks. */ } }
            catch { /* The caller handles its own response errors. */ }
            finally { reader.releaseLock(); finish(); }
          })();
        } catch { finish(); }
      } else finish();
      return response;
    } catch (error) {
      finish();
      const aborted = init?.signal?.aborted || (input instanceof Request && input.signal.aborted) || (error instanceof Error && error.name === 'AbortError');
      if (!aborted) options.onNetworkFailure();
      throw error;
    }
  };
}
