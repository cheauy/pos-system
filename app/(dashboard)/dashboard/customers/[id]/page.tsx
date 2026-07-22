import Link from "next/link";
import {
  ArrowLeft,
  ReceiptText,
} from "lucide-react";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

type CustomerOrder = {
  id: string;
  order_number: string;
  total: number;
  status: string;
  created_at: string;
};

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
  orders: CustomerOrder[];
};

type CustomerPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function CustomerDetailsPage({
  params,
}: CustomerPageProps) {
  const { id } = await params;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("customers")
    .select(`
      id,
      name,
      phone,
      email,
      address,
      note,
      orders (
        id,
        order_number,
        total,
        status,
        created_at
      )
    `)
    .eq("id", id)
    .single();

  if (error || !data) {
    notFound();
  }

  const customer = data as unknown as Customer;

  const orders = [...(customer.orders ?? [])].sort(
    (first, second) =>
      new Date(second.created_at).getTime() -
      new Date(first.created_at).getTime(),
  );

  const completedOrders = orders.filter(
    (order) => order.status === "completed",
  );

  const totalSpent = completedOrders.reduce(
    (sum, order) => sum + Number(order.total),
    0,
  );

  return (
    <main>
      <Link
        href="/dashboard/customers"
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-600"
      >
        <ArrowLeft size={18} />
        Back to customers
      </Link>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <section className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">
            {customer.name}
          </h1>

          <div className="mt-6 space-y-5">
            <InformationRow
              label="Phone"
              value={customer.phone}
            />

            <InformationRow
              label="Email"
              value={customer.email}
            />

            <InformationRow
              label="Address"
              value={customer.address}
            />

            <InformationRow
              label="Note"
              value={customer.note}
            />
          </div>
        </section>

        <section>
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <SummaryCard
              title="Completed orders"
              value={completedOrders.length}
            />

            <SummaryCard
              title="Total spent"
              value={`$${totalSpent.toFixed(2)}`}
            />
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-5">
              <h2 className="text-xl font-semibold text-slate-900">
                Purchase History
              </h2>
            </div>

            {orders.length === 0 ? (
              <div className="p-12 text-center">
                <ReceiptText
                  size={42}
                  className="mx-auto text-slate-300"
                />

                <p className="mt-4 text-slate-500">
                  This customer has no orders yet.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {orders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/dashboard/orders/${order.id}`}
                    className="flex items-center justify-between gap-4 px-6 py-5 transition hover:bg-slate-50"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">
                        {order.order_number}
                      </p>

                      <p className="mt-1 text-sm text-slate-500">
                        {formatDate(order.created_at)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="font-bold text-slate-900">
                        ${Number(order.total).toFixed(2)}
                      </p>

                      <p className="mt-1 text-xs capitalize text-slate-500">
                        {order.status}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function InformationRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className="mt-1 whitespace-pre-line text-sm text-slate-700">
        {value || "—"}
      </p>
    </div>
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
      <p className="text-sm text-slate-500">{title}</p>

      <p className="mt-2 text-2xl font-bold text-slate-900">
        {value}
      </p>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}