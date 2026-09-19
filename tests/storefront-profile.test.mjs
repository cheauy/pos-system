import test from "node:test";
import assert from "node:assert/strict";
import { defaultOpeningHours, formatOpeningTime, isNewArrival, parseStoreProfile, supportsDineIn, weekDays } from "../lib/storefront/profile.ts";
import QRCode from "qrcode";

test("fashion and retail modes do not offer dine-in", () => {
  for (const type of ["fashion", "shoes", "accessories", "general", "beauty", "electronics", "grocery"]) assert.equal(supportsDineIn(type), false);
  for (const type of ["restaurant", "cafe", "milk_tea"]) assert.equal(supportsDineIn(type), true);
});
test("contact, SEO, opening hours and closed days survive serialization", () => {
  const form = new FormData();
  form.set("contactEmail", "shop@example.com");
  form.set("seoTitle", "My fashion store");
  form.set("seoDescription", "Shop the collection.");
  form.set("hoursEnabled", "on");
  form.set("hoursTimezone", "Asia/Phnom_Penh");
  form.set("hours-monday-open", "10:30");
  form.set("hours-monday-close", "22:00");
  form.set("hours-sunday-closed", "on");
  const profile = JSON.parse(JSON.stringify(parseStoreProfile(form)));
  assert.equal(profile.contactEmail, "shop@example.com");
  assert.equal(profile.seoTitle, "My fashion store");
  assert.equal(profile.seoDescription, "Shop the collection.");
  assert.equal(profile.openingHours.days.monday.open, "10:30");
  assert.equal(profile.openingHours.days.sunday.closed, true);
  assert.equal(Object.keys(profile.openingHours.days).length, 7);
});
test("hours are hidden until configured, and overnight schedules are accepted", () => {
  assert.equal(defaultOpeningHours().enabled, false);
  assert.equal(parseStoreProfile(new FormData()).openingHours.enabled, false);
  const form = new FormData();
  form.set("hoursEnabled", "on");
  form.set("hours-monday-open", "18:00");
  form.set("hours-monday-close", "02:00");
  assert.equal(parseStoreProfile(form).openingHours.days.monday.close, "02:00");
  assert.equal(formatOpeningTime("00:30"), "12:30 AM");
  assert.equal(formatOpeningTime("12:00"), "12:00 PM");
  assert.equal(weekDays.length, 7);
});
test("invalid SEO, contact details and opening times are rejected", () => {
  for (const [key, value] of [["seoTitle", "a".repeat(61)], ["seoDescription", "a".repeat(161)], ["contactEmail", "invalid"], ["hoursTimezone", "Invalid/Zone"], ["hours-monday-open", "25:00"]]) {
    const form = new FormData(); form.set(key, value); assert.throws(() => parseStoreProfile(form));
  }
  const form = new FormData(); form.set("hoursEnabled", "on"); form.set("hours-monday-close", "09:00");
  assert.throws(() => parseStoreProfile(form), /different opening/);
});
test("website QR encodes the store URL without a table token and renders offline", async () => {
  const url = "https://melodyclothing.example.com/";
  const qr = QRCode.create(url);
  const encoded = qr.segments.map(segment => Buffer.from(segment.data).toString()).join("");
  assert.equal(encoded, url);
  assert.equal(encoded.includes("table="), false);
  assert.match(await QRCode.toDataURL(url, { width: 400, margin: 4 }), /^data:image\/png;base64,/);
});

test("new arrivals use the configured window and exclude old, future and invalid dates", () => {
  const now = Date.parse("2026-09-19T12:00:00Z");
  assert.equal(isNewArrival("2026-09-18T12:00:00Z", { enabled: true, days: 7 }, now), true);
  assert.equal(isNewArrival("2026-09-01T12:00:00Z", { enabled: true, days: 7 }, now), false);
  assert.equal(isNewArrival("2026-09-18T12:00:00Z", { enabled: false, days: 30 }, now), false);
  assert.equal(isNewArrival("2026-09-20T12:00:00Z", undefined, now), false);
  assert.equal(isNewArrival("invalid", undefined, now), false);
  const form = new FormData(); form.set("newArrivalsEnabled", "on"); form.set("newArrivalDays", "14");
  assert.deepEqual(parseStoreProfile(form).newArrivals, { enabled: true, days: 14 });
  for (const days of ["0", "366", "1.5", "invalid"]) {
    form.set("newArrivalDays", days);
    assert.throws(() => parseStoreProfile(form), /New arrival period/);
  }
});

test("location URL accepts map links and rejects unsafe protocols", () => {
  const form = new FormData();
  form.set("locationUrl", "https://maps.app.goo.gl/shop");
  assert.equal(parseStoreProfile(form).locationUrl, "https://maps.app.goo.gl/shop");
  for (const value of ["javascript:alert(1)", "bad url", "https://user:password@example.com"]) {
    form.set("locationUrl", value);
    assert.throws(() => parseStoreProfile(form), /location URL/);
  }
});
