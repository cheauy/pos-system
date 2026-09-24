/* Public, uniquely named photos only. Never cache pages, API data or private files. */
const PHOTO_CACHE_PREFIX = 'tenh-public-photos-';
const storageOrigin = new URL(self.location.href).searchParams.get('storageOrigin');
const PHOTO_CACHE = `${PHOTO_CACHE_PREFIX}v1-${storageOrigin}`;
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 60 * 1024 * 1024;
const MAX_ENTRIES = 120;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const immutablePhoto = new RegExp(`/(${UUID})(?:-[0-9a-f]{64})?\\.(?:jpe?g|png|webp)$`, 'i');
let writes = Promise.resolve();

function isPublicPhoto(request) {
  const url = new URL(request.url);
  return request.method === 'GET' && request.destination === 'image'
    && !['no-store', 'reload', 'no-cache'].includes(request.cache)
    && url.origin === storageOrigin && !url.search
    && /^\/storage\/v1\/object\/public\/(product-images|storefront-media|tenh-receipt-logos)\//.test(url.pathname)
    && immutablePhoto.test(url.pathname);
}

async function trim(cache) {
  const entries = [];
  for (const key of await cache.keys()) {
    const response = await cache.match(key);
    const saved = Number(response?.headers.get('x-tenh-photo-saved'));
    const size = Number(response?.headers.get('x-tenh-photo-bytes'));
    if (!saved || !size || Date.now() - saved >= MAX_AGE) await cache.delete(key);
    else entries.push({ key, size });
  }
  let bytes = entries.reduce((sum, entry) => sum + entry.size, 0);
  while (entries.length > MAX_ENTRIES || bytes > MAX_BYTES) {
    const oldest = entries.shift();
    bytes -= oldest.size;
    await cache.delete(oldest.key);
  }
}

async function savePhoto(request, response) {
  if (response.status !== 200 || response.redirected || response.type === 'opaque'
    || !/^image\/(jpeg|png|webp)(?:;|$)/i.test(response.headers.get('content-type') || '')
    || /no-store|private|no-cache/i.test(response.headers.get('cache-control') || '')) return;
  const blob = await response.blob();
  if (!blob.size || blob.size > 5 * 1024 * 1024) return;
  const headers = new Headers(response.headers);
  headers.set('x-tenh-photo-saved', String(Date.now()));
  headers.set('x-tenh-photo-bytes', String(blob.size));
  const cache = await caches.open(PHOTO_CACHE);
  await cache.put(request.url, new Response(blob, { headers }));
  await trim(cache);
}

async function loadPhoto(request) {
  try {
    const cache = await caches.open(PHOTO_CACHE);
    const cached = await cache.match(request.url);
    if (cached) {
      const saved = Number(cached.headers.get('x-tenh-photo-saved'));
      if (saved && Date.now() - saved < MAX_AGE) return cached;
      await cache.delete(request.url);
    }
  } catch { /* Storage may be disabled or full. Normal image loading still works. */ }
  try {
    // A readable public response allows MIME/size checks; never persist opaque data.
    const response = await fetch(request.url, { mode: 'cors', credentials: 'omit', redirect: 'error' });
    const copy = response.clone();
    writes = writes.then(() => savePhoto(request, copy)).catch(() => {});
    return response;
  } catch { return fetch(request); }
}

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) {
    if (name.startsWith(PHOTO_CACHE_PREFIX) && name !== PHOTO_CACHE) await caches.delete(name);
  }
  try { await trim(await caches.open(PHOTO_CACHE)); } catch { /* Optional cache. */ }
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  if (!isPublicPhoto(event.request)) return;
  const response = loadPhoto(event.request);
  event.respondWith(response);
  event.waitUntil(response.then(() => writes));
});
