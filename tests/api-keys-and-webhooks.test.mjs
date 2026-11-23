import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
const { loadTs } = require("./helpers/load-ts.cjs");
const { uiLoader } = require("./helpers/ui-loader.cjs");

const security = loadTs("lib/integrations/security.ts", {
  "node:crypto": require("node:crypto"),
  "node:net": require("node:net"),
});

test("API key generation produces SHA-256 hash, prefix, and header extraction", () => {
  const generated = security.generateApiKey();
  assert.match(generated.rawKey, /^tpos_live_[0-9a-f]{48}$/);
  assert.equal(generated.keyPrefix, generated.rawKey.slice(0, 18));
  assert.equal(generated.keyHash, security.hashApiKey(generated.rawKey));
  assert.equal(security.isPlausibleApiKey(generated.rawKey), true);
  assert.equal(security.isPlausibleApiKey("bad_key"), false);

  const bearerHeaders = new Headers({
    Authorization: `Bearer ${generated.rawKey}`,
  });
  assert.equal(security.extractApiKeyFromHeaders(bearerHeaders), generated.rawKey);

  const xApiKeyHeaders = new Headers({
    "x-api-key": generated.rawKey,
  });
  assert.equal(security.extractApiKeyFromHeaders(xApiKeyHeaders), generated.rawKey);
});

test("HMAC-SHA256 webhook signature signs and verifies with replay protection", () => {
  const secret = security.generateWebhookSecret();
  assert.match(secret, /^whsec_[0-9a-f]{48}$/);

  const body = JSON.stringify({ event: "product.updated", products: [{ sku: "SKU-1" }] });
  const nowSec = 1_795_000_000;
  const sig = security.signWebhookPayload(secret, nowSec, body);
  assert.match(sig, /^sha256=[0-9a-f]{64}$/);

  assert.equal(
    security.verifyWebhookSignature({
      secret,
      signatureHeader: sig,
      timestampHeader: String(nowSec),
      rawBody: body,
      nowSec: nowSec + 30,
    }),
    true,
  );

  // Tampered payload rejected
  assert.equal(
    security.verifyWebhookSignature({
      secret,
      signatureHeader: sig,
      timestampHeader: String(nowSec),
      rawBody: body + " ",
      nowSec,
    }),
    false,
  );

  // Stale timestamp outside 5-minute window rejected
  assert.equal(
    security.verifyWebhookSignature({
      secret,
      signatureHeader: sig,
      timestampHeader: String(nowSec - 600),
      rawBody: body,
      nowSec,
    }),
    false,
  );
});

test("SSRF webhook URL validator accepts public HTTPS and blocks private/loopback targets", () => {
  const valid = security.validateSafeWebhookUrl(
    "https://tenhchat.com/api/webhooks/tenh-pos",
  );
  assert.equal(valid.href, "https://tenhchat.com/api/webhooks/tenh-pos");

  const blockedUrls = [
    "http://tenhchat.com/api/webhooks/tenh-pos",
    "https://localhost:3000/hook",
    "https://sub.localhost/hook",
    "https://internal.local/hook",
    "https://user:pass@tenhchat.com/hook",
    "https://127.0.0.1/hook",
    "https://10.0.0.5/hook",
    "https://192.168.1.20/hook",
    "https://172.16.5.1/hook",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/hook",
  ];

  for (const bad of blockedUrls) {
    assert.throws(() => security.validateSafeWebhookUrl(bad), undefined, bad);
  }

  assert.equal(security.isBlockedIpAddress("8.8.8.8"), false);
  assert.equal(security.isBlockedIpAddress("::ffff:127.0.0.1"), true);
  assert.equal(security.isBlockedIpAddress("100.64.0.1"), true);
});

