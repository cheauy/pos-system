import test from "node:test";
import assert from "node:assert/strict";
import { sendOrderEmail } from "../lib/storefront/order-email.ts";
import { validateCheckoutEmail } from "../lib/storefront/checkout-validation.ts";
const order = { orderNumber: "WEB-555E962F02", publicToken: "052d8070-3333-4444-8888-123456789abc", total: 30, currency: "USD" };
test("checkout email is mandatory and rejects malformed addresses", () => {
  for (const value of [undefined, "", "bad", "a@b", "a b@example.com", "a".repeat(255) + "@example.com"]) assert.ok(validateCheckoutEmail(value));
  assert.equal(validateCheckoutEmail(" customer@example.com "), null);
});
test("email is unavailable without credentials and retries safely with the same idempotency key", async () => {
  const originalFetch = globalThis.fetch, key = process.env.RESEND_API_KEY, sender = process.env.ORDER_EMAIL_FROM;
  try {
    delete process.env.RESEND_API_KEY; delete process.env.ORDER_EMAIL_FROM;
    globalThis.fetch = () => { throw new Error("must not call provider"); };
    assert.equal(await sendOrderEmail("customer@example.com", order, "https://shop.example"), "unavailable");
    process.env.RESEND_API_KEY = "test"; process.env.ORDER_EMAIL_FROM = "orders@example.com";
    const calls = []; globalThis.fetch = async (url, options) => { calls.push({url, options}); return new Response("{}", {status: calls.length === 1 ? 503 : 200}); };
    assert.equal(await sendOrderEmail("customer@example.com", order, "https://shop.example"), "sent");
    assert.equal(calls.length, 2); assert.equal(calls[0].options.headers["Idempotency-Key"], calls[1].options.headers["Idempotency-Key"]);
    const body = JSON.parse(calls[1].options.body); assert.deepEqual(body.to, ["customer@example.com"]); assert.match(body.text, /WEB-555E962F02/); assert.match(body.text, /https:\/\/shop.example\/order\//);
    globalThis.fetch = async () => new Response("{}", {status: 422});
    assert.equal(await sendOrderEmail("customer@example.com", order, "https://shop.example"), "unavailable");
  } finally { globalThis.fetch = originalFetch; if (key === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = key; if (sender === undefined) delete process.env.ORDER_EMAIL_FROM; else process.env.ORDER_EMAIL_FROM = sender; }
});
