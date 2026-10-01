import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import * as profile from "../lib/storefront/profile.ts";
import * as photoCache from "../lib/public-photo-cache.ts";

const require = createRequire(import.meta.url);
const { uiLoader } = require("./helpers/ui-loader.cjs");
const businessInfo = uiLoader()("lib/business/business-info.ts");
const source = ts.transpileModule(readFileSync(new URL("../app/(dashboard)/dashboard/online-store/actions.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
function setup(options = {}) {
  const writes = [];
  const existing = { display_name: "Shop", logo_url: "/logo.png", banner_url: "/banner.png", primary_color: "#2563EB", currency: "USD", khqr_image_url: "/qr.png", khqr_account_name: "Melody", khqr_instructions: "Pay order", accept_cod: true, accept_khqr: false, business_type: "fashion", updated_at: "2026-09-29T01:00:00Z", phone: "010123456", address: "Phnom Penh", social_links: { custom: "preserved", profile: { contactEmail: "shop@example.test", locationUrl: "https://maps.example.test/shop", openingHours: profile.defaultOpeningHours(), featuredProductIds: ["featured-product"] } } };
  const admin = { from(table) {
    assert.equal(table, "business_storefronts");
    let writing = false;
    const query = { select() { return query; }, eq() { return query; }, is() { return query; }, update(payload) { writing = true; writes.push(payload); return query; }, insert(payload) { writing = true; writes.push(payload); return query; }, single() { return query.maybeSingle(); }, maybeSingle: async () => writing ? ({data: options.conflict ? null : {business_id: "shop"}, error: options.error ? {message: "Write failed"} : null}) : ({ data: existing, error: null }) };
    return query;
  } };
  const deps = {
    "@/lib/images/compress-photo": { compressPhoto: async file => file },
    "@/lib/public-photo-cache": photoCache,
    "next/cache": { revalidatePath() {} },
    "@/lib/audit/create-audit-log": { createAuditLog: async () => {} },
    "@/lib/auth/require-permission": { requirePermission: async () => ({ id: "shop", slug: "shop", role: "owner", product_mode: "variant" }) },
    "@/lib/business/business-mode-presets": { getBusinessModePreset: () => ({ productMode: "variant" }) },
    "@/lib/supabase/admin": { supabaseAdmin: admin },
    "@/lib/storefront/profile": profile,
    "@/lib/business/business-info": businessInfo,
    "@/lib/storefront/types": { isBusinessType: value => value === "fashion" },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", source)(id => deps[id] ?? require(id), module, module.exports);
  return { save: module.exports.updateStorefrontSettings, writes, existing };
}
function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({ businessType: "fashion", description: "Edited shop description", "facebookUrl-name": "Melody Clothing", acceptOnlineOrders: "on", allowPickup: "on", primaryColor: "#2563EB", currency: "USD", newArrivalsEnabled: "on", newArrivalDays: "14", minimumOrder: "5", deliveryFee: "2", allowScheduledOrders: "on", minScheduleLeadMinutes: "60", maxScheduleDays: "14" })) data.set(key, value);
  return data;
}
test("combined settings persist new arrivals, description and fulfillment together", async () => {
  const context = setup();
  assert.equal((await context.save({}, form())).success, true);
  const saved = context.writes[0];
  assert.equal(saved.description, "Edited shop description");
  assert.deepEqual(saved.social_links.profile.newArrivals, { enabled: true, days: 14 });
  assert.equal(saved.social_links.custom, "preserved");
  assert.deepEqual(saved.social_links.profile.featuredProductIds, ["featured-product"]);
  assert.equal(saved.social_links.profile.socialNames.facebook, "Melody Clothing");
  assert.equal(saved.minimum_order, 5);
  assert.equal(saved.delivery_fee, 2);
  assert.equal(saved.allow_scheduled_orders, true);
  assert.equal(saved.min_schedule_lead_minutes, 60);
  assert.equal(saved.max_schedule_days, 14);
  assert.equal(saved.logo_url, "/logo.png");
});
test("image removal clears only the chosen image", async () => {
  const context = setup(), data = form(); data.set("remove-logo", "on");
  assert.equal((await context.save({}, data)).success, true);
  assert.equal(context.writes[0].logo_url, null);
  assert.equal(context.writes[0].banner_url, "/banner.png");
  assert.equal(context.writes[0].khqr_image_url, "/qr.png");
});
test("main Online Store save preserves payment fields moved to Business Settings", async () => {
  const context = setup(), data = form();
  assert.equal((await context.save({}, data)).success, true);
  assert.equal(context.writes[0].accept_cod, true);
  assert.equal(context.writes[0].accept_khqr, false);
  assert.equal(context.writes[0].khqr_image_url, "/qr.png");
  assert.equal(context.writes[0].khqr_account_name, "Melody");
  assert.equal(context.writes[0].khqr_instructions, "Pay order");
  assert.equal(context.writes[0].display_name, "Shop");
});

test("storefront save cannot change the business mode supplied by Business Settings", async () => {
  const context = setup(), data = form();
  data.set("businessType", "restaurant");
  data.set("allowDineIn", "on");
  assert.equal((await context.save({}, data)).success, true);
  assert.equal(Object.hasOwn(context.writes[0], "business_type"), false);
  assert.equal(context.writes[0].allow_dine_in, false);
});

test("unchecked availability switches persist false and can be enabled again", async () => {
  const context = setup(), data = form();
  data.delete("isPublished"); data.delete("acceptOnlineOrders");
  assert.equal((await context.save({}, data)).success, true);
  assert.equal(context.writes[0].is_published, false);
  assert.equal(context.writes[0].accept_online_orders, false);
  data.set("isPublished", "on"); data.set("acceptOnlineOrders", "on");
  assert.equal((await context.save({}, data)).success, true);
  assert.equal(context.writes[1].is_published, true);
  assert.equal(context.writes[1].accept_online_orders, true);
});

// Business Settings owns contact/hours after the settings navigation move.
test("online store save preserves contact and hours even from a stale legacy form", async () => {
  const c=setup(), data=form();
  data.set("phone", "099999999"); data.set("address", "Other address");
  data.set("contactEmail", "other@example.test"); data.set("locationUrl", "https://example.test/other");
  data.set("hoursEnabled", "on"); data.set("hoursTimezone", "Asia/Singapore");
  assert.equal((await c.save({}, data)).success,true); const saved=c.writes[0];
  assert.equal(Object.hasOwn(saved,"phone"),false); assert.equal(Object.hasOwn(saved,"address"),false);
  for(const key of ["contactEmail","locationUrl","openingHours"]) assert.deepEqual(saved.social_links.profile[key],c.existing.social_links.profile[key]);
});
test("online store rejects the wrong business before any write", async () => {
  const c=setup(), data=form(); data.set("businessId", "another");
  assert.equal((await c.save({}, data)).success,false); assert.equal(c.writes.length,0);
});
test("online store reports a concurrent row change or write error instead of a successful save",async()=>{
  for(const options of [{conflict:true},{error:true}]){const c=setup(options); assert.equal((await c.save({},form())).success,false);}
});
