import test from "node:test";
import assert from "node:assert/strict";
import { fallbackUsername, fetchRealisticUsername } from "../src/lib/username.ts";

const pattern = /^[a-z0-9]+\.[a-z0-9]+[1-9][0-9]$/;

test("offline usernames always use realistic names and two digits", () => {
  for (let i = 0; i < 100; i++) assert.match(fallbackUsername(), pattern);
});

test("remote name is normalized; failed and malformed responses fall back", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://randomuser.me/api/?nat=us,gb,ca,au&inc=name");
      assert.equal(options.cache, "no-store");
      return Response.json({ results: [{ name: { first: "Émma", last: "O'Clark" } }] });
    };
    assert.match(await fetchRealisticUsername(), /^emma\.oclark[1-9][0-9]$/);
    for (const response of [{}, null, { results: [{ name: { first: "", last: "" } }] }]) {
      globalThis.fetch = async () => Response.json(response);
      assert.match(await fetchRealisticUsername(), pattern);
    }
    globalThis.fetch = async () => { throw new Error("offline"); };
    assert.match(await fetchRealisticUsername(), pattern);
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });
    assert.match(await fetchRealisticUsername(), pattern);
  } finally { globalThis.fetch = original; }
});

test("slow name request aborts at two seconds and returns fallback", async (context) => {
  const original = globalThis.fetch;
  context.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    let signal;
    globalThis.fetch = async (_url, options) => {
      signal = options.signal;
      return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
    };
    const pending = fetchRealisticUsername();
    context.mock.timers.tick(1999);
    assert.equal(signal.aborted, false);
    context.mock.timers.tick(1);
    assert.match(await pending, pattern);
    assert.equal(signal.aborted, true);
  } finally { globalThis.fetch = original; }
});
