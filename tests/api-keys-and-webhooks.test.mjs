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

test("API key generation produces SHA-256 hash, 15-char prefix, masked display, and AES-256-GCM reveal", () => {
  const generated = security.generateApiKey();
  assert.match(generated.rawKey, /^tpos_live_[0-9a-f]{48}$/);
  assert.equal(generated.keyPrefix, generated.rawKey.slice(0, 15));
  assert.equal(
    security.maskApiKeyPrefix(generated.keyPrefix),
    `${generated.rawKey.slice(0, 15)}••••••`,
  );
  assert.equal(generated.keyHash, security.hashApiKey(generated.rawKey));
  assert.equal(security.isPlausibleApiKey(generated.rawKey), true);
  assert.equal(security.isPlausibleApiKey("bad_key"), false);

  const testSecret = "super-secret-master-key-for-unit-tests-only";
  const encrypted = security.encryptIntegrationSecret(generated.rawKey, testSecret);
  assert.doesNotMatch(encrypted, new RegExp(generated.rawKey));
  assert.equal(
    security.decryptIntegrationSecret(encrypted, testSecret),
    generated.rawKey,
  );
  assert.throws(() =>
    security.decryptIntegrationSecret(encrypted, "wrong-master-secret-value-123456"),
  );

  const bearerHeaders = new Headers({
    Authorization: `Bearer ${generated.rawKey}`,
  });
  assert.equal(security.extractApiKeyFromHeaders(bearerHeaders), generated.rawKey);

  const xApiKeyHeaders = new Headers({
    "x-api-key": generated.rawKey,
  });
  assert.equal(security.extractApiKeyFromHeaders(xApiKeyHeaders), generated.rawKey);
});

test("maskWebhookUrl and sanitizeDeliveryMessage hide sensitive paths and tokens", () => {
  assert.equal(
    security.maskWebhookUrl("https://tenhchat.com/api/webhooks/tenh-pos?secret=12345"),
    "https://tenhchat.com/••••••",
  );
  const sanitized = security.sanitizeDeliveryMessage(
    "Rejected Bearer abcdef123 and key tpos_live_999999999999 at ?secret=topsecret",
  );
  assert.doesNotMatch(sanitized, /abcdef123|999999999999|topsecret/);
  assert.match(sanitized, /\[REDACTED\]/);
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

test("catalog API authenticates SHA-256 key, groups variants, computes promo prices and branch stock without exposing cost_price", async () => {
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
        cost_price: 8,
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
        cost_price: 8,
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
  assert.equal(body.products[0].price, 25);
  assert.equal(body.products[0].sale_price, 20);
  assert.equal(body.products[0].stock, 10);
  // Wholesale cost_price must NEVER leak
  assert.equal(Object.hasOwn(body.products[0], "cost_price"), false);
  assert.equal(Object.hasOwn(body.products[0].variants[0], "cost_price"), false);
});

test("API & Webhooks is visible to Owner and Admin only, hidden from Staff/Cashier/Manager, and masks keys/URLs by default", async () => {
  const h = React.createElement;
  const icons = new Proxy(
    {},
    { get: () => (props) => h("svg", { width: props.size, height: props.size }) },
  );
  const baseServices = {
    "lucide-react": icons,
    "next/link": { default: (props) => h("a", props) },
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    sonner: { toast: { success() {}, error() {} } },
    "@/components/ui/activity-link": { default: (props) => h("a", props) },
  };

  for (const allowedRole of ["owner", "admin"]) {
    const AllowedPage = uiLoader({
      ...baseServices,
      "@/lib/business/get-current-business": {
        getCurrentBusiness: async () => ({ id: "shop", role: allowedRole }),
      },
      "@/lib/auth/effective-permissions": {
        businessHasPermission: async () => true,
      },
    })("app/(dashboard)/dashboard/settings/page.tsx").default;

    const html = renderToStaticMarkup(await AllowedPage());
    assert.match(html, /href="\/dashboard\/settings\/integrations"/, allowedRole);
  }

  for (const deniedRole of ["staff", "cashier", "manager"]) {
    const DeniedPage = uiLoader({
      ...baseServices,
      "@/lib/business/get-current-business": {
        getCurrentBusiness: async () => ({ id: "shop", role: deniedRole }),
      },
      "@/lib/auth/effective-permissions": {
        businessHasPermission: async () => false,
      },
    })("app/(dashboard)/dashboard/settings/page.tsx").default;

    const html = renderToStaticMarkup(await DeniedPage());
    assert.doesNotMatch(html, /href="\/dashboard\/settings\/integrations"/, deniedRole);
  }

  // Verify IntegrationsClient renders only masked key + masked webhook URL + Eye buttons
  const Client = uiLoader({
    ...baseServices,
    "./actions": {
      createBusinessApiKeyAction: async () => ({ success: true, message: "" }),
      revealBusinessApiKeyAction: async () => ({ success: true, message: "" }),
      revokeBusinessApiKeyAction: async () => ({ success: true, message: "" }),
      saveBusinessWebhookAction: async () => ({ success: true, message: "" }),
      revealBusinessWebhookAction: async () => ({ success: true, message: "" }),
      toggleBusinessWebhookAction: async () => ({ success: true, message: "" }),
      rotateWebhookSecretAction: async () => ({ success: true, message: "" }),
      deleteBusinessWebhookAction: async () => ({ success: true, message: "" }),
      testBusinessWebhookAction: async () => ({ success: true, message: "" }),
      flushPendingWebhooksAction: async () => ({ success: true, message: "" }),
    },
  })(
    "app/(dashboard)/dashboard/settings/integrations/integrations-client.tsx",
  ).default;

  const clientHtml = renderToStaticMarkup(
    h(Client, {
      businessId: "shop",
      productsApiUrl: "https://app.tenh-pos.com/api/v1/products",
      alternateProductsApiUrl: "https://tenh-pos.com/api/products",
      migrationReady: true,
      apiKeys: [
        {
          id: "k1",
          name: "TenhChat Social Inbox",
          maskedKey: "tpos_live_a5986••••••",
          isActive: true,
          lastUsedAt: null,
          createdAt: "2026-11-23T07:00:00Z",
        },
      ],
      webhooks: [
        {
          id: "w1",
          name: "TenhChat Social Inbox",
          maskedTargetUrl: "https://tenhchat.com/••••••",
          secretMask: "whsec_12ab••••••",
          events: ["product.updated"],
          isActive: true,
          lastTriggeredAt: null,
          lastStatusCode: 200,
          lastError: null,
          createdAt: "2026-11-23T07:00:00Z",
        },
      ],
      deliveries: [],
    }),
  );

  assert.match(clientHtml, /tpos_live_a5986••••••/);
  assert.match(clientHtml, /https:\/\/tenhchat\.com\/••••••/);
  assert.match(clientHtml, /aria-label="Show full API key"/);
  assert.match(clientHtml, /aria-label="Show full webhook URL"/);
});
