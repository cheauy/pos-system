import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./helpers/load-ts.cjs";

const model = loadTs("app/(dashboard)/dashboard/register/register-model.ts");
function data(values) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}
function fixture({ existing = false, allowed = true, branch = "branch", rpcError = null } = {}) {
  const calls = [];
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: "cashier" } } }) },
    from(table) {
      const query = { filters: [], inserted: null };
      for (const method of ["select", "limit"]) query[method] = () => query;
      query.eq = (key, value) => { query.filters.push([key, value]); return query; };
      query.insert = values => { query.inserted = values; calls.push({ table, values }); return query; };
      query.single = async () => ({ data: { id: "fixture-opened" }, error: null });
      query.maybeSingle = async () => ({ data: table === "business_locations" ? { id: branch, is_active: true } : { id: "shift", status: "open", location_id: branch }, error: null });
      query.then = (resolve, reject) => Promise.resolve({ data: existing ? [{ id: "shift" }] : [], error: null }).then(resolve, reject);
      return query;
    },
    rpc: async (name, args) => { calls.push({ name, args }); return { data: {}, error: rpcError }; },
  };
  const api = loadTs("app/(dashboard)/dashboard/register/actions.ts", {
    "./register-model": model,
    "@/lib/branches/context": { assertOperatingBranch: async id => { if (id !== "branch") throw Error("Operating branch changed."); } },
    "@/lib/subscriptions/branch-limits": { assertBranchOperation: async () => {} },
    "next/cache": { revalidatePath() {} },
    "@/lib/audit/create-audit-log": { createAuditLog: async () => {} },
    "@/lib/auth/require-permission": { requirePermission: async permission => {
      assert.equal(permission, "register.manage");
      if (!allowed) throw Error("Permission denied.");
      return { id: "business", role: "owner" };
    } },
    "@/lib/supabase/branch-server": { createClient: async () => db },
    "@/lib/supabase/server": { createClient: async () => db },
    "@/lib/supabase/admin": { supabaseAdmin: db },
  });
  return { api, calls };
}

test("opening submits exact fixture cash, branch, cashier and optional note", async () => {
  const { api, calls } = fixture();
  await api.openRegisterShift(data({ locationId: "branch", openingCash: "125.25", note: " Test note " }));
  assert.deepEqual(calls, [{ table: "cash_register_shifts", values: {
    business_id: "business", location_id: "branch", opened_by: "cashier", opening_cash: 125.25, opening_note: "Test note",
  } }]);
});

test("opening rejects duplicate shifts and foreign branch before any financial write", async () => {
  for (const options of [{ existing: true }, { branch: "other" }]) {
    const { api, calls } = fixture(options);
    await assert.rejects(api.openRegisterShift(data({ locationId: options.branch || "branch", openingCash: "100" })));
    assert.deepEqual(calls, []);
  }
});

test("all register actions retain the register.manage permission boundary", async () => {
  const { api, calls } = fixture({ allowed: false });
  await assert.rejects(api.openRegisterShift(data({ locationId: "branch", openingCash: "100" })), /Permission denied/);
  await assert.rejects(api.addCashMovement(data({ shiftId: "shift", type: "cash_in", amount: "10", reason: "Cash float" })), /Permission denied/);
  await assert.rejects(api.closeRegisterShift(data({ shiftId: "shift", closingCash: "100" })), /Permission denied/);
  assert.deepEqual(calls, []);
});

test("movement retains type, cents, reason, reference and optional note in the existing RPC", async () => {
  const { api, calls } = fixture();
  await api.addCashMovement(data({ shiftId: "shift", type: "cash_out", amount: "20.15", reason: "Safe drop", reference: " TEST-ref ", note: " Test note " }));
  assert.deepEqual(calls, [{ name: "record_cash_movement", args: {
    p_business_id: "business", p_shift_id: "shift", p_type: "cash_out", p_amount: 20.15,
    p_reason: "Safe drop — Test note", p_reference: "TEST-ref",
  } }]);
});

test("invalid opening, movement and counted money never reaches a write", async () => {
  for (const value of ["", "-1", "0.001", "Infinity"]) {
    const { api, calls } = fixture();
    await assert.rejects(api.openRegisterShift(data({ locationId: "branch", openingCash: value })));
    await assert.rejects(api.addCashMovement(data({ shiftId: "shift", type: "cash_in", amount: value, reason: "Cash float" })));
    await assert.rejects(api.closeRegisterShift(data({ shiftId: "shift", closingCash: value })));
    assert.deepEqual(calls, []);
  }
});

test("movement and closing surface server errors for the UI to retain drafts", async () => {
  const { api } = fixture({ rpcError: { message: "Fixture save failed" } });
  await assert.rejects(api.addCashMovement(data({ shiftId: "shift", type: "cash_in", amount: "10", reason: "Cash float" })), /Fixture save failed/);
  await assert.rejects(api.closeRegisterShift(data({ shiftId: "shift", closingCash: "100" })), /Fixture save failed/);
});
