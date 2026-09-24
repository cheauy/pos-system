import { getViewingBranchId } from "@/lib/branches/context";
import ViewBranchSelect from "@/components/view-branch-select";
import NavigationForm from "@/components/navigation-form";
import {soldVariant} from "@/lib/analytics/product-variants";
import {DonutBreakdown} from "@/components/analytics-charts";
import Link from "next/link";
import {
  requirePermission,
} from "@/lib/auth/require-permission";
import {
  Banknote,
  CalendarDays,
  CircleDollarSign,
  PackageCheck,
  ReceiptText,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import ReportCharts from "./report-charts";
import { createClient } from "@/lib/supabase/server";

type ReportPageProps = {
  searchParams: Promise<{
    branch?: string;
    range?: string;
    from?: string;
    to?: string;
  }>;
};

type OrderItem = {
  variant_label:string|null;
  products:{size:string|null;color:string|null}|null;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  cost_price: number;
  subtotal: number;
};

type Order = {
  id: string;
  order_number: string;
  total: number;
  status: string;
  payment_method: string | null;
  amount_paid: number | null;
  credit_amount: number | null;
  created_at: string;
  order_items: OrderItem[];
};

type Expense = {
  id: string;
  category: string;
  description: string;
  amount: number;
  expense_date: string;
};

type TopProduct = {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
  cost: number;
  profit: number;
};



export default async function ReportsPage({
  searchParams,
}: ReportPageProps) {
  const params = await searchParams;

  const selectedRange = params.range ?? "yesterday";
  const business = await requirePermission(
    "reports.view",
  );
  const dateRange = getDateRange(
    selectedRange,
    params.from,
    params.to,
  );

  

  const supabase = await createClient();

  const { data: branches, error: branchError } = await supabase.from("business_locations").select("id,name").eq("business_id", business.id).order("name");
  if (branchError) throw new Error("Unable to load report branches.");
  const viewingBranchId = await getViewingBranchId(params.branch);
  const branch = branches?.find(item => item.id === viewingBranchId);
  if (viewingBranchId && !branch) throw new Error("Branch does not belong to this business.");
  const ordersQuery = supabase
    .from("orders")
    .select(`
      id,
      order_number,
      total,
      status,
      payment_method,
      amount_paid,
      credit_amount,
      created_at,
      order_items (
        variant_label,
        products(size,color),
        product_id,
        product_name,
        quantity,
        unit_price,
        cost_price,
        subtotal
      )
    `)
    .eq("business_id", business.id)
    .eq("status", "completed")
    .gte("created_at", dateRange.startIso)
    .lte("created_at", dateRange.endIso)
    .order("created_at", {
      ascending: false,
    });

  const expensesQuery = supabase
    .from("expenses")
    .select(`
      id,
      category,
      description,
      amount,
      expense_date
    `)
    .eq("business_id", business.id)
    .gte("expense_date", dateRange.startDate)
    .lte("expense_date", dateRange.endDate)
    .order("expense_date", {
      ascending: false,
    });

  if (branch) { ordersQuery.eq("location_id", branch.id); expensesQuery.eq("location_id", branch.id); }
  const [
    { data: orderData, error: orderError },
    { data: expenseData, error: expenseError },
  ] = await Promise.all([
    ordersQuery,
    expensesQuery,
  ]);

  if (orderError || expenseError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
        {orderError?.message ||
          expenseError?.message ||
          "Unable to load reports."}
      </div>
    );
  }

  const orders = (orderData ?? []) as unknown as Order[];
  const expenses = (expenseData ?? []) as Expense[];

  const totalRevenue = orders.reduce(
    (sum, order) => sum + Number(order.total),
    0,
  );

  const totalCost = orders.reduce(
    (orderSum, order) => {
      const orderCost = (order.order_items ?? []).reduce(
        (itemSum, item) =>
          itemSum +
          Number(item.cost_price) *
            Number(item.quantity),
        0,
      );

      return orderSum + orderCost;
    },
    0,
  );

  const grossProfit = totalRevenue - totalCost;

  const totalExpenses = expenses.reduce(
    (sum, expense) =>
      sum + Number(expense.amount),
    0,
  );

  const netProfit = grossProfit - totalExpenses;

  const averageOrderValue =
    orders.length > 0
      ? totalRevenue / orders.length
      : 0;

  const profitMargin =
    totalRevenue > 0
      ? (grossProfit / totalRevenue) * 100
      : 0;

  const topProducts = calculateTopProducts(orders);

  const paymentBreakdown = orders.reduce<Record<string, number>>(
    (result, order) => {
      const key = order.payment_method || "unknown";
      result[key] = (result[key] ?? 0) + Number(order.total);
      return result;
    },
    {},
  );

  const paymentCounts=orders.reduce<Record<string,number>>((all,order)=>{const method=order.payment_method||"unknown";all[method]=(all[method]||0)+1;return all;},{});
  const dailySales = calculateDailySales(
    orders,
    dateRange.startDate,
    dateRange.endDate,
  );
  const expenseCategories =
  calculateExpenseCategories(expenses);

 

  return (
    <main>
      <div className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            Reports
          </h1>

          <p className="mt-1 text-slate-500">
            Review sales, expenses and business profit
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3"><ViewBranchSelect branches={branches ?? []} branchId={branch?.id ?? ""}/>
</div>
      </div>

      <ReportFilters
        branches={branches ?? []}
        branchId={branch?.id ?? ""}
        selectedRange={selectedRange}
        from={dateRange.startDate}
        to={dateRange.endDate}
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Revenue"
          value={formatCurrency(totalRevenue)}
          description={`${orders.length} completed orders`}
          icon={<CircleDollarSign size={22} />}
          iconClass="bg-blue-50 text-blue-600"
        />

        <SummaryCard
          title="Cost of Goods"
          value={formatCurrency(totalCost)}
          description="Product purchase cost"
          icon={<PackageCheck size={22} />}
          iconClass="bg-amber-50 text-amber-600"
        />

        <SummaryCard
          title="Gross Profit"
          value={formatCurrency(grossProfit)}
          description={`${profitMargin.toFixed(1)}% margin`}
          icon={<TrendingUp size={22} />}
          iconClass="bg-emerald-50 text-emerald-600"
        />

        <SummaryCard
          title="Expenses"
          value={formatCurrency(totalExpenses)}
          description={`${expenses.length} expense records`}
          icon={<TrendingDown size={22} />}
          iconClass="bg-red-50 text-red-600"
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Net Profit"
          value={formatCurrency(netProfit)}
          description="Gross profit minus expenses"
          icon={<Banknote size={22} />}
          iconClass={
            netProfit >= 0
              ? "bg-green-50 text-green-600"
              : "bg-red-50 text-red-600"
          }
        />

        <SummaryCard
          title="Total Orders"
          value={orders.length.toString()}
          description="Completed orders"
          icon={<ShoppingCart size={22} />}
          iconClass="bg-violet-50 text-violet-600"
        />

        <SummaryCard
          title="Average Order"
          value={formatCurrency(averageOrderValue)}
          description="Average revenue per order"
          icon={<ReceiptText size={22} />}
          iconClass="bg-cyan-50 text-cyan-600"
        />

        <SummaryCard
          title="Report Period"
          value={`${formatShortDate(
            dateRange.startDate,
          )} – ${formatShortDate(
            dateRange.endDate,
          )}`}
          description={getRangeLabel(selectedRange)}
          icon={<CalendarDays size={22} />}
          iconClass="bg-slate-100 text-slate-600"
          smallValue
        />
      </div>
      <div className="mt-6">
  <ReportCharts
    dailySales={dailySales}
    topProducts={topProducts}
    expenseCategories={expenseCategories}
  />
</div>

      <div className="mt-5 grid items-start gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-slate-900">Payment Breakdown</h2><p className="mt-1 text-sm text-slate-500">Sales value by the recorded payment method</p><DonutBreakdown rows={Object.entries(paymentBreakdown).map(([label,value])=>({label:label.replaceAll("_"," "),value}))}/></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-slate-900">Sales by Payment Method</h2><p className="mt-1 text-sm text-slate-500">Completed order count by payment method</p><DonutBreakdown count rows={Object.entries(paymentCounts).map(([label,value])=>({label:label.replaceAll("_"," "),value}))}/></section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
       
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5">
            <h2 className="text-xl font-semibold text-slate-900">
              Profit Summary
            </h2>
          </div>

          <div className="space-y-4 p-6">
            <ProfitRow
              label="Sales Revenue"
              value={totalRevenue}
            />

            <ProfitRow
              label="Cost of Goods Sold"
              value={-totalCost}
            />

            <div className="border-t border-slate-200 pt-4">
              <ProfitRow
                label="Gross Profit"
                value={grossProfit}
                emphasized
              />
            </div>

            <ProfitRow
              label="Business Expenses"
              value={-totalExpenses}
            />

            <div className="border-t border-slate-200 pt-4">
              <ProfitRow
                label="Net Profit"
                value={netProfit}
                emphasized
              />
            </div>
          </div>
        </section>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5">
            <h2 className="text-xl font-semibold text-slate-900">
              Expense Breakdown
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Expenses grouped by category
            </p>
          </div>

          {expenses.length === 0 ? (
            <EmptyState message="No expenses found." />
          ) : (
            <div className="divide-y divide-slate-200">
              {expenseCategories.map((category) => {
                const percentage =
                  totalExpenses > 0
                    ? (category.amount /
                        totalExpenses) *
                      100
                    : 0;

                return (
                  <div
                    key={category.name}
                    className="px-6 py-5"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {category.name}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          {category.count} records
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="font-bold text-red-600">
                          {formatCurrency(
                            category.amount,
                          )}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          {percentage.toFixed(1)}%
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-orange-500"
                        style={{
                          width: `${percentage}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function ReportFilters({
  branchId, selectedRange,
  from,
  to,
}: {
  branches: { id: string; name: string }[];
  branchId: string;
  selectedRange: string;
  from: string;
  to: string;
}) {
  const ranges = [
    {
      value: "today",
      label: "Today",
    },
    {
      value: "yesterday",
      label: "Yesterday",
    },
    {
      value: "week",
      label: "This Week",
    },
    {
      value: "month",
      label: "This Month",
    },
    {
      value: "year",
      label: "This Year",
    },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex flex-wrap gap-2">
          {ranges.map((range) => (
            <Link
              key={range.value}
              href={`/dashboard/reports?range=${range.value}${`&branch=${encodeURIComponent(branchId || "all")}`}`}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                selectedRange === range.value
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {range.label}
            </Link>
          ))}
        </div>

        <NavigationForm className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <input type="hidden" name="branch" value={branchId || "all"}/>
          <input
            type="hidden"
            name="range"
            value="custom"
          />

          <label className="text-sm font-medium text-slate-600">
            From

            <input
              type="date"
              name="from"
              defaultValue={from}
              required
              className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
            />
          </label>

          <label className="text-sm font-medium text-slate-600">
            To

            <input
              type="date"
              name="to"
              defaultValue={to}
              required
              className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
            />
          </label>

          <button
            type="submit"
            className="rounded-xl bg-slate-900 px-5 py-2.5 font-semibold text-white transition hover:bg-slate-700"
          >
            Apply
          </button>
        </NavigationForm>
      </div>
    </section>
  );
}

function SummaryCard({
  title,
  value,
  description,
  icon,
  iconClass,
  smallValue = false,
}: {
  title: string;
  value: string;
  description: string;
  icon: React.ReactNode;
  iconClass: string;
  smallValue?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">
            {title}
          </p>

          <p
            className={`mt-2 font-bold text-slate-900 ${
              smallValue
                ? "text-base"
                : "text-2xl"
            }`}
          >
            {value}
          </p>

          <p className="mt-2 text-xs text-slate-500">
            {description}
          </p>
        </div>

        <div
          className={`rounded-xl p-3 ${iconClass}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function ProfitRow({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: number;
  emphasized?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <p
        className={
          emphasized
            ? "font-bold text-slate-900"
            : "text-sm text-slate-600"
        }
      >
        {label}
      </p>

      <p
        className={`font-semibold ${
          value < 0
            ? "text-red-600"
            : "text-slate-900"
        } ${
          emphasized ? "text-lg" : "text-sm"
        }`}
      >
        {value < 0 ? "-" : ""}
        {formatCurrency(Math.abs(value))}
      </p>
    </div>
  );
}

function EmptyState({
  message,
}: {
  message: string;
}) {
  return (
    <div className="p-12 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

function calculateTopProducts(
  orders: Order[],
): TopProduct[] {
  const groupedProducts = new Map<
    string,
    TopProduct
  >();

  for (const order of orders) {
    for (const item of order.order_items ?? []) {
      const variant=soldVariant(item);
      const productId = variant.key;

      const existingProduct =
        groupedProducts.get(productId);

      const quantity = Number(item.quantity);
      const revenue = Number(item.subtotal);
      const cost =
        Number(item.cost_price) * quantity;

      if (existingProduct) {
        existingProduct.quantity += quantity;
        existingProduct.revenue += revenue;
        existingProduct.cost += cost;
        existingProduct.profit +=
          revenue - cost;
      } else {
        groupedProducts.set(productId, {
          productId,
          name: variant.label,
          quantity,
          revenue,
          cost,
          profit: revenue - cost,
        });
      }
    }
  }

  return Array.from(
    groupedProducts.values(),
  ).sort(
    (first, second) =>
      second.quantity - first.quantity,
  );
}

function calculateExpenseCategories(
  expenses: Expense[],
) {
  const categories = new Map<
    string,
    {
      name: string;
      amount: number;
      count: number;
    }
  >();

  for (const expense of expenses) {
    const existing = categories.get(
      expense.category,
    );

    if (existing) {
      existing.amount += Number(expense.amount);
      existing.count += 1;
    } else {
      categories.set(expense.category, {
        name: expense.category,
        amount: Number(expense.amount),
        count: 1,
      });
    }
  }

  return Array.from(categories.values()).sort(
    (first, second) =>
      second.amount - first.amount,
  );
}

function calculateDailySales(
  orders: Order[],
  startDate: string,
  endDate: string,
) {
  const salesByDate = new Map<
    string,
    {
      revenue: number;
      profit: number;
    }
  >();

  for (const order of orders) {
    const date = order.created_at.slice(0, 10);

    const orderCost = (
      order.order_items ?? []
    ).reduce(
      (sum, item) =>
        sum +
        Number(item.cost_price) *
          Number(item.quantity),
      0,
    );

    const orderRevenue = Number(order.total);
    const orderProfit =
      orderRevenue - orderCost;

    const existing = salesByDate.get(date);

    if (existing) {
      existing.revenue += orderRevenue;
      existing.profit += orderProfit;
    } else {
      salesByDate.set(date, {
        revenue: orderRevenue,
        profit: orderProfit,
      });
    }
  }

  const dates: {
    date: string;
    revenue: number;
    profit: number;
  }[] = [];

  const currentDate = new Date(
    `${startDate}T00:00:00`,
  );

  const lastDate = new Date(
    `${endDate}T00:00:00`,
  );

  while (currentDate <= lastDate) {
    const date = getLocalDateString(currentDate);

    const sale = salesByDate.get(date);

    dates.push({
      date,
      revenue: sale?.revenue ?? 0,
      profit: sale?.profit ?? 0,
    });

    currentDate.setDate(
      currentDate.getDate() + 1,
    );
  }

  if (dates.length > 40) {
    const interval = Math.ceil(
      dates.length / 31,
    );

    return dates.filter(
      (_, index) => index % interval === 0,
    );
  }

  return dates;
}
function getDateRange(
  range: string,
  customFrom?: string,
  customTo?: string,
) {
  const now = new Date();

  let start = startOfDay(now);
  let end = endOfDay(now);

  if (
    range === "custom" &&
    isValidDate(customFrom) &&
    isValidDate(customTo)
  ) {
    start = startOfDay(
      new Date(`${customFrom}T00:00:00`),
    );

    end = endOfDay(
      new Date(`${customTo}T00:00:00`),
    );
  } else if (range === "yesterday") {
    const yesterday = new Date(now);

    yesterday.setDate(yesterday.getDate() - 1);

    start = startOfDay(yesterday);
    end = endOfDay(yesterday);
  } else if (range === "week") {
    start = startOfWeek(now);
    end = endOfDay(now);
  } else if (range === "year") {
    start = new Date(
      now.getFullYear(),
      0,
      1,
      0,
      0,
      0,
      0,
    );

    end = endOfDay(now);
  } else if (range === "month") {
    start = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );

    end = endOfDay(now);
  }

  if (start > end) {
    const oldStart = start;
    start = startOfDay(end);
    end = endOfDay(oldStart);
  }

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    startDate: getLocalDateString(start),
    endDate: getLocalDateString(end),
  };
}

function startOfWeek(date: Date) {
  const result = startOfDay(date);

  const day = result.getDay();

  const daysSinceMonday =
    day === 0 ? 6 : day - 1;

  result.setDate(
    result.getDate() - daysSinceMonday,
  );

  return result;
}

function startOfDay(date: Date) {
  const result = new Date(date);

  result.setHours(0, 0, 0, 0);

  return result;
}

function endOfDay(date: Date) {
  const result = new Date(date);

  result.setHours(23, 59, 59, 999);

  return result;
}

function isValidDate(value?: string) {
  if (!value) {
    return false;
  }

  return !Number.isNaN(
    new Date(`${value}T00:00:00`).getTime(),
  );
}

function getRangeLabel(range: string) {
  const labels: Record<string, string> = {
    today: "Today",
    yesterday: "Yesterday",
    week: "This Week",
    month: "This Month",
    year: "This Year",
    custom: "Custom Range",
  };

  return labels[range] ?? "This Month";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
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
