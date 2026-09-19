import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
const { outputText } = ts.transpileModule(readFileSync(new URL("../app/api/storefront/[slug]/coupon/route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});

async function preview(subtotal, overrides = {}, storeOverrides = {}) {
  const rows = {
    businesses: { id: "shop", is_active: true, subscription_expires_at: null },
    business_storefronts: { is_published: true, accept_online_orders: true, enable_coupons: true, ...storeOverrides },
    business_coupons: { code: "SAVE", discount_type: "percentage", discount_value: 10, minimum_order: 0, max_discount: null, starts_at: null, ends_at: null, usage_limit: null, usage_count: 0, is_active: true, ...overrides },
  };
  const admin = { from(table) {
    const query = { select() { return query; }, eq() { return query; }, ilike() { return query; }, maybeSingle: async () => ({ data: rows[table], error: null }) };
    return query;
  } };
  const dependencies = {
    "@/lib/supabase/admin": { supabaseAdmin: admin },
    "@/lib/tenancy/domain": { normalizeTenantSlug: value => value, getTenantSlugFromHost: () => "melodyclothing" },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)(id => dependencies[id] ?? require(id), module, module.exports);
  const request = new NextRequest("http://melodyclothing.localhost:3000/api/storefront/melodyclothing/coupon", {
    method: "POST", body: JSON.stringify({ code: "save", subtotal }),
  });
  const response = await module.exports.POST(request, { params: Promise.resolve({ slug: "melodyclothing" }) });
  return { status: response.status, body: await response.json() };
}

test("percentage discounts recalculate with subtotal and round to cents", async () => {
  assert.equal((await preview(15)).body.coupon.discount, 1.5);
  assert.equal((await preview(29.99)).body.coupon.discount, 3);
});

test("discounts respect the maximum and never exceed the subtotal", async () => {
  assert.equal((await preview(100, { max_discount: 4 })).body.coupon.discount, 4);
  assert.equal((await preview(15, { discount_type: "fixed", discount_value: 50 })).body.coupon.discount, 15);
});

test("rejects minimum-order, expired and exhausted coupons", async () => {
  for (const override of [{ minimum_order: 50 }, { ends_at: "2000-01-01T00:00:00.000Z" }, { usage_limit: 1, usage_count: 1 }]) {
    assert.equal((await preview(15, override)).status, 400);
  }
});

test("rejects invalid totals and coupons when ordering is paused", async () => {
  assert.equal((await preview(-1)).status, 400);
  assert.equal((await preview(15, {}, { accept_online_orders: false })).status, 400);
});
