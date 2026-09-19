import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import * as profile from "../lib/storefront/profile.ts";

const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL("../app/(dashboard)/dashboard/online-store/actions.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
function setup() {
  const writes = [];
  const existing = { logo_url: "/logo.png", banner_url: "/banner.png", khqr_image_url: "/qr.png", business_type: "fashion", social_links: { custom: "preserved", profile: { featuredProductIds: ["featured-product"] } } };
  const admin = { from(table) {
    assert.equal(table, "business_storefronts");
    const query = { select() { return query; }, eq() { return query; }, maybeSingle: async () => ({ data: existing, error: null }), upsert: async payload => { writes.push(payload); return { error: null }; } };
    return query;
  } };
  const deps = {
    "next/cache": { revalidatePath() {} },
    "@/lib/audit/create-audit-log": { createAuditLog: async () => {} },
    "@/lib/auth/require-permission": { requirePermission: async () => ({ id: "shop", slug: "shop", role: "owner", product_mode: "variant" }) },
    "@/lib/business/business-mode-presets": { getBusinessModePreset: () => ({ productMode: "variant" }) },
    "@/lib/supabase/admin": { supabaseAdmin: admin },
    "@/lib/storefront/profile": profile,
    "@/lib/storefront/types": { isBusinessType: value => value === "fashion" },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", source)(id => deps[id] ?? require(id), module, module.exports);
  return { save: module.exports.updateStorefrontSettings, writes };
}
function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({ businessType: "fashion", displayName: "Shop", description: "Edited shop description", "facebookUrl-name": "Melody Clothing", acceptOnlineOrders: "on", allowPickup: "on", acceptCod: "on", newArrivalsEnabled: "on", newArrivalDays: "14", minimumOrder: "5", deliveryFee: "2", allowScheduledOrders: "on", minScheduleLeadMinutes: "60", maxScheduleDays: "14" })) data.set(key, value);
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
test("removing KHQR cannot leave enabled KHQR checkout without an image", async () => {
  const context = setup(), data = form(); data.set("remove-khqr", "on"); data.set("acceptKhqr", "on");
  assert.equal((await context.save({}, data)).success, false);
  assert.equal(context.writes.length, 0);
});

test("storefront save cannot change the business mode supplied by Business Settings", async () => {
  const context = setup(), data = form();
  data.set("businessType", "restaurant");
  data.set("allowDineIn", "on");
  assert.equal((await context.save({}, data)).success, true);
  assert.equal(Object.hasOwn(context.writes[0], "business_type"), false);
  assert.equal(context.writes[0].allow_dine_in, false);
});
