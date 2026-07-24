import Link from "next/link";
import {
  Eye,
  ReceiptText,
  Search,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import OrderStatusSelect from "@/components/order-status-select";


type Order = {
  id: string;
  order_number: string;
  total: number;
  payment_method: string;
  amount_paid: number;
  change_amount: number;
  status: string;
  created_at: string;
};

type OrdersPageProps = {
  searchParams: Promise<{
    search?: string;
    status?: string;
    page?: string;
    limit?: string;
  }>;
};

export default async function OrdersPage({
  searchParams,
}: OrdersPageProps) {
  const params = await searchParams;

  const search = params.search?.trim() ?? "";
  const allowedStatuses = [
  "all",
  "new",
  "pending",
  "completed",
  "cancelled",
  "refunded",
] as const;

const requestedStatus =
  params.status?.trim().toLowerCase() ?? "all";

const status = allowedStatuses.includes(
  requestedStatus as (typeof allowedStatuses)[number],
)
  ? requestedStatus
  : "all";
  const usePagination = status === "all";

  const requestedPage = Number(params.page ?? "1");
const page = Number.isFinite(requestedPage)
  ? Math.max(1, requestedPage)
  : 1;

const allowedLimits = ["10", "20", "30", "40", "50", "all"];

const limitParam = allowedLimits.includes(
  params.limit ?? "",
)
  ? params.limit!
  : "10";

const isAll = limitParam === "all";

const pageSize = isAll
  ? null
  : Number(limitParam);

const supabase = await createClient();

let query = supabase
  .from("orders")
  .select(
    `
      id,
      order_number,
      total,
      payment_method,
      amount_paid,
      change_amount,
      status,
      created_at
    `,
    {
      count: "exact",
    },
  );

// Apply search first
if (search) {
  query = query.ilike(
    "order_number",
    `%${search}%`,
  );
}

// Apply status filter
if (status !== "all") {
  query = query.eq("status", status);
}

// Apply pagination only for All tab
if (
  status === "all" &&
  !isAll &&
  pageSize !== null
) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  query = query.range(from, to);
}

// Apply ordering last
query = query.order("created_at", {
  ascending: false,
});

// Execute only after all filters
const {
  data,
  error,
  count,
} = await query;

const orders = (data ?? []) as Order[];

  const totalOrders = count ?? 0;

const totalPages =
  !usePagination ||
  isAll ||
  pageSize === null
    ? 1
    : Math.max(
        1,
        Math.ceil(totalOrders / pageSize),
      );

const currentPage = Math.min(
  page,
  totalPages,
);

const firstShown =
  totalOrders === 0
    ? 0
    : !usePagination ||
        isAll ||
        pageSize === null
      ? 1
      : (currentPage - 1) *
          pageSize +
        1;

const lastShown =
  totalOrders === 0
    ? 0
    : !usePagination ||
        isAll ||
        pageSize === null
      ? totalOrders
      : Math.min(
          currentPage * pageSize,
          totalOrders,
        );

  const totalSales = orders
    .filter((order) => order.status === "completed")
    .reduce(
      (sum, order) => sum + Number(order.total),
      0,
    );

  return (
    <main>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">
          Orders
        </h1>

        <p className="mt-1 text-slate-500">
          Review all orders detail and print receipts
        </p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <SummaryCard
          title="Orders shown"
          value={orders.length}
        />

        <SummaryCard
          title="Completed sales"
          value={`$${totalSales.toFixed(2)}`}
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
         <div className="space-y-4">
  <form className="flex gap-3">
    <div className="relative flex-1">
      <Search
        size={19}
        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
      />

      <input
        name="search"
        type="search"
        defaultValue={search}
        placeholder="Search order number"
        className="w-full rounded-xl border border-slate-300 py-3 pl-11 pr-4 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
      />

      {status !== "all" && (
        <input
          type="hidden"
          name="status"
          value={status}
        />
      )}
      <input
  type="hidden"
  name="limit"
  value={limitParam}
/>
    </div>

    <button
      type="submit"
      className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700"
    >
      Search
    </button>
  </form>

  <div className="flex flex-wrap gap-2">
    <StatusFilterButton
  label="All"
  value="all"
  active={status === "all"}
  search={search}
  limit={limitParam}
/>

    <StatusFilterButton
      label="New"
      value="new"
      active={status === "new"}
      search={search}
      limit={limitParam}
    />

       <StatusFilterButton
      label="Pending"
      value="pending"
      active={status === "pending"}
      search={search}
      limit={limitParam}
    />

    <StatusFilterButton
      label="Completed"
      value="completed"
      active={status === "completed"}
      search={search}
      limit={limitParam}
    />

    <StatusFilterButton
      label="Cancelled"
      value="cancelled"
      active={status === "cancelled"}
      search={search}
      limit={limitParam}
    />

    <StatusFilterButton
      label="Refunded"
      value="refunded"
      active={status === "refunded"}
      search={search}
      limit={limitParam}
    />
  </div>
</div>
        </div>

        {error ? (
          <div className="p-6 text-red-600">
            {error.message}
          </div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center">
            <ReceiptText
              size={44}
              className="mx-auto text-slate-300"
            />

            <p className="mt-4 font-medium text-slate-700">
              No orders found
            </p>

            <p className="mt-1 text-sm text-slate-500">
              Complete a sale from the POS screen first.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-6 py-4 font-semibold">
                    Order
                  </th>

                  <th className="px-6 py-4 font-semibold">
                    Date
                  </th>

                  <th className="px-6 py-4 font-semibold">
                    Payment
                  </th>

                  <th className="px-6 py-4 font-semibold">
                    Total
                  </th>

                  <th className="px-6 py-4 font-semibold">
                    Status
                  </th>

                  <th className="px-6 py-4 text-right font-semibold">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-slate-50"
                  >
                    <td className="px-6 py-4">
                      <p className="font-semibold text-slate-900">
                        {order.order_number}
                      </p>
                    </td>

                    <td className="px-6 py-4 text-sm text-slate-600">
                      {formatDate(order.created_at)}
                    </td>

                    <td className="px-6 py-4">
                      <p className="text-sm font-medium capitalize text-slate-700">
                        {formatPaymentMethod(
                          order.payment_method,
                        )}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        Paid: $
                        {Number(
                          order.amount_paid,
                        ).toFixed(2)}
                      </p>
                    </td>

                    <td className="px-6 py-4 font-bold text-slate-900">
                      ${Number(order.total).toFixed(2)}
                    </td>

                    <td className="px-6 py-4">
                                <OrderStatusSelect
                                  orderId={order.id}
                                  status={
                                    order.status as
                                      | "new"
                                      | "pending"
                                      | "completed"
                                      | "cancelled"
                                      | "refunded"
                                  }
                                />
                              </td>

                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/dashboard/orders/${order.id}`}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-100"
                      >
                        <Eye size={17} />
                        View
                      </Link>
                    </td>
                    
                  </tr>
                ))}
              </tbody>
            </table>
{status === "all" && (
  <div className="flex flex-col gap-4 border-t border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
    <p className="text-sm text-slate-500">
      Showing{" "}
      <span className="font-semibold text-slate-700">
        {firstShown}
      </span>{" "}
      to{" "}
      <span className="font-semibold text-slate-700">
        {lastShown}
      </span>{" "}
      of{" "}
      <span className="font-semibold text-slate-700">
        {totalOrders}
      </span>{" "}
      orders
    </p>

    <div className="flex flex-wrap items-center gap-3">
      <form>
        {search && (
          <input
            type="hidden"
            name="search"
            value={search}
          />
        )}

        <label className="flex items-center gap-2 text-sm text-slate-600">
          View

          <select
            name="limit"
            defaultValue={limitParam}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2"
          >
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="30">30</option>
            <option value="40">40</option>
            <option value="50">50</option>
            <option value="all">All</option>
          </select>

          <button
            type="submit"
            className="rounded-lg bg-slate-100 px-3 py-2 font-medium text-slate-700 hover:bg-slate-200"
          >
            Apply
          </button>
        </label>
      </form>

      {!isAll && totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          search={search}
          status={status}
          limit={limitParam}
        />
      )}
    </div>
  </div>
)}
          </div>
        )}
      </section>
    </main>
  );
}


function SummaryCard({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">
        {title}
      </p>

      <p className="mt-2 text-2xl font-bold text-slate-900">
        {value}
      </p>
    </div>
  );
}

function StatusFilterButton({
  label,
  value,
  active,
  search,
  limit,

}: {
  label: string;
  value: string;
  active: boolean;
  search: string;
  limit: string;

  

}) {
  
  const params = new URLSearchParams();
 
  if (search) {
    params.set("search", search);
  }

  if (value !== "all") {
    params.set("status", value);
  }

  if (value === "all") {
    params.set("limit", limit);
  }

  const href = params.toString()
    ? `/dashboard/orders?${params.toString()}`
    : "/dashboard/orders";

  return (
    <Link
      href={href}
      className={`rounded-xl px-5 py-2.5 text-sm font-medium transition ${
        active
          ? "bg-blue-600 text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {label}
    </Link>
  );
}

function getPageNumbers(
  currentPage: number,
  totalPages: number,
): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from(
      { length: totalPages },
      (_, index) => index + 1,
    );
  }

  if (currentPage <= 4) {
    return [
      1,
      2,
      3,
      4,
      5,
      "ellipsis",
      totalPages,
    ];
  }

  if (currentPage >= totalPages - 3) {
    return [
      1,
      "ellipsis",
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [
    1,
    "ellipsis",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "ellipsis",
    totalPages,
  ];
}

function Pagination({
  currentPage,
  totalPages,
  search,
  status,
  limit,
}: {
  currentPage: number;
  totalPages: number;
  search: string;
  status: string;
  limit: string;
}) {
  const createHref = (page: number) => {
    const params = new URLSearchParams();

    if (search) {
      params.set("search", search);
    }

    if (status !== "all") {
      params.set("status", status);
    }

    params.set("limit", limit);
    params.set("page", String(page));

    return `/dashboard/orders?${params.toString()}`;
  };

  const pageNumbers = getPageNumbers(
    currentPage,
    totalPages,
  );

  return (
    <nav className="flex items-center gap-1">
      <Link
        href={createHref(
          Math.max(1, currentPage - 1),
        )}
        aria-disabled={currentPage === 1}
        className={`rounded-lg px-3 py-2 text-sm font-medium ${
          currentPage === 1
            ? "pointer-events-none bg-slate-100 text-slate-400"
            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
        }`}
      >
        Previous
      </Link>

      {pageNumbers.map((pageNumber, index) =>
        pageNumber === "ellipsis" ? (
          <span
            key={`ellipsis-${index}`}
            className="px-2 text-slate-400"
          >
            …
          </span>
        ) : (
          <Link
            key={pageNumber}
            href={createHref(pageNumber)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${
              pageNumber === currentPage
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {pageNumber}
          </Link>
        ),
      )}

      <Link
        href={createHref(
          Math.min(totalPages, currentPage + 1),
        )}
        aria-disabled={
          currentPage === totalPages
        }
        className={`rounded-lg px-3 py-2 text-sm font-medium ${
          currentPage === totalPages
            ? "pointer-events-none bg-slate-100 text-slate-400"
            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
        }`}
      >
        Next
      </Link>
    </nav>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatPaymentMethod(value: string) {
  return value.replaceAll("_", " ");
}