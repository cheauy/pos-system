import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.cjs';
const { createActivityStore, shouldTrackRequest, trackedFetch } = loadTs('lib/ui/activity.ts');
const origin = 'https://app.example.test';
const serviceOrigin = 'https://data.example.test';
const tick = () => new Promise(resolve => setTimeout(resolve, 10));

test('overlapping activity only finishes after every operation settles; cleanup is idempotent', () => {
  const store = createActivityStore(); const values = [];
  const unsubscribe = store.subscribe(() => values.push(store.getSnapshot()));
  const first = store.begin(), second = store.begin();
  first(); first(); assert.equal(store.getSnapshot(), true);
  second(); assert.equal(store.getSnapshot(), false);
  unsubscribe(); store.begin()();
  assert.deepEqual(values, [true, true, true, false]);
});

test('tracks navigation, actions, filters, API and Supabase; skips assets, probes and prefetch', () => {
  for (const url of ['/dashboard?range=yesterday', '/super-admin/health', '/api/orders', `${serviceOrigin}/rest/v1/products`, `${serviceOrigin}/storage/v1/object/product-images`]) {
    assert.equal(shouldTrackRequest(url, undefined, origin, serviceOrigin), true, url);
  }
  for (const url of ['/api/connection', '/_next/static/chunk.js', '/icon.svg', 'https://external.test/api']) {
    assert.equal(shouldTrackRequest(url, undefined, origin, serviceOrigin), false, url);
  }
  for (const headers of [{ 'next-router-prefetch': '1' }, { 'next-router-segment-prefetch': '/page' }, { purpose: 'prefetch' }]) {
    assert.equal(shouldTrackRequest('/dashboard', { headers }, origin, serviceOrigin), false);
  }
  const request = new Request(`${origin}/dashboard`, { headers: { 'Next-Action': 'save' }, method: 'POST' });
  assert.equal(shouldTrackRequest(request, undefined, origin, serviceOrigin), true);
});

test('streamed navigation stays pending after headers without changing the response', async () => {
  const store = createActivityStore(); let controller;
  const response = new Response(new ReadableStream({ start(value) { controller = value; } }), { headers: { 'content-type': 'text/x-component' } });
  const fetch = trackedFetch(async () => response, { origin, begin: store.begin, onNetworkFailure: () => assert.fail('unexpected failure') });
  const actual = await fetch('/dashboard');
  assert.equal(actual, response);
  assert.equal(store.getSnapshot(), true);
  controller.enqueue(new TextEncoder().encode('complete')); controller.close();
  assert.equal(await actual.text(), 'complete');
  await tick(); assert.equal(store.getSnapshot(), false);
});

test('network failures release activity, retain the original error, and never retry writes', async () => {
  const store = createActivityStore(); let calls = 0, failures = 0;
  const error = new TypeError('Network unavailable');
  const fetch = trackedFetch(async () => { calls++; throw error; }, { origin, begin: store.begin, onNetworkFailure: () => failures++ });
  await assert.rejects(fetch('/api/checkout', { method: 'POST', body: 'order' }), value => value === error);
  assert.equal(calls, 1); assert.equal(failures, 1); assert.equal(store.getSnapshot(), false);
});

test('cancelled navigation clears loading without falsely reporting offline', async () => {
  const store = createActivityStore();
  const fetch = trackedFetch(async () => { throw new DOMException('Cancelled', 'AbortError'); }, { origin, begin: store.begin, onNetworkFailure: () => assert.fail('abort is not an outage') });
  await assert.rejects(fetch('/dashboard'), { name: 'AbortError' });
  assert.equal(store.getSnapshot(), false);
});

test('HTTP errors and downloads keep their response and release loading', async () => {
  for (const response of [new Response('Error', { status: 500 }), new Response('file', { headers: { 'content-type': 'application/octet-stream' } })]) {
    const store = createActivityStore();
    const fetch = trackedFetch(async () => response, { origin, begin: store.begin, onNetworkFailure: () => assert.fail('HTTP is reachable') });
    assert.equal(await fetch('/api/export'), response);
    assert.equal(store.getSnapshot(), false);
  }
});

test('connection check is a non-cached read with no business dependency', () => {
  const { GET } = loadTs('app/api/connection/route.ts');
  const response = GET();
  assert.equal(response.status, 204);
  assert.match(response.headers.get('cache-control'), /no-store/);
});