test("catalog API authenticates SHA-256 key, groups variants, computes promo prices and branch stock", async () => {
  const generated = security.generateApiKey();
  const pricing = loadTs("lib/promotions/pricing.ts");
  const domain = loadTs("lib/tenancy/domain.ts");
  const readAllRows = loadTs("lib/supabase/read-all-rows.ts");

  const businessId = "11111111-1111-4111-8111-111111111111";
  const groupId = "22222222-2222-4222-8222-222222222222";
  const catId = "33333333-3333-4333-8333-333333333333";
  const branchA = "44444444-4444-4444-8444-444444444444";
  const prodM = "55555555-5555-4555-8555-555555555555";
  const prodL = "66666666-6666-4666-8666-666666666666";

  const mockTables = {
    business_api_keys: [
      {
        id: "77777777-7777-4777-8777-777777777777",
        business_id: businessId,
        name: "TenhChat Social Inbox",
        key_hash: generated.keyHash,
        scopes: ["products:read"],
        is_active: true,
        revoked_at: null,
        last_used_at: null,
      },
    ],
    businesses: [
      {
        id: businessId,
        name: "Melody Shop",
        slug: "melodyshop",
        is_active: true,
        product_mode: "variant",
        subscription_status: "active",
        subscription_expires_at: "2099-01-01T00:00:00Z",
      },
    ],
    business_storefronts: [{ business_id: businessId, currency: "USD" }],
    business_locations: [
      { id: branchA, business_id: businessId, is_active: true, plan_disable_pending: false },
    ],
    categories: [{ id: catId, business_id: businessId, name: "Dresses", branch_ids: null }],
    business_coupons: [
      {
        id: "c1",
        business_id: businessId,
        code: "AUTO20",
        is_active: true,
        is_automatic: true,
        apply_pos: false,
        apply_online: true,
        product_ids: null,
        discount_type: "percentage",
        discount_value: 20,
        minimum_order: 0,
        max_discount: null,
        starts_at: null,
        ends_at: null,
        usage_limit: null,
        usage_count: 0,
        per_customer_limit: null,
      },
    ],
    products: [
      {
        id: prodM,
        business_id: businessId,
        category_id: catId,
        name: "Silk Midi Dress",
        sku: "DRESS-BLK-M",
        barcode: "DRESS-BLK-M",
        size: "M",
        color: "Black",
        image_url: "https://images.test/dress.jpg",
        image_urls: ["https://images.test/dress-2.jpg"],
        variant_image_url: null,
        description: "Breathable woven silk midi dress.",
        selling_price: 25,
        stock_quantity: 0,
        is_active: true,
        is_online: true,
        product_type: "variant",
        variant_group_id: groupId,
        created_at: "2026-11-01T00:00:00Z",
        updated_at: "2026-11-20T00:00:00Z",
      },
      {
        id: prodL,
        business_id: businessId,
        category_id: catId,
        name: "Silk Midi Dress",
        sku: "DRESS-BLK-L",
        barcode: "DRESS-BLK-L",
        size: "L",
        color: "Black",
        image_url: "https://images.test/dress.jpg",
        image_urls: null,
        variant_image_url: "https://images.test/dress-l.jpg",
        description: "Breathable woven silk midi dress.",
        selling_price: 25,
        stock_quantity: 0,
        is_active: true,
        is_online: true,
        product_type: "variant",
        variant_group_id: groupId,
        created_at: "2026-11-01T00:00:00Z",
        updated_at: "2026-11-21T00:00:00Z",
      },
    ],
    product_location_stock: [
      { business_id: businessId, location_id: branchA, product_id: prodM, quantity: 6 },
      { business_id: businessId, location_id: branchA, product_id: prodL, quantity: 4 },
    ],
  };

  const supabaseAdmin = {
    from(table) {
      const filters = [];
      let rangeSlice = null;
      let singleMode = false;
      let isUpdate = false;
      const q = {
        select() {
          return q;
        },
        eq(col, val) {
          filters.push((r) => r[col] === val);
          return q;
        },
        in(col, vals) {
          filters.push((r) => vals.includes(r[col]));
          return q;
        },
        or() {
          return q;
        },
        order() {
          return q;
        },
        range(from, to) {
          rangeSlice = [from, to];
          return q;
        },
        maybeSingle() {
          singleMode = true;
          return q;
        },
        update() {
          isUpdate = true;
          return q;
        },
        then(resolve, reject) {
          if (isUpdate) {
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          }
          let list = (mockTables[table] ?? []).filter((row) =>
            filters.every((fn) => fn(row)),
          );
          if (rangeSlice) {
            list = list.slice(rangeSlice[0], rangeSlice[1] + 1);
          }
          const result = singleMode
            ? { data: list[0] ?? null, error: null }
            : { data: list, error: null };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return q;
    },
  };

  const catalogApi = loadTs("lib/integrations/catalog-api.ts", {
    "server-only": {},
    "@/lib/promotions/pricing": pricing,
    "@/lib/supabase/admin": { supabaseAdmin },
    "@/lib/supabase/read-all-rows": readAllRows,
    "@/lib/tenancy/domain": domain,
    "./security": security,
  });

  const route = loadTs("app/api/v1/products/route.ts", {
    "@/lib/integrations/catalog-api": catalogApi,
  });

  // Missing key -> 401
  const unauthRes = await route.GET(
    new NextRequest("http://localhost:3000/api/v1/products"),
  );
  assert.equal(unauthRes.status, 401);

  // Wrong tenant host -> 403
  const wrongTenantRes = await route.GET(
    new NextRequest("http://othershop.localhost:3000/api/v1/products", {
      headers: {
        host: "othershop.localhost:3000",
        "x-tenant-slug": "othershop",
        Authorization: `Bearer ${generated.rawKey}`,
      },
    }),
  );
  assert.equal(wrongTenantRes.status, 403);

  // Valid key -> 200 with unified variant family, promo sale_price, and summed branch stock
  const okRes = await route.GET(
    new NextRequest("http://localhost:3000/api/v1/products", {
      headers: {
        Authorization: `Bearer ${generated.rawKey}`,
      },
    }),
  );
  assert.equal(okRes.status, 200);
  const body = await okRes.json();
  assert.equal(body.ok, true);
  assert.equal(body.count, 1);
  assert.equal(body.products[0].sku, "DRESS-BLK-M");
  assert.equal(body.products[0].category, "Dresses");
  assert.equal(body.products[0].price, 25);
  assert.equal(body.products[0].sale_price, 20);
  assert.equal(body.products[0].stock, 10);
  assert.deepEqual(
    body.products[0].variants.map((v) => v.name),
    ["Black / M", "Black / L"],
  );
});

test("proxy allows /api/products and /api/v1/products on tenant hosts while keeping private APIs 404", async () => {
  const domain = loadTs("lib/tenancy/domain.ts");
  const persistence = loadTs("lib/auth/session-persistence.ts");
  const { proxy } = loadTs("proxy.ts", {
    "@supabase/ssr": { createServerClient: () => ({}) },
    "next/server": require("next/server"),
    "@/lib/tenancy/domain": domain,
    "@/lib/auth/session-persistence": persistence,
  });

  const host = "melodyshop.localhost:3000";
  for (const path of ["/api/products", "/api/v1/products", "/api/external/products"]) {
    const res = await proxy(
      new NextRequest(`http://${host}${path}`, { headers: { host } }),
    );
    assert.equal(res.headers.get("x-middleware-next"), "1", path);
  }

  const blocked = await proxy(
    new NextRequest(`http://${host}/api/super-admin/businesses`, {
      headers: { host },
    }),
  );
  assert.equal(blocked.status, 404);
});

test("General Settings shows API & Webhooks card for owners only", async () => {
  const h = React.createElement;
  const icons = new Proxy(
    {},
    { get: () => (props) => h("svg", { width: props.size, height: props.size }) },
  );
  const baseServices = {
    "lucide-react": icons,
    "next/link": { default: (props) => h("a", props) },
    "@/components/ui/activity-link": { default: (props) => h("a", props) },
  };

  const OwnerPage = uiLoader({
    ...baseServices,
    "@/lib/business/get-current-business": {
      getCurrentBusiness: async () => ({ id: "shop", role: "owner" }),
    },
    "@/lib/auth/effective-permissions": {
      businessHasPermission: async () => true,
    },
  })("app/(dashboard)/dashboard/settings/page.tsx").default;

  const ownerHtml = renderToStaticMarkup(await OwnerPage());
  assert.match(ownerHtml, /API &amp; Webhooks/);
  assert.match(ownerHtml, /href="\/dashboard\/settings\/integrations"/);

  const StaffPage = uiLoader({
    ...baseServices,
    "@/lib/business/get-current-business": {
      getCurrentBusiness: async () => ({ id: "shop", role: "staff" }),
    },
    "@/lib/auth/effective-permissions": {
      businessHasPermission: async () => false,
    },
  })("app/(dashboard)/dashboard/settings/page.tsx").default;

  const staffHtml = renderToStaticMarkup(await StaffPage());
  assert.doesNotMatch(staffHtml, /href="\/dashboard\/settings\/integrations"/);
});

test("migration locks down tables with RLS and revokes public/anon/authenticated grants", () => {
  const sql = readFileSync(
    "supabase/migrations/20261123010000_api_keys_and_webhooks.sql",
    "utf8",
  );
  for (const table of [
    "business_api_keys",
    "business_webhooks",
    "business_webhook_deliveries",
  ]) {
    assert.match(
      sql,
      new RegExp(`alter table public\\.${table} enable row level security`, "i"),
    );
  }
  assert.match(sql, /revoke all on table[\s\S]*from public, anon, authenticated/i);
  for (const fn of [
    "tenh_queue_business_webhook_event",
    "tenh_products_webhook_trigger",
    "tenh_location_stock_webhook_trigger",
    "tenh_claim_webhook_deliveries",
  ]) {
    assert.match(
      sql,
      new RegExp(`revoke all on function public\\.${fn}[\\s\\S]*?from public, anon, authenticated`, "i"),
    );
  }
});
