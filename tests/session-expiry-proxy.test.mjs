// Proxy fixture with a mocked Supabase client: not a live auth test.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
function loadTypeScript(path, dependencies = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const loaded = { exports: {} };
  new Function("require", "module", "exports", outputText)(
    id => dependencies[id] ?? require(id), loaded, loaded.exports,
  );
  return loaded.exports;
}

const day = 86400000;
const token = signedInMs => `h.${Buffer.from(JSON.stringify({ sub: "user", amr: [{ method: "password", timestamp: Math.floor(signedInMs / 1000) }] })).toString("base64url")}.s`;

function proxyWith({ signedInMs, refreshTo }) {
  const calls = [];
  const ssr = {
    createServerClient: (_url, _key, { cookies }) => ({
      auth: {
        async getUser() {
          calls.push("getUser");
          if (refreshTo) cookies.setAll([{ name: "sb-test-auth-token", value: refreshTo, options: {} }]);
          return { data: { user: { id: "user" } } };
        },
        async getSession() { return { data: { session: { access_token: token(signedInMs) } } }; },
        async signOut(options) {
          calls.push(["signOut", options]);
          cookies.setAll([{ name: "sb-test-auth-token", value: "", options: { maxAge: 0 } }]);
        },
      },
    }),
  };
  const domain = loadTypeScript("../lib/tenancy/domain.ts");
  const persistence = loadTypeScript("../lib/auth/session-persistence.ts");
  const { proxy } = loadTypeScript("../proxy.ts", { "@supabase/ssr": ssr, "@/lib/tenancy/domain": domain, "@/lib/auth/session-persistence": persistence });
  return { proxy, calls };
}

async function run(options) {
  const previous = [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test";
  try {
    const { proxy, calls } = proxyWith(options);
    const request = new NextRequest("http://localhost:3000/dashboard", { headers: { host: "localhost:3000", cookie: "sb-test-auth-token=old; tenh_remember_me=0" } });
    return { response: await proxy(request), calls };
  } finally {
    [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY] = previous;
    if (previous[0] === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (previous[1] === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  }
}

test("a session younger than 30 days from sign-in continues", async () => {
  const { response, calls } = await run({ signedInMs: Date.now() - 29 * day });
  assert.deepEqual(calls, ["getUser"]);
  assert.equal(response.headers.get("x-middleware-next"), "1");
});

test("a session 30 days past sign-in is revoked locally and its cookies cleared before rendering", async () => {
  const { response, calls } = await run({ signedInMs: Date.now() - 30 * day - 1000 });
  assert.deepEqual(calls, ["getUser", ["signOut", { scope: "local" }]]);
  assert.match(response.headers.get("set-cookie") ?? "", /sb-test-auth-token=;/);
  // The route renders without the revoked session.
  assert.doesNotMatch(response.headers.get("x-middleware-request-cookie") ?? "", /sb-test-auth-token/);
});

test("refreshed tokens reach the route in the same request instead of the rotated ones", async () => {
  const { response } = await run({ signedInMs: Date.now() - day, refreshTo: "fresh" });
  assert.match(response.headers.get("set-cookie") ?? "", /sb-test-auth-token=fresh/);
  assert.match(response.headers.get("x-middleware-request-cookie") ?? "", /sb-test-auth-token=fresh/);
});
