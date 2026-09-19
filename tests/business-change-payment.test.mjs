import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(path, dependencies) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)(id => dependencies[id] ?? require(id), module, module.exports);
  return module.exports;
}

function setup(overrides = {}) {
  const writes = [], filters = [], uploads = [], removals = [];
  const order = { id: "order-1", status: "pending_payment", proof_path: "existing.png", proof_bucket: "tenh-pos-business-change-proofs", proof_file_name: "existing.png", ...overrides.order };
  const admin = {
    from(table) {
      assert.equal(table, "business_change_orders");
      const query = {
        select() { return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        maybeSingle: async () => ({ data: overrides.missing ? null : order, error: null }),
        update(payload) { writes.push(payload); return query; },
        then(resolve) { resolve({ error: overrides.updateError ?? null }); },
      };
      return query;
    },
    storage: { from: () => ({
      upload: async path => { uploads.push(path); return { error: overrides.uploadError ?? null }; },
      remove: async paths => { removals.push(...paths); return { error: null }; },
    }) },
  };
  const { submitBusinessChangePaymentReference: submit } = load("../app/(dashboard)/dashboard/settings/business/actions.ts", {
    "next/cache": { revalidatePath() {} },
    "next/navigation": { redirect() { throw new Error("Unexpected redirect"); } },
    "@/lib/auth/require-permission": { requirePermission: async () => ({ id: "business-1", role: overrides.role ?? "owner" }) },
    "@/lib/audit/create-audit-log": { createAuditLog: async () => {} },
    "@/lib/business/business-mode-presets": {},
    "@/lib/supabase/admin": { supabaseAdmin: admin },
    "@/lib/supabase/server": {},
    "@/lib/tenancy/store-slug-availability": {},
  });
  return { submit, writes, filters, uploads, removals };
}

function form(reference = " TX-12345 ", note = " Paid by transfer ") {
  const data = new FormData();
  data.set("orderId", "order-1");
  if (reference !== null) data.set("paymentReference", reference);
  data.set("paymentNote", note);
  return data;
}

test("missing, blank, short and long references return field errors without crashing or writing", async () => {
  const context = setup();
  for (const value of [null, "   ", "x", "x".repeat(121)]) {
    const result = await context.submit(form(value));
    assert.equal(result.success, false);
    assert.equal(result.field, "paymentReference");
  }
  assert.equal(context.writes.length, 0);
});

test("notes and proof remain required", async () => {
  assert.equal((await setup().submit(form("TX-123", "  "))).field, "paymentNote");
  const context = setup({ order: { proof_path: null } });
  assert.equal((await context.submit(form())).field, "paymentProof");
  assert.equal(context.writes.length, 0);
});

test("valid submission trims fields and queues review without applying a business change", async () => {
  const context = setup();
  assert.equal((await context.submit(form())).success, true);
  assert.equal(context.writes[0].payment_reference, "TX-12345");
  assert.equal(context.writes[0].payment_note, "Paid by transfer");
  assert.equal(context.writes[0].status, "payment_submitted");
  assert.equal(context.filters.filter(([key, value]) => key === "business_id" && value === "business-1").length, 2);
  assert.equal(context.uploads.length, 0);
});

test("nonowners, missing orders and completed orders cannot submit", async () => {
  for (const options of [{ role: "cashier" }, { missing: true }, { order: { status: "applied" } }]) {
    const context = setup(options);
    assert.equal((await context.submit(form())).success, false);
    assert.equal(context.writes.length, 0);
  }
});

test("invalid files are rejected before upload", async () => {
  for (const file of [new File(["invalid"], "proof.txt", { type: "text/plain" }), new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.png", { type: "image/png" })]) {
    const context = setup();
    const data = form(); data.set("paymentProof", file);
    assert.equal((await context.submit(data)).field, "paymentProof");
    assert.equal(context.uploads.length, 0);
  }
});

test("failed persistence cleans up only the new proof and returns an inline error", async () => {
  const context = setup({ updateError: { message: "Database unavailable" } });
  const data = form(); data.set("paymentProof", new File(["image"], "proof.png", { type: "image/png" }));
  assert.equal((await context.submit(data)).success, false);
  assert.deepEqual(context.removals, context.uploads);
  assert.ok(!context.removals.includes("existing.png"));
});

test("payment form renders the required reference field and preserves existing values", () => {
  const { createElement } = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { default: Form } = load("../app/(dashboard)/dashboard/settings/business/payment/[orderId]/payment-form.tsx", { "../../actions": { submitBusinessChangePaymentReference: async () => ({ success: true }) } });
  const html = renderToStaticMarkup(createElement(Form, { orderId: "order-1", paymentReference: "TX-123", paymentNote: "Paid", hasProof: true, proofFileName: "proof.png", submitted: true }));
  const input = html.match(/<input[^>]*name="paymentReference"[^>]*>/)?.[0];
  assert.ok(input, "The server-required reference must be present in the form");
  assert.match(input, /required=""/);
  assert.match(input, /minLength="2"/);
  assert.match(input, /maxLength="120"/);
  assert.match(input, /value="TX-123"/);
  assert.match(html, /Update payment submission/);
});
