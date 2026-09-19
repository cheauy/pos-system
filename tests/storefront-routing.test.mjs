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
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)(
    id => dependencies[id] ?? require(id), module, module.exports,
  );
  return module.exports;
}
const domain = loadTypeScript("../lib/tenancy/domain.ts");
const { proxy } = loadTypeScript("../proxy.ts", { "@/lib/tenancy/domain": domain });
const tenantHost = "melodyclothing.localhost:3000";
const request = (path, host = tenantHost) => new NextRequest(`http://${host}${path}`, { headers: { host } });

test("tenant root rewrites to the public storefront and preserves table tokens", async () => {
  const response = await proxy(request("/?table=example"));
  const rewritten = new URL(response.headers.get("x-middleware-rewrite"));
  assert.equal(rewritten.pathname, "/storefront/melodyclothing");
  assert.equal(rewritten.searchParams.get("table"), "example");
});

test("order tracking and storefront APIs remain reachable on tenant hosts", async () => {
  for (const path of ["/order/6f52e04f-e3ad-442f-a114-c9e600ba638b", "/api/storefront/melodyclothing/orders", "/api/storefront/orders/token"]) {
    const response = await proxy(request(path));
    assert.equal(response.headers.get("x-middleware-next"), "1", path);
  }
});

test("private routes and unrelated APIs remain blocked", async () => {
  for (const path of ["/storefront/another-shop", "/_sites/another-shop", "/api/super-admin/businesses", "/order/token/unexpected"]) {
    assert.equal((await proxy(request(path))).status, 404, path);
  }
  assert.equal((await proxy(request("/storefront/melodyclothing", "localhost:3000"))).status, 404);
});
