import {
  CalendarDays,
  CircleDollarSign,
  Receipt,
  Trash2,
  WalletCards,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";

import {
  createExpense,
  deleteExpense,
} from "@/app/(dashboard)/dashboard/expenses/actions";

type Expense = {
  id: string;
  category: string;
  description: string;
  amount: number;
  expense_date: string;
  created_at: string;
};

export default async function ExpensesPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("expenses")
    .select(`
      id,
      category,
      description,
      amount,
      expense_date,
      created_at
    `)
    .order("expense_date", {
      ascending: false,
    })
    .order("created_at", {
      ascending: false,
    });

  const expenses = (data ?? []) as Expense[];

  const today = getLocalDateString(new Date());

  const currentMonth = today.slice(0, 7);

  const totalExpenses = expenses.reduce(
    (sum, expense) =>
      sum + Number(expense.amount),
    0,
  );

  const todayExpenses = expenses
    .filter(
      (expense) =>
        expense.expense_date === today,
    )
    .reduce(
      (sum, expense) =>
        sum + Number(expense.amount),
      0,
    );

  const monthExpenses = expenses
    .filter((expense) =>
      expense.expense_date.startsWith(
        currentMonth,
      ),
    )
    .reduce(
      (sum, expense) =>
        sum + Number(expense.amount),
      0,
    );

  return (
    <main>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">
          Expenses
        </h1>

        <p className="mt-1 text-slate-500">
          Record and track business expenses
        </p>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <SummaryCard
          title="Today's Expenses"
          value={formatCurrency(todayExpenses)}
          icon={<CalendarDays size={22} />}
        />

        <SummaryCard
          title="This Month"
          value={formatCurrency(monthExpenses)}
          icon={<WalletCards size={22} />}
        />

        <SummaryCard
          title="Total Expenses"
          value={formatCurrency(totalExpenses)}
          icon={<CircleDollarSign size={22} />}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[390px_1fr]">
        <section className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-orange-50 p-3 text-orange-600">
              <Receipt size={22} />
            </div>

            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                Add Expense
              </h2>

              <p className="text-sm text-slate-500">
                Record a business payment
              </p>
            </div>
          </div>

          <form
            action={createExpense}
            className="mt-6 space-y-5"
          >
            <FormField
              label="Category"
              htmlFor="category"
            >
              <select
                id="category"
                name="category"
                required
                defaultValue=""
                className={inputClass}
              >
                <option value="" disabled>
                  Select category
                </option>

                <option value="Rent">
                  Rent
                </option>

                <option value="Salary">
                  Salary
                </option>

                <option value="Utilities">
                  Utilities
                </option>

                <option value="Transport">
                  Transport
                </option>

                <option value="Marketing">
                  Marketing
                </option>

                <option value="Maintenance">
                  Maintenance
                </option>

                <option value="Supplies">
                  Supplies
                </option>

                <option value="Tax">
                  Tax
                </option>

                <option value="Other">
                  Other
                </option>
              </select>
            </FormField>

            <FormField
              label="Description"
              htmlFor="description"
            >
              <textarea
                id="description"
                name="description"
                rows={3}
                required
                placeholder="Example: Monthly shop rent"
                className={`${inputClass} resize-none`}
              />
            </FormField>

            <FormField
              label="Amount"
              htmlFor="amount"
            >
              <input
                id="amount"
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                required
                placeholder="0.00"
                className={inputClass}
              />
            </FormField>

            <FormField
              label="Expense date"
              htmlFor="expenseDate"
            >
              <input
                id="expenseDate"
                name="expenseDate"
                type="date"
                required
                defaultValue={today}
                className={inputClass}
              />
            </FormField>

            <button
              type="submit"
              className="w-full rounded-xl bg-orange-600 px-5 py-3 font-semibold text-white transition hover:bg-orange-700"
            >
              Save Expense
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5">
            <h2 className="text-xl font-semibold text-slate-900">
              Expense History
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              {expenses.length} expense records
            </p>
          </div>

          {error ? (
            <div className="p-6 text-red-600">
              {error.message}
            </div>
          ) : expenses.length === 0 ? (
            <div className="p-12 text-center">
              <Receipt
                size={44}
                className="mx-auto text-slate-300"
              />

              <p className="mt-4 font-medium text-slate-700">
                No expenses recorded
              </p>

              <p className="mt-1 text-sm text-slate-500">
                Add your first expense using the form.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-6 py-4 font-semibold">
                      Date
                    </th>

                    <th className="px-6 py-4 font-semibold">
                      Category
                    </th>

                    <th className="px-6 py-4 font-semibold">
                      Description
                    </th>

                    <th className="px-6 py-4 text-right font-semibold">
                      Amount
                    </th>

                    <th className="px-6 py-4 text-right font-semibold">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200">
                  {expenses.map((expense) => (
                    <tr key={expense.id}>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                        {formatDate(
                          expense.expense_date,
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <span className="inline-flex rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
                          {expense.category}
                        </span>
                      </td>

                      <td className="max-w-md px-6 py-4 text-sm text-slate-700">
                        {expense.description}
                      </td>

                      <td className="whitespace-nowrap px-6 py-4 text-right font-semibold text-red-600">
                        -
                        {formatCurrency(
                          Number(expense.amount),
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <form
                          action={deleteExpense}
                          className="flex justify-end"
                        >
                          <input
                            type="hidden"
                            name="expenseId"
                            value={expense.id}
                          />

                          <button
                            type="submit"
                            aria-label={`Delete ${expense.description}`}
                            className="rounded-lg p-2 text-red-600 transition hover:bg-red-50"
                          >
                            <Trash2 size={18} />
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-orange-500 focus:ring-4 focus:ring-orange-100";

function FormField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-sm font-medium text-slate-700"
      >
        {label}
      </label>

      {children}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">
            {title}
          </p>

          <p className="mt-2 text-2xl font-bold text-slate-900">
            {value}
          </p>
        </div>

        <div className="rounded-xl bg-orange-50 p-3 text-orange-600">
          {icon}
        </div>
      </div>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function getLocalDateString(date: Date) {
  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1,
  ).padStart(2, "0");

  const day = String(date.getDate()).padStart(
    2,
    "0",
  );

  return `${year}-${month}-${day}`;
}