import test from "node:test";
import assert from "node:assert/strict";
import { trackingToken, recentOrders, rememberOrder } from "../lib/storefront/order-tracking.ts";
const token = "052d8070-3333-4444-8888-123456789abc";
test("tracking accepts tokens and links without navigating to an external host", () => {
  assert.equal(trackingToken(token), token);
  assert.equal(trackingToken(`https://shop.example/order/${token}`), token);
  assert.equal(trackingToken(`javascript:alert(1)`), null);
  assert.equal(trackingToken("WEB-123"), null);
  assert.equal(trackingToken(`/order/${token}/other`), null);
});
test("recent tracking is isolated per store, deduplicated, and tolerates unavailable storage", () => {
  const data = new Map();
  globalThis.localStorage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  rememberOrder("one", token, "WEB-1"); rememberOrder("one", token, "WEB-1");
  assert.equal(recentOrders("one").length, 1); assert.equal(recentOrders("two").length, 0);
  data.set("tenh-orders:one", "broken"); assert.deepEqual(recentOrders("one"), []);
  delete globalThis.localStorage; assert.doesNotThrow(() => rememberOrder("one", token, "WEB-1"));
});
