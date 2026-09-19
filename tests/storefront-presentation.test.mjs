import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as profile from "../lib/storefront/profile.ts";

const require = createRequire(import.meta.url);
function component(path, deps = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } });
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)(id => id === "./storefront-language" ? { useStorefrontLanguage: () => ({ language: "en", setLanguage() {}, t: value => value }) } : deps[id] ?? require(id), module, module.exports);
  return module.exports.default;
}

test("banner offers real collection links without owner sign-in or service slogans", () => {
  const Hero = component("../app/_sites/[slug]/storefront-hero.tsx");
  const brand = { name: "Shop", businessType: "fashion", logoUrl: "/logo.png", newArrivalsEnabled: true };
  const html = renderToStaticMarkup(createElement(Hero, { brand, cartQuantity: 0, onOpenCart() {} }));
  assert.match(html, /href="#new-arrivals"/);
  assert.match(html, /Browse Collection/);
  assert.match(html, /href="#contact-us"/);
  assert.match(html, /Store navigation/);
  assert.match(html, /href="#store-home" aria-current="page"/);
  assert.doesNotMatch(html, /Owner sign in|Delivery available|Easy store pickup|Shop your way/);
  const disabled = renderToStaticMarkup(createElement(Hero, { brand: { ...brand, newArrivalsEnabled: false }, cartQuantity: 0, onOpenCart() {} }));
  assert.doesNotMatch(disabled, /Shop New Arrivals/);
});

test("footer uses saved branding and named social links without the old Shop menu", () => {
  const Footer = component("../app/_sites/[slug]/storefront-contact.tsx", { "@/lib/storefront/profile": profile });
  const html = renderToStaticMarkup(createElement(Footer, { name: "Shop", categories: [{ id: "shirt", name: "T-shirts" }], settings: { logo_url: "/shop.png", description: "Our edited description", address: "Shop address", phone: "+855 12345", social_links: { tiktok: "https://www.tiktok.com/@shop", profile: { contactEmail: "hello@example.com", socialNames: { tiktok: "Melody fashion" } } } } }));
  assert.match(html, /src="\/shop.png"/);
  assert.match(html, /Our edited description/);
  assert.doesNotMatch(html, /href="#category-shirt"|Follow us/);
  assert.match(html, /Social/);
  assert.match(html, /Melody fashion/);
  assert.match(html, /src="\/social\/tiktok.png"/);
  assert.match(html, /href="tel:\+85512345"/);
  assert.match(html, /href="mailto:hello@example.com"/);
  assert.ok(html.indexOf("tel:") < html.indexOf("Shop address"));
  assert.ok(html.indexOf("tel:") < html.indexOf("<h2>Social"));
});

test("embedded ordering fields keep restaurant-only dine-in out of fashion mode", () => {
  const Fields = component("../app/(dashboard)/dashboard/online-store/ordering/fulfillment-fields.tsx", { "@/lib/storefront/profile": profile });
  const fashion = renderToStaticMarkup(createElement(Fields, { settings: { business_type: "fashion", currency: "USD" }, canEdit: true }));
  assert.doesNotMatch(fashion, /<form|name="allowDineIn"|Scheduled Orders|name="acceptOnlineOrders"|name="allowScheduledOrders"/);
  for (const field of ["allowPickup", "allowDelivery", "minimumOrder", "deliveryFee"]) assert.match(fashion, new RegExp(`name="${field}"`));
  const restaurant = renderToStaticMarkup(createElement(Fields, { settings: { business_type: "restaurant", currency: "USD" }, canEdit: true }));
  assert.match(restaurant, /name="allowDineIn"/);
});

test("bestseller badges render only for sales-qualified products", () => {
  const Catalog = component("../app/_sites/[slug]/storefront-catalog.tsx");
  const product = { key: "shirt", name: "Shirt", categoryId: null, productType: "standard", priceFrom: 10, totalStock: 5, variants: [{ id: "one", stockQuantity: 5, sellingPrice: 10 }], optionGroups: [] };
  const render = isBestseller => renderToStaticMarkup(createElement(Catalog, { products: [{ ...product, isBestseller }], categories: [], settings: { currency: "USD", orderingEnabled: true }, onAdd() {} }));
  assert.match(render(true), /Bestseller/);
  assert.doesNotMatch(render(false), /Bestseller/);
});

test("custom location link is used by the top bar", () => {
 const Hero = component("../app/_sites/[slug]/storefront-hero.tsx");
 const html = renderToStaticMarkup(createElement(Hero, { brand: { name: "Shop", businessType: "fashion", locationUrl: "https://maps.app.goo.gl/shop", address: "Street" }, cartQuantity: 0, onOpenCart() {} }));
 assert.match(html, /href="https:\/\/maps.app.goo.gl\/shop"/);
 assert.doesNotMatch(html, /#category-/);
});
