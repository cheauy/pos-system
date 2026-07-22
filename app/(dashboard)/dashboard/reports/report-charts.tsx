"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type DailySale = {
  date: string;
  revenue: number;
  profit: number;
};

type TopProduct = {
  name: string;
  quantity: number;
  revenue: number;
  profit: number;
};

type ExpenseCategory = {
  name: string;
  amount: number;
  count: number;
};

type ReportChartsProps = {
  dailySales: DailySale[];
  topProducts: TopProduct[];
  expenseCategories: ExpenseCategory[];
};

const pieColors = [
  "#f97316",
  "#3b82f6",
  "#10b981",
  "#8b5cf6",
  "#ef4444",
  "#06b6d4",
  "#eab308",
  "#64748b",
];

export default function ReportCharts({
  dailySales,
  topProducts,
  expenseCategories,
}: ReportChartsProps) {
  const hasDailySales = dailySales.some(
    (item) => item.revenue > 0,
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard
          title="Revenue and Profit"
          description="Daily performance for the selected period"
        >
          {!hasDailySales ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <LineChart
                data={dailySales}
                margin={{
                  top: 10,
                  right: 15,
                  left: 0,
                  bottom: 0,
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                />

                <XAxis
                  dataKey="date"
                  tickFormatter={formatChartDate}
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                />

                <YAxis
                  tickFormatter={formatCompactCurrency}
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                />

                <Tooltip
                  labelFormatter={(value) =>
                    formatFullDate(String(value))
                  }
                  formatter={(value, name) => [
                    formatCurrency(Number(value)),
                    name === "revenue"
                      ? "Revenue"
                      : "Profit",
                  ]}
                />

                <Legend />

                <Line
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke="#2563eb"
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 5 }}
                />

                <Line
                  type="monotone"
                  dataKey="profit"
                  name="Gross Profit"
                  stroke="#16a34a"
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Expense Categories"
          description="Distribution of business expenses"
        >
          {expenseCategories.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <PieChart>
                <Pie
                  data={expenseCategories}
                  dataKey="amount"
                  nameKey="name"
                  cx="50%"
                  cy="45%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                >
                  {expenseCategories.map(
                    (category, index) => (
                      <Cell
                        key={category.name}
                        fill={
                          pieColors[
                            index % pieColors.length
                          ]
                        }
                      />
                    ),
                  )}
                </Pie>

                <Tooltip
                  formatter={(value) =>
                    formatCurrency(Number(value))
                  }
                />

                <Legend
                  verticalAlign="bottom"
                  height={36}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <ChartCard
        title="Top-Selling Products"
        description="Products ranked by quantity sold"
        large
      >
        {topProducts.length === 0 ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer
            width="100%"
            height="100%"
          >
            <BarChart
              data={topProducts.slice(0, 10)}
              layout="vertical"
              margin={{
                top: 5,
                right: 30,
                left: 20,
                bottom: 5,
              }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                horizontal={false}
              />

              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
              />

              <YAxis
                dataKey="name"
                type="category"
                width={130}
                tickLine={false}
                axisLine={false}
                fontSize={12}
              />

              <Tooltip
                formatter={(value, name) => {
                  if (name === "quantity") {
                    return [
                      Number(value),
                      "Quantity",
                    ];
                  }

                  return [
                    formatCurrency(Number(value)),
                    name === "revenue"
                      ? "Revenue"
                      : "Profit",
                  ];
                }}
              />

              <Legend />

              <Bar
                dataKey="quantity"
                name="Quantity"
                fill="#2563eb"
                radius={[0, 6, 6, 0]}
              />

              <Bar
                dataKey="profit"
                name="Profit"
                fill="#16a34a"
                radius={[0, 6, 6, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}

function ChartCard({
  title,
  description,
  children,
  large = false,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  large?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-900">
          {title}
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          {description}
        </p>
      </div>

      <div className={large ? "h-[430px]" : "h-80"}>
        {children}
      </div>
    </section>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
      No data found for this period.
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatChartDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatFullDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}