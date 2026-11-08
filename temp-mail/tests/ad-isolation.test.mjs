import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import * as icons from "lucide-react";
import { createRoot } from "react-dom/client";
import * as config from "../src/lib/config.ts";
import * as i18n from "../src/lib/i18n.ts";
import nextConfig from "../next.config.ts";

function component(path, imports) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", code)((name) => {
    if (!(name in imports)) throw new Error(`Unexpected import ${name}`);
    return imports[name];
  }, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

test("Gemini rails load two distinct approved units on desktop only and never reload on resize or rerender", async () => {
  const originals = new Map(["window", "document", "IS_REACT_ACT_ENVIRONMENT"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    for (const width of [390, 1279, 1280, 1920]) {
      const dom = new JSDOM("<div id='root'></div>", { url: "https://temp-mail.tenh-pos.com/gemini" });
      dom.window.innerWidth = width;
      for (const key of originals.keys()) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[key] });
      const imports = { react: React, "react/jsx-runtime": jsx };
      const ads = component("../src/components/AdSlot.tsx", imports);
      const rails = component("../src/components/GeminiAds.tsx", { ...imports, "./AdSlot": ads });
      const root = createRoot(dom.window.document.getElementById("root"));
      try {
        await React.act(async () => root.render(React.createElement(rails.default)));
        const frames = [...dom.window.document.querySelectorAll("iframe")];
        assert.equal(frames.length, width >= 1280 ? 2 : 0);
        if (frames.length) assert.deepEqual(frames.map(frame => frame.src), ["https://tenh-temp-mail.vercel.app/ads/sidebar-600.html", "https://tenh-temp-mail.vercel.app/ads/sidebar-300.html"]);
        dom.window.innerWidth = width >= 1280 ? 390 : 1920;
        await React.act(async () => { dom.window.dispatchEvent(new dom.window.Event("resize")); root.render(React.createElement(rails.default)); });
        assert.deepEqual([...dom.window.document.querySelectorAll("iframe")], frames);
      } finally {
        await React.act(async () => root.unmount());
        dom.window.close();
      }
    }
    for (const [height, key] of [[600, "634bbe2dde2e051f5ca22ff538f58a60"], [300, "62c47613cf89777578896bbdbc2de09b"]]) {
      const html = readFileSync(new URL(`../public/ads/sidebar-${height}.html`, import.meta.url), "utf8");
      // No external resources: test ads without generating impressions.
      const dom = new JSDOM(html, { runScripts: "dangerously" });
      try {
        assert.equal(dom.window.atOptions.key, key);
        assert.equal(dom.window.atOptions.height, height);
        assert.equal(dom.window.atOptions.width, 160);
        assert.equal(dom.window.document.querySelectorAll('script[src="/ads/banner.js"]').length, 1);
      } finally { dom.window.close(); }
    }
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("actual inbox polling, message arrival and emptying preserve all three ad frames", async (t) => {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://temp-mail.tenh-pos.com", pretendToBeVisual: true });
  const originals = new Map();
  for (const key of ["window", "document", "localStorage", "IS_REACT_ACT_ENVIRONMENT"]) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[key] });
  }
  const baseImports = { react: React, "react/jsx-runtime": jsx, "lucide-react": icons, "../lib/i18n.ts": i18n, "../lib/config.ts": config };
  const ads = component("../src/components/AdSlot.tsx", baseImports);
  const reader = component("../src/components/EmailReader.tsx", { ...baseImports, "isomorphic-dompurify": { default: { sanitize: (html) => html } } });
  const app = component("../src/components/TempMail.tsx", {
    ...baseImports, "next/dynamic": { default: () => reader.default },
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "../lib/username.ts": { fallbackUsername: () => "alex.smith42", fetchRealisticUsername: async () => "alex.smith42" },
    "./AdSlot": ads, "./Modal": { default: () => null }, "./DomainStatusPanel": { default: () => null },
  });
  const originalFetch = globalThis.fetch;
  let polls = 0;
  globalThis.fetch = async () => {
    polls++;
    const emails = [2, 3, 5].includes(polls) ? [{ id: String(polls), recipient: "alex.smith42@loeuklabs.site", sender: "test@example.com", subject: `Message ${polls}`, text: "Code 004201", html: "", otp_code: "004201", timestamp: Date.now() }] : [];
    return Response.json({ emails, deliveryReady: true });
  };
  const root = createRoot(dom.window.document.getElementById("root"));
  const mutations = [];
  const observer = new dom.window.MutationObserver(records => mutations.push(...records));
  try {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    await React.act(async () => root.render(React.createElement(React.Fragment, null, React.createElement(app.default), React.createElement(ads.default, { id: "native-banner", width: 1200, height: 320, label: "Advertisement", format: "native" }))));
    const frames = [...dom.window.document.querySelectorAll(".ad-frame")];
    assert.equal(frames.length, 3);
    assert.deepEqual(frames.map(frame => frame.getAttribute("src")), ["https://tenh-temp-mail.vercel.app/ads/leaderboard.html?size=desktop", "https://tenh-temp-mail.vercel.app/ads/inbox.html", "https://tenh-temp-mail.vercel.app/ads/native.html"]);
    assert.ok(frames.every(frame => new URL(frame.src).origin !== dom.window.location.origin));
    assert.ok(frames.every(frame => frame.getAttribute("sandbox").includes("allow-same-origin")));
    observer.observe(dom.window.document.body, { subtree: true, attributes: true, attributeFilter: ["src", "srcdoc"] });
    for (const tick of [250, 4000, 4000, 4000, 4000]) {
      await React.act(async () => t.mock.timers.tick(tick));
      const current = [...dom.window.document.querySelectorAll(".ad-frame")];
      assert.equal(current.length, 3);
      current.forEach((frame, index) => assert.equal(frame, frames[index]));
    }
    assert.equal(polls, 5);
    assert.equal(mutations.length, 0, "polling must not change iframe src or srcdoc");
    assert.match(dom.window.document.body.textContent, /Message 5/);
  } finally {
    observer.disconnect();
    await React.act(async () => root.unmount());
    t.mock.timers.reset();
    globalThis.fetch = originalFetch;
    dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("responsive banners select one approved tag without loading advertising in tests", async () => {
  const html = readFileSync(new URL("../public/ads/leaderboard.html", import.meta.url), "utf8");
  const loader = readFileSync(new URL("../public/ads/banner.js", import.meta.url), "utf8");
  for (const [key, width] of [["048b77a3941fe2077fd51fe8629f5846", 728], ["1c8db8cef79dec02d56266967c1adc1e", 320]]) {
    // External resources are disabled: no Adsterra requests or impressions in tests.
    const dom = new JSDOM(html, { url: `https://tenh-temp-mail.vercel.app/ads/leaderboard.html?size=${width === 728 ? "desktop" : "mobile"}`, runScripts: "dangerously", beforeParse: window => { window.innerWidth = 0; } });
    try {
      assert.equal(dom.window.atOptions.key, key);
      assert.equal(dom.window.atOptions.width, width);
      assert.equal(dom.window.document.querySelectorAll('script[src^="https://bauval.org/"]').length, 0);
      dom.window.eval(loader);
      assert.equal(dom.window.document.querySelectorAll('script[src^="https://bauval.org/"]').length, 1);
      assert.equal(dom.window.document.querySelector('script[src^="https://bauval.org/"]').async, true);
      assert.equal(dom.window.document.querySelector('script[src^="https://bauval.org/"]').getAttribute("src"), `https://bauval.org/22/${key}`);
    } finally { dom.window.close(); }
  }
  const rules = await nextConfig.headers();
  const ads = rules.find(rule => rule.source === "/ads/:path*");
  const policy = ads.headers.find(header => header.key === "Content-Security-Policy").value;
  assert.match(policy, /sandbox allow-scripts/);
  assert.match(policy, /allow-same-origin/);
  assert.match(policy, /frame-ancestors 'self' https:\/\/temp-mail\.tenh-pos\.com;/);
  assert.ok(!ads.headers.some(header => header.key === "X-Frame-Options"));
  const redirects = await nextConfig.redirects();
  assert.deepEqual(redirects[0].has, [{ type: "host", value: "temp-mail.tenh-pos.com" }]);
  assert.equal(redirects[0].destination, "https://tenh-temp-mail.vercel.app/ads/:path*");
});

test("narrow ad documents scale their existing creative without replacing or reloading it", () => {
  const fit = readFileSync(new URL("../public/ads/fit.js", import.meta.url), "utf8");
  const loader = readFileSync(new URL("../public/ads/banner.js", import.meta.url), "utf8");
  for (const [file, width] of [["leaderboard", 320], ["inbox", 300]]) {
    const html = readFileSync(new URL(`../public/ads/${file}.html`, import.meta.url), "utf8");
    const dom = new JSDOM(html, { runScripts: "dangerously", beforeParse: window => { window.innerWidth = 271; } });
    try {
      assert.equal(dom.window.document.querySelector('script[src="/ads/fit.js"]').nextElementSibling.tagName, "SCRIPT");
      dom.window.eval(fit);
      dom.window.eval(loader);
      const frame = dom.window.document.createElement("iframe");
      frame.src = "about:blank";
      dom.window.document.body.appendChild(frame);
      delete dom.window.atOptions;
      for (const viewport of [271, 305, 375, 430]) {
        dom.window.innerWidth = viewport;
        dom.window.dispatchEvent(new dom.window.Event("resize"));
        assert.equal(dom.window.document.body.style.width, `${width}px`);
        const scale = Number(dom.window.document.body.style.transform.match(/scale\(([^)]+)\)/)[1]);
        assert.ok(Math.abs(scale - Math.min(1, viewport / width)) < 0.000001);
        assert.equal(dom.window.document.querySelector("iframe"), frame);
        assert.equal(frame.src, "about:blank");
        assert.equal(dom.window.document.querySelectorAll('script[src^="https://bauval.org/"]').length, 1);
      }
    } finally { dom.window.close(); }
  }
});

test("blocked slots stay collapsed and readiness is accepted only from their own origin and frame", async (t) => {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://temp-mail.tenh-pos.com" });
  const style = dom.window.document.createElement("style");
  style.textContent = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  dom.window.document.head.appendChild(style);
  const originals = new Map();
  for (const key of ["window", "document", "IS_REACT_ACT_ENVIRONMENT"]) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : dom.window[key] });
  }
  const ads = component("../src/components/AdSlot.tsx", { react: React, "react/jsx-runtime": jsx });
  const root = createRoot(dom.window.document.getElementById("root"));
  try {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    await React.act(async () => root.render(React.createElement(ads.default, { id: "test-ad", width: 728, height: 90, label: "Advertisement" })));
    const frame = dom.window.document.querySelector("iframe");
    const slot = dom.window.document.querySelector("aside");
    assert.equal(slot.dataset.adState, "pending");
    assert.equal(dom.window.getComputedStyle(slot).height, "0px");
    assert.equal(slot.getAttribute("aria-hidden"), "true");
    await React.act(async () => t.mock.timers.tick(12000));
    assert.equal(slot.dataset.adState, "unavailable");
    assert.equal(dom.window.getComputedStyle(slot).height, "0px");
    assert.equal(dom.window.getComputedStyle(slot).marginTop, "0px");
    const send = async (origin, source, height) => React.act(async () => dom.window.dispatchEvent(new dom.window.MessageEvent("message", { origin, source, data: { type: "tenh-ad-state", visible: true, height } })));
    await send("https://example.com", frame.contentWindow, 50);
    await send("https://tenh-temp-mail.vercel.app", dom.window, 50);
    await send("https://tenh-temp-mail.vercel.app", frame.contentWindow, 9999);
    assert.equal(slot.dataset.adState, "unavailable");
    await send("https://tenh-temp-mail.vercel.app", frame.contentWindow, 50);
    assert.equal(slot.dataset.adState, "ready");
    assert.equal(slot.getAttribute("aria-hidden"), "false");
    assert.equal(dom.window.document.querySelector("iframe"), frame);
    assert.equal(frame.getAttribute("height"), "50");
    await React.act(async () => dom.window.dispatchEvent(new dom.window.MessageEvent("message", { origin: "https://tenh-temp-mail.vercel.app", source: frame.contentWindow, data: { type: "tenh-ad-state", visible: false, height: 0 } })));
    assert.equal(slot.dataset.adState, "unavailable");
    assert.equal(dom.window.document.querySelector("iframe"), frame);
  } finally {
    await React.act(async () => root.unmount());
    t.mock.timers.reset();
    dom.window.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("creative reporting ignores empty frames and tracking pixels and sends dimensions without reloading", async () => {
  const dom = new JSDOM("<body><iframe></iframe></body>", { runScripts: "dangerously", url: "https://tenh-temp-mail.vercel.app/ads/inbox.html" });
  const messages = [];
  dom.window.ResizeObserver = class { observe() {} };
  dom.window.postMessage = (data, origin) => messages.push({ data, origin });
  dom.window.document.body.getBoundingClientRect = () => ({ height: 250 });
  const frame = dom.window.document.querySelector("iframe");
  try {
    dom.window.eval(readFileSync(new URL("../public/ads/report.js", import.meta.url), "utf8"));
    await new Promise(setImmediate);
    assert.equal(messages.length, 0);
    const image = frame.contentDocument.createElement("img");
    Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 1, configurable: true }, naturalHeight: { value: 1, configurable: true } });
    image.getBoundingClientRect = () => ({ width: 300, height: 250 });
    frame.contentDocument.body.appendChild(image);
    await new Promise(setImmediate);
    assert.equal(messages.length, 0);
    Object.defineProperties(image, { naturalWidth: { value: 300 }, naturalHeight: { value: 250 } });
    image.dispatchEvent(new dom.window.Event("load"));
    await new Promise(setImmediate);
    assert.deepEqual(JSON.parse(JSON.stringify(messages)), [{ data: { type: "tenh-ad-state", visible: true, height: 250 }, origin: "https://temp-mail.tenh-pos.com" }]);
    dom.window.dispatchEvent(new dom.window.Event("resize"));
    await new Promise(setImmediate);
    assert.equal(messages.length, 1);
    assert.equal(dom.window.document.querySelector("iframe"), frame);
    image.remove();
    await new Promise(setImmediate);
    assert.deepEqual(JSON.parse(JSON.stringify(messages[1])), { data: { type: "tenh-ad-state", visible: false, height: 0 }, origin: "https://temp-mail.tenh-pos.com" });
    const card = dom.window.document.createElement("div");
    card.innerHTML = '<a href="//"></a><div class="native__title">A native background-image creative</div>';
    card.querySelector("a").getBoundingClientRect = () => ({ width: 280, height: 260 });
    dom.window.document.body.appendChild(card);
    await new Promise(setImmediate);
    assert.equal(messages[2].data.visible, true);
  } finally { dom.window.close(); }
});
