import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { DEFAULT_RECEIPT } from "../lib/receipts/receipt-model.ts";
import * as receiptModel from "../lib/receipts/receipt-model.ts";
import * as photoCache from "../lib/public-photo-cache.ts";

const require = createRequire(import.meta.url);
function actions({ missingQr = false,missingSaved=false } = {}) {
  const writes = [];
  const uploads = [];
  const stored={};
  const db = { from: () => ({ upsert: values => {
    writes.push(values);
    const error=missingQr&&"receipt_qr_url" in values?{code:"PGRST204",message:"Missing receipt_qr_url column"}:null;
    if(!error)Object.assign(stored,values);
    return {select:()=>({single:async()=>({data:missingSaved?null:{...stored},error})})};
  } }) };
  const bucket = {
    upload: async (path, bytes, options) => { uploads.push({ path, bytes, options }); return { error: null }; },
    getPublicUrl: path => ({ data: { publicUrl: `https://example.com/${path}` } }),
  };
  const deps = {
    "@/lib/public-photo-cache": photoCache,
    "next/cache": { revalidatePath() {} },
    "@/lib/auth/require-permission": { requirePermission: async permission => {
      assert.equal(permission, "business.update"); return { id: "authorized-business" };
    } },
    "@/lib/supabase/branch-server": { createClient: async () => db },
    "@/lib/branches/context": {getBranchContext:async()=>({business:{id:"authorized-business"},branchId:"branch-a"})},
    "@/lib/supabase/admin": { supabaseAdmin: { storage: { from: name => { assert.equal(name, "tenh-receipt-logos"); return bucket; } } } },
    "@/lib/audit/create-audit-log": { createAuditLog: async () => {} },
    "@/lib/receipts/receipt-model": receiptModel,
  };
  const file = new URL("../app/(dashboard)/dashboard/settings/receipts/actions.ts", import.meta.url);
  const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)(id => deps[id] ?? require(id), module, module.exports);
  return { api: module.exports, writes, uploads,stored };
}

test("receipt logo saves survive missing optional QR columns without changing label settings", async () => {
  const { api, writes } = actions({ missingQr: true });
  const appearance = { ...DEFAULT_RECEIPT, logoUrl: "https://example.com/logo.png", header: "Shop header" };
  assert.equal((await api.saveReceiptAppearance("authorized-business", appearance)).success, true);
  assert.equal(writes.length, 2);
  assert.equal(writes[1].receipt_logo_url, appearance.logoUrl);
  assert.equal(writes[1].header_text, "Shop header");
  assert.ok(!("receipt_qr_url" in writes[1]));
  assert.ok(!("barcode_template" in writes[1]));
  assert.equal(receiptModel.receiptAppearance(writes[1]).logoUrl, appearance.logoUrl);
});

test("QR data is never silently dropped when its migration is missing", async () => {
  const { api, writes } = actions({ missingQr: true });
  const result = await api.saveReceiptAppearance("authorized-business", { ...DEFAULT_RECEIPT, qrUrl: "https://example.com/qr.png" });
  assert.equal(result.success, false);
  assert.equal(writes.length, 1);
  assert.match(result.message, /migration/);
});

test("receipt uploads check business identity before using server storage", async () => {
  const { api, uploads } = actions();
  const form = new FormData();
  form.set("logo", new File([new Uint8Array([137,80,78,71,13,10,26,10,0])], "logo.png", { type: "image/png" }));
  assert.equal((await api.uploadReceiptLogo("another-business", form)).success, false);
  assert.equal(uploads.length, 0);
  assert.equal((await api.uploadReceiptLogo("authorized-business", form)).success, true);
  assert.match(uploads[0].path, /^authorized-business\/.+\.png$/);
  assert.equal(uploads[0].options.cacheControl, photoCache.PUBLIC_PHOTO_CACHE_SECONDS);
  assert.equal(uploads[0].options.upsert, false);
});

test("barcode save persists the chosen new layout, size and fields only", async () => {
  const { api, writes } = actions();
  const form = new FormData();
  form.set("barcodeTemplate", "price");
  form.set("barcodeLabelSize", "50x30");
  form.set("barcodeShowStoreName", "on");
  form.set("barcodeShowBarcode", "on");
  await api.saveBarcodeLabelSettings(form);
  assert.equal(writes[0].barcode_template, "price");
  assert.equal(writes[0].barcode_label_size, "50x30");
  assert.equal(writes[0].barcode_show_store_name, true);
  assert.ok(!("receipt_logo_url" in writes[0]));
});

test("saved receipt typography and logo survive a later barcode save and reload",async()=>{
 const {api,stored}=actions();
 const appearance={...DEFAULT_RECEIPT,fontSize:'large',density:'compact',alignment:'left',paperSize:'58mm',logoUrl:'https://example.com/receipt-logo.png',showPhone:false,footer:'Saved footer'};
 assert.equal((await api.saveReceiptAppearance('authorized-business',appearance,'branch-a')).success,true);
 const form=new FormData();form.set('branchId','branch-a');form.set('barcodeLabelSize','40x20');form.set('barcodeTemplate','price');
 await api.saveBarcodeLabelSettings(form);
 assert.deepEqual(receiptModel.receiptAppearance(stored),appearance);
 assert.equal(stored.location_id,'branch-a');assert.equal(stored.barcode_label_size,'40x20');
});
test("a stale branch form or unconfirmed write cannot report a successful save",async()=>{
 const h=actions();assert.equal((await h.api.saveReceiptAppearance('authorized-business',DEFAULT_RECEIPT,'branch-b')).success,false);assert.equal(h.writes.length,0);
 const missing=actions({missingSaved:true});assert.equal((await missing.api.saveReceiptAppearance('authorized-business',DEFAULT_RECEIPT,'branch-a')).success,false);
});
