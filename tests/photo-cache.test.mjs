import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const origin = 'https://project.supabase.co';
const id = '11111111-1111-4111-8111-111111111111';
const url = `${origin}/storage/v1/object/public/product-images/business/user/${id}.png`;
const photo = (overrides = {}) => ({ url, method: 'GET', destination: 'image', cache: 'default', ...overrides });
function harness({ denied = false, network } = {}) {
  const stores = new Map(), events = {}, calls = [];
  let now = 1000000000;
  const cacheStorage = {
    async open(name) {
      if (denied) throw new Error('Storage blocked');
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async keys() { return [...entries.keys()].map(url => ({ url })); },
        async match(key) { return entries.get(typeof key === 'string' ? key : key.url)?.clone(); },
        async put(key, response) { entries.set(typeof key === 'string' ? key : key.url, response.clone()); },
        async delete(key) { return entries.delete(typeof key === 'string' ? key : key.url); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  const context = vm.createContext({
    URL, Response, Headers, Promise, Date: { now: () => now }, caches: cacheStorage,
    fetch: async (...args) => { calls.push(args); return network ? network(...args) : new Response('photo', { headers: { 'content-type': 'image/png', 'cache-control': 'max-age=3600' } }); },
    self: { location: { href: `https://app.example/photo-cache-sw.js?storageOrigin=${encodeURIComponent(origin)}` }, addEventListener: (name, handler) => { events[name] = handler; }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
  });
  vm.runInContext(readFileSync('public/photo-cache-sw.js', 'utf8'), context);
  const api = vm.runInContext('({isPublicPhoto,trim,PHOTO_CACHE,MAX_AGE,MAX_BYTES,MAX_ENTRIES})', context);
  return { ...api, calls, stores, cacheStorage, events, advance: ms => { now += ms; }, async request(request = photo()) {
    let result; const tasks = [];
    events.fetch({ request, respondWith: value => { result = value; }, waitUntil: task => tasks.push(task) });
    const response = await result; await Promise.all(tasks); return response;
  } };
}

test('only immutable public images from this storage project are eligible', () => {
  const h = harness();
  for (const bucket of ['product-images', 'storefront-media', 'tenh-receipt-logos']) {
    assert.equal(h.isPublicPhoto(photo({ url: url.replace('product-images', bucket) })), true);
  }
  assert.equal(h.isPublicPhoto(photo({ url: url.replace('.png', `-${'a'.repeat(64)}.webp`) })), true);
  for (const request of [
    photo({ url: url + '?token=secret' }), photo({ url: url.replace('/public/', '/sign/') }),
    photo({ url: url.replace('product-images', 'tenh-expense-receipts') }),
    photo({ url: url.replace(origin, 'https://other.supabase.co') }),
    photo({ url: 'https://app.example/api/online-orders/order/proof' }),
    photo({ url: url.replace(`${id}.png`, 'logo.png') }), photo({ url: url.replace('.png', '.svg') }),
    photo({ method: 'POST' }), photo({ destination: 'document' }), photo({ cache: 'no-store' }),
    photo({ cache: 'reload' }), photo({ url: 'blob:https://app.example/preview' }),
  ]) assert.equal(h.isPublicPhoto(request), false, request.url);
});

test('repeat visits reuse photos; replacement URLs and expired entries fetch fresh data', async () => {
  const h = harness();
  assert.equal(await (await h.request()).text(), 'photo');
  assert.equal(await (await h.request()).text(), 'photo');
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0][1].credentials, 'omit');
  await h.request(photo({ url: url.replace(id, '22222222-2222-4222-8222-222222222222') }));
  assert.equal(h.calls.length, 2);
  h.advance(h.MAX_AGE + 1); await h.request();
  assert.equal(h.calls.length, 3);
});

test('private, non-image, oversized and failed responses are never saved', async () => {
  for (const options of [
    { status: 206, headers: { 'content-type': 'image/png' } },
    { status: 404, headers: { 'content-type': 'image/png' } },
    { headers: { 'content-type': 'text/html' } },
    { headers: { 'content-type': 'image/png', 'cache-control': 'private, max-age=3600' } },
    { headers: { 'content-type': 'image/png', 'cache-control': 'no-store' } },
    { headers: { 'content-type': 'image/png', 'cache-control': 'no-cache' } },
  ]) {
    const h = harness({ network: async () => new Response('body', options) });
    await h.request(); await h.request(); assert.equal(h.calls.length, 2);
  }
  const h = harness({ network: async () => new Response(new Uint8Array(5 * 1024 * 1024 + 1), { headers: { 'content-type': 'image/png' } }) });
  await h.request(); assert.equal(h.stores.get(h.PHOTO_CACHE).size, 0);
});

test('blocked storage or unavailable CORS does not break normal image loading', async () => {
  const blocked = harness({ denied: true });
  assert.equal(await (await blocked.request()).text(), 'photo');
  const cors = harness({ network: async (request, options) => {
    if (options?.mode === 'cors') throw new Error('CORS unavailable');
    return new Response('normal photo');
  } });
  assert.equal(await (await cors.request()).text(), 'normal photo');
  assert.equal(cors.calls.length, 2);
});

test('cache has age, entry and byte limits and cleans only its own previous versions', async () => {
  const h = harness(), cache = await h.cacheStorage.open(h.PHOTO_CACHE);
  async function seed(count, size) {
    h.stores.get(h.PHOTO_CACHE).clear();
    for (let i = 0; i < count; i++) await cache.put(`https://image.example/${i}`, new Response('x', { headers: { 'x-tenh-photo-saved': '1000000000', 'x-tenh-photo-bytes': String(size) } }));
    await h.trim(cache);
  }
  await seed(125, 1); assert.equal((await cache.keys()).length, h.MAX_ENTRIES);
  await seed(65, 1024 * 1024); assert.equal((await cache.keys()).length, 60);
  h.advance(h.MAX_AGE + 1); await h.trim(cache); assert.equal((await cache.keys()).length, 0);
  await h.cacheStorage.open('tenh-public-photos-v0'); await h.cacheStorage.open('unrelated-cache');
  let activation; h.events.activate({ waitUntil: value => { activation = value; } }); await activation;
  assert.equal(h.stores.has('tenh-public-photos-v0'), false); assert.equal(h.stores.has('unrelated-cache'), true);
});
