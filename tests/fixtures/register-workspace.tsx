// Browser-only fixtures: the real register UI never imports a database client.
import { createContext, useContext, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import RegisterClient from "../../app/(dashboard)/dashboard/register/register-client";
import LanguageProvider from "../../components/providers/language-provider";
import { totals, type Shift, type Movement, type Order } from "../../app/(dashboard)/dashboard/register/register-model";

const branches = [
  { id: "branch", name: "TENH Central", code: "MAIN", is_active: true },
  { id: "other", name: "TENH Riverside", code: "RIVER", is_active: true },
];
const closed: Shift = {
  id: "closed", location_id: "branch", status: "closed", opened_by: "cashier",
  opened_at: "2026-10-08T01:00:00Z", closed_at: "2026-10-08T10:00:00Z",
  opening_cash: 100, expected_cash: 320, closing_cash: 319.5, variance: -.5,
  opening_note: "Fixture opening note", closing_note: "Fixture closing note",
  register_summary: { cash: 240, noncash: 85, incoming: 10, outgoing: 30, refunds: 5, expected: 320 },
};
const active: Shift = {
  ...closed, id: "active", status: "open", closed_at: null, closing_cash: null,
  expected_cash: null, variance: null, closing_note: null, register_summary: null,
  opened_at: "2026-10-09T01:00:00Z", opening_note: "Fixture data only",
};
const sales: Order[] = [
  { id: "cash-sale", order_number: "TEST-001", register_shift_id: "active", payment_method: "cash", total: 240, amount_paid: 250, change_amount: 10, status: "completed", created_at: "2026-10-09T02:00:00Z", pos_checkout: null },
  { id: "bank-sale", order_number: "TEST-002", register_shift_id: "active", payment_method: "bank_transfer", total: 85, amount_paid: 85, change_amount: 0, status: "completed", created_at: "2026-10-09T03:00:00Z", pos_checkout: null },
];
const cash: Movement[] = [
  { id: "float", shift_id: "active", movement_type: "cash_in", amount: 10, reason: "Cash float", reference: "TEST-IN", created_by: "cashier", created_at: "2026-10-09T04:00:00Z" },
  { id: "out", shift_id: "active", movement_type: "cash_out", amount: 25, reason: "Safe drop", reference: "TEST-OUT", created_by: "cashier", created_at: "2026-10-09T05:00:00Z" },
  { id: "refund", shift_id: "active", movement_type: "cash_out", amount: 5, reason: "Fixture refund", reference: "return:fixture", created_by: "cashier", created_at: "2026-10-09T06:00:00Z" },
];
type State = { branchId: string; branches: (typeof branches[number] & { plan_disable_pending?: boolean })[]; shifts: Shift[]; movements: Movement[]; orders: Order[] };
let state: State;
let update: (state: State) => void;
let header = { branchId: "branch", changing: false };
let updateHeader: (context: typeof header) => void;
const HeaderContext = createContext(header);
const guards = new Set<() => string | null>();
export function useWorkspaceBranch() { return useContext(HeaderContext); }
export function useBranchSwitchGuard(guard: () => string | null) {
  useEffect(() => { guards.add(guard); return () => { guards.delete(guard); }; }, [guard]);
}
const controls = {
  calls: [] as { action: string; fields: Record<string, FormDataEntryValue> }[],
  refreshes: 0, prints: 0, failNext: false, hold: false,
  release: () => {},
  holdBranch: false,
  setHeader(branchId: string, changing = false) { header = { branchId, changing }; updateHeader?.({ ...header }); },
  beginSwitch(branchId: string) {
    if (header.changing || [...guards].some(guard => guard())) return false;
    this.setHeader(branchId, true); return true;
  },
  loadBranch(branchId: string) {
    state = { ...state, branchId, shifts: [{ ...closed, id: `closed-${branchId}`, location_id: branchId }, ...(branchId === "branch" ? [{ ...active }] : [])] };
    update?.({ ...state });
    if (header.branchId === branchId) this.setHeader(branchId);
  },
  reset(mode = "open") {
    state = {
      branchId: "branch",
      branches: branches.map(b => ({ ...b, plan_disable_pending: mode === "closing-only" && b.id === "branch" })),
      shifts: mode === "closed" ? [{ ...closed }] : [{ ...active }, { ...closed }],
      movements: mode === "closed" ? [] : [...cash], orders: mode === "closed" ? [] : [...sales],
    };
    if (mode === "pending-closure") { state.branches.push({ id: "pending", name: "TENH Final Closure", code: "END", is_active: true, plan_disable_pending: true }); state.shifts.push({ ...active, id: "pending-active", location_id: "pending" }); }
    if (mode === "duplicate") state.shifts.push({ ...active, id: "duplicate-active" });
    if (mode === "no-register") state.branches = [];
    this.calls = []; this.refreshes = 0; this.prints = 0; this.failNext = false; this.hold = false;
    this.holdBranch = false; this.setHeader(mode === "no-branch" ? "" : mode === "all" ? "all" : "branch");
    update?.({ ...state });
  },
};
declare global { interface Window { registerFixture: typeof controls; } }
window.registerFixture = controls;
window.print = () => { controls.prints++; };
const router = { refresh() { controls.refreshes++; update({ ...state }); } };
export function useRouter() { return router; }

async function record(action: string, data: FormData) {
  controls.calls.push({ action, fields: Object.fromEntries(data) });
  if (controls.hold) await new Promise<void>(resolve => { controls.release = resolve; });
  if (controls.failNext) { controls.failNext = false; throw new Error("Fixture save failed. Retry."); }
}
export async function openRegisterShift(data: FormData) {
  await record("opening", data);
  state = { ...state, shifts: [{ ...active, id: "fixture-opened", location_id: String(data.get("locationId")), opening_cash: Number(data.get("openingCash")), opening_note: String(data.get("note")) }, ...state.shifts] };
}
export async function addCashMovement(data: FormData) {
  await record("movement", data);
  state = { ...state, movements: [{
    id: "fixture-movement-" + controls.calls.length, shift_id: String(data.get("shiftId")),
    movement_type: String(data.get("type")), amount: Number(data.get("amount")),
    reason: [data.get("reason"), data.get("note")].filter(Boolean).join(" — "),
    reference: String(data.get("reference")), created_by: "cashier", created_at: "2026-10-09T07:00:00Z",
  }, ...state.movements] };
}
export async function closeRegisterShift(data: FormData) {
  await record("closing", data);
  const id = String(data.get("shiftId"));
  state = { ...state, shifts: state.shifts.map(shift => {
    if (shift.id !== id) return shift;
    const summary = totals(shift, state.movements, state.orders);
    const counted = Number(data.get("closingCash"));
    return { ...shift, status: "closed", closed_at: "2026-10-09T10:00:00Z", closing_cash: counted,
      expected_cash: summary.expected, variance: Math.round((counted - summary.expected) * 100) / 100,
      closing_note: String(data.get("note")), register_summary: summary };
  }) };
}
controls.reset(new URLSearchParams(location.search).get("state") || "open");
function Fixture() {
  const [current, setCurrent] = useState(state);
  const [context, setContext] = useState(header);
  useEffect(() => { update = setCurrent; updateHeader = setContext; }, []);
  return <LanguageProvider initialLanguage={new URLSearchParams(location.search).get("lang") === "km" ? "km" : "en"}>
    <div className="workspace-theme min-h-screen bg-slate-50 p-3 sm:p-6">
      <div className="workspace-content mx-auto max-w-6xl">
        <header className="mb-4 flex flex-wrap items-center gap-3" data-fixture-header><span data-header-branch>{context.branchId || "No branch"}</span>{branches.map(branch => <button key={branch.id} type="button" disabled={context.changing} className="min-h-11 rounded-lg border bg-white px-3" onClick={() => { if (!window.confirm("Switch workspace? Unsaved changes will be discarded.")) return; if (controls.beginSwitch(branch.id) && !controls.holdBranch) setTimeout(() => controls.loadBranch(branch.id), 40); }}>Switch to {branch.name}</button>)}</header>
        <HeaderContext.Provider value={context}>
        <RegisterClient {...current} names={{ cashier: "Sok Dara" }} />
        </HeaderContext.Provider>
        <a href="/elsewhere" className="mt-4 block text-sm text-blue-600">Fixture navigation</a>
      </div>
    </div>
  </LanguageProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
