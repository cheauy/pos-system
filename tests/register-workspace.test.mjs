import test from "node:test";
import assert from "node:assert/strict";
import { loadTs, queryDouble } from "./helpers/load-ts.cjs";

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

test("old-branch movements and closes are rejected before a financial write", async () => {
  const { api, calls } = fixture({ branch: "other" });
  await assert.rejects(api.addCashMovement(data({ shiftId: "shift", type: "cash_in", amount: "10", reason: "Cash float" })), /branch changed/);
  await assert.rejects(api.closeRegisterShift(data({ shiftId: "shift", closingCash: "100" })), /branch changed/);
  assert.deepEqual(calls, []);
});

function pageFixture({ branchId = "other", role = "owner", allowed = true, locations = [
  { id: "first", name: "Default", is_active: true },
  { id: "other", name: "Header branch", is_active: true },
  { id: "pending", name: "Final closure", is_active: true, plan_disable_pending: true },
] } = {}) {
  const reads = [];
  const shifts = ["first", "other", "pending"].map(location_id => ({ id: location_id + "-shift", location_id, status: "open", opened_at: "2026-10-11T01:00:00Z", opened_by: "cashier" }));
  const db = { from: table => queryDouble(table, call => {
    const ids = call.steps.find(step => step[0] === "in" && step[1] === "location_id")?.[2];
    return { data: table === "business_locations" ? locations : table === "cash_register_shifts" ? shifts.filter(shift => ids.includes(shift.location_id)) : table === "profiles" ? [{ id: "cashier", full_name: "Fixture staff" }] : [], error: null };
  }, reads) };
  const page = loadTs("app/(dashboard)/dashboard/register/page.tsx", {
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }) },
    "@/lib/branches/context": { getBranchContext: async () => ({ branchId }) },
    "@/lib/auth/require-permission": { requirePermission: async permission => { assert.equal(permission, "register.manage"); if (!allowed) throw Error("Permission denied."); return { id: "business", role }; } },
    "@/lib/supabase/admin": { supabaseAdmin: db },
    "@/lib/supabase/read-all-rows": { readAllRows: async query => query(0, 999) },
    "./register-client": { default: () => null },
  }).default;
  return { page, reads };
}

for (const role of ["owner", "staff"]) test(`register reads follow the header branch for ${role}, preserving owner final closure access`, async () => {
  const { page, reads } = pageFixture({ role });
  const { props } = await page();
  assert.equal(props.branchId, "other");
  assert.deepEqual(props.branches.map(branch => branch.id), role === "owner" ? ["other", "pending"] : ["other"]);
  assert.ok(props.shifts.every(shift => shift.location_id === "other" || (role === "owner" && shift.location_id === "pending")));
  for (const read of reads.filter(read => read.table === "cash_register_shifts")) assert.deepEqual(read.steps.find(step => step[0] === "in"), ["in", "location_id", role === "owner" ? ["other", "pending"] : ["other"]]);
});

for (const branchId of ["", "all", "missing"]) test(`no register context ${JSON.stringify(branchId)} never guesses a branch or reads shift data`, async () => {
  const { page, reads } = pageFixture({ branchId, role: "staff" });
  const { props } = await page();
  assert.equal(props.branchId, branchId);
  assert.deepEqual(props.branches, []); assert.deepEqual(props.shifts, []);
  assert.ok(reads.every(read => read.table === "business_locations"));
});

test("register page denies permission before any branch or shift read", async () => {
  const { page, reads } = pageFixture({ allowed: false });
  await assert.rejects(page(), /Permission denied/); assert.deepEqual(reads, []);
});
