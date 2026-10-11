// Real Expenses UI; all financial actions are isolated from the database.
import { createRoot } from "react-dom/client";
import ExpensesClient from "../../app/(dashboard)/dashboard/expenses/expenses-client";
import LanguageProvider from "../../components/providers/language-provider";
import type { Expense } from "../../app/(dashboard)/dashboard/expenses/expense-model";

const controls = { calls: [] as FormData[], hold: false, fail: false, release: () => {} };
declare global { interface Window { expenseFixture: typeof controls; } }
window.expenseFixture = controls;
export function useRouter() { return { push() {} }; }
export async function createExpense(data: FormData) {
  controls.calls.push(data);
  if (controls.hold) await new Promise<void>(resolve => { controls.release = resolve; });
  if (controls.fail) throw new Error("Unable to save expense.");
}
export async function deleteExpense() { throw new Error("Fixture deletion is disabled."); }

const query = new URLSearchParams(location.search);
const khmer = query.get("lang") === "km";
const branches = [
  { id: "branch-a", name: khmer ? "សាខាធំសម្រាប់ការធ្វើតេស្តឈ្មោះវែងនៅទីក្រុងភ្នំពេញ" : "Fixture Main Branch", is_active: true },
  { id: "branch-b", name: "Fixture Other Branch", is_active: true },
];
const expenses: Expense[] = [
  { id: "expense-a", category: "Delivery & Transport", description: "Fixture delivery", amount: 21.25, expense_date: "2026-10-10", created_at: "2026-10-10T00:00:00Z", payee: null, payment_method: "cash", reference: null, location_id: "branch-a" },
  { id: "expense-b", category: "Rent", description: "Fixture rent", amount: 80, expense_date: "2026-10-01", created_at: "2026-10-01T00:00:00Z", payee: null, payment_method: "cash", reference: null, location_id: "branch-a" },
  { id: "expense-c", category: "Rent", description: "Fixture other branch", amount: 900, expense_date: "2026-10-10", created_at: "2026-10-10T00:00:00Z", payee: null, payment_method: "cash", reference: null, location_id: "branch-b" },
  { id: "expense-d", category: "Rent", description: "Fixture previous month", amount: 500, expense_date: "2026-09-01", created_at: "2026-09-01T00:00:00Z", payee: null, payment_method: "cash", reference: null, location_id: "branch-a" },
];
createRoot(document.getElementById("root")!).render(
  <LanguageProvider initialLanguage={khmer ? "km" : "en"}>
    <div className="workspace-theme min-h-screen bg-slate-50 p-4" style={{ "--app-accent": "#a21caf" } as React.CSSProperties}>
      <div className="workspace-content mx-auto max-w-[1680px]">
        <ExpensesClient expenses={query.get("empty") ? [] : expenses} branches={query.get("inactive") ? [] : branches} today="2026-10-10" defaultBranchId="branch-a" />
      </div>
    </div>
  </LanguageProvider>,
);
