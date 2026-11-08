import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { addEmail, getEmailsByRecipient, getEmailById, clearInbox } from "../src/lib/store.ts";

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

test("real Redis: atomic deduplication, isolation, read, TTL, inbox cap, and deletion", { skip: !url || !token }, async () => {
  const recipient = `check.${randomUUID().replaceAll("-", "")}@loeuklabs.site`;
  const id = randomUUID();
  try {
    const email = { id, recipient, sender: "verify@example.com", subject: "Your code is 004201", text: "Code: 004201", html: "", otp_code: "004201", timestamp: Date.now() - 1000 };
    await Promise.all([addEmail(email), addEmail(email)]);
    assert.equal((await getEmailsByRecipient(recipient)).length, 1);
    assert.equal((await getEmailById(id)).otp_code, "004201");
    assert.deepEqual(await getEmailsByRecipient("unrelated@tumnob.site"), []);
    const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(["TTL", `tenh:temp-mail:message:${id}`]) });
    const { result } = await response.json();
    assert.ok(result > 3500 && result <= 3600, `TTL was ${result}`);
    for (let i = 0; i < 20; i++) await addEmail({ ...email, id: randomUUID(), timestamp: Date.now() });
    assert.equal((await getEmailsByRecipient(recipient)).length, 20);
    assert.equal(await getEmailById(id), null, "overflow message data is deleted with its index entry");
    await clearInbox(recipient);
    assert.deepEqual(await getEmailsByRecipient(recipient), []);
    assert.equal(await getEmailById(id), null);
  } finally { await clearInbox(recipient); }
});
