import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import PrintButton from "./print-button";

type OrderItem = {
  id: string;
  product_name: string;
  sku: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

type ReceiptCustomer = {
  name: string;
  phone: string | null;
  address: string | null;
};
type Order = {
  id: string;
  order_number: string;
  customers:
  | ReceiptCustomer
  | ReceiptCustomer[]
  | null;
  subtotal: number;
  discount: number;
  total: number;
  payment_method: string;
  amount_paid: number;
  change_amount: number;
  status: string;
  created_at: string;
  order_items: OrderItem[];
};

type OrderDetailsPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function OrderDetailsPage({
  params,
}: OrderDetailsPageProps) {
  const { id } = await params;

  const supabase = await createClient();

  const { data, error } = await supabase
  .from("orders")
  .select(`
    id,
    order_number,
    subtotal,
    discount,
    total,
    payment_method,
    amount_paid,
    change_amount,
    status,
    created_at,
    customers (
      name,
      phone,
      address
    ),
    order_items (
      id,
      product_name,
      sku,
      quantity,
      unit_price,
      subtotal
    )
  `)
  .eq("id", id)
  .single();

  if (error || !data) {
    notFound();
  }

  const order = data as unknown as Order;
  const receiptCustomer = Array.isArray(
  order.customers,
)
  ? order.customers[0] ?? null
  : order.customers;

  return (
    <main>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/dashboard/orders"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-blue-600"
        >
          <ArrowLeft size={18} />
          Back to orders
        </Link>

        <PrintButton />
      </div>

      <section className="receipt mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="border-b border-dashed border-slate-300 pb-6 text-center">
          <h1 className="text-3xl font-bold text-slate-900">
            POS System
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Sales Receipt
          </p>
        </div>

        <div className="grid gap-3 border-b border-dashed border-slate-300 py-6 text-sm sm:grid-cols-2">
          <ReceiptRow
            label="Order number"
            value={order.order_number}
          />

          <ReceiptRow
            label="Date"
            value={formatDate(order.created_at)}
          />

          <ReceiptRow
            label="Payment"
            value={formatPaymentMethod(
              order.payment_method,
            )}
          />

          <ReceiptRow
            label="Status"
            value={order.status}
          />
          <ReceiptRow
  label="Customer"
  value={receiptCustomer?.name ?? "Walk-in customer"}
/>

{receiptCustomer?.phone && (
  <ReceiptRow
    label="Phone"
    value={receiptCustomer.phone}
  />
)}
        </div>

        <div className="py-6">
          <div className="hidden grid-cols-[1fr_70px_100px_100px] gap-3 border-b border-slate-200 pb-3 text-xs font-bold uppercase text-slate-500 sm:grid">
            <span>Product</span>
            <span className="text-center">Qty</span>
            <span className="text-right">Price</span>
            <span className="text-right">Total</span>
          </div>

          <div className="divide-y divide-slate-200">
            {order.order_items.map((item) => (
              <div
                key={item.id}
                className="grid gap-2 py-4 sm:grid-cols-[1fr_70px_100px_100px] sm:items-center sm:gap-3"
              >
                <div>
                  <p className="font-semibold text-slate-900">
                    {item.product_name}
                  </p>

                  {item.sku && (
                    <p className="mt-1 text-xs text-slate-500">
                      SKU: {item.sku}
                    </p>
                  )}
                </div>

                <p className="text-sm text-slate-600 sm:text-center">
                  <span className="sm:hidden">Qty: </span>
                  {item.quantity}
                </p>

                <p className="text-sm text-slate-600 sm:text-right">
                  <span className="sm:hidden">Price: </span>
                  ${Number(item.unit_price).toFixed(2)}
                </p>

                <p className="font-semibold text-slate-900 sm:text-right">
                  <span className="sm:hidden">Total: </span>
                  ${Number(item.subtotal).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="ml-auto max-w-sm space-y-3 border-t border-dashed border-slate-300 pt-6">
          <TotalRow
            label="Subtotal"
            value={order.subtotal}
          />

          <TotalRow
            label="Discount"
            value={order.discount}
          />

          <div className="flex items-center justify-between border-y border-dashed border-slate-300 py-4 text-xl font-bold">
            <span>Total</span>
            <span>${Number(order.total).toFixed(2)}</span>
          </div>

          <TotalRow
            label="Amount paid"
            value={order.amount_paid}
          />

          <TotalRow
            label="Change"
            value={order.change_amount}
          />
        </div>

        <div className="mt-8 border-t border-dashed border-slate-300 pt-6 text-center">
          <p className="font-semibold text-slate-900">
            Thank you for your purchase
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Please keep this receipt for your records.
          </p>
        </div>
      </section>
    </main>
  );
}

function ReceiptRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className="mt-1 font-medium capitalize text-slate-800">
        {value}
      </p>
    </div>
  );
}

function TotalRow({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>

      <span className="font-semibold text-slate-900">
        ${Number(value).toFixed(2)}
      </span>
    </div>
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