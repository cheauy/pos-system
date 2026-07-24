import { notFound } from "next/navigation";

import OrderReceipt from "@/components/receipts/order-receipt";
import { getReceiptSettings } from "@/lib/settings/get-receipt-settings";
import { supabaseAdmin } from "@/lib/supabase/admin";


type ReceiptPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ReceiptPage({
  params,
}: ReceiptPageProps) {
  const { id } = await params;

  const [settings, orderResult] = await Promise.all([
    getReceiptSettings(),

    supabaseAdmin
      .from("orders")
      .select(`
        id,
        order_number,
        created_at,
        subtotal,
        discount_amount,
        tax_amount,
        total,
        paid_amount,
        change_amount,
        customer:customers (
          full_name
        ),
        cashier:profiles (
          full_name
        ),
        items:order_items (
          id,
          quantity,
          unit_price,
          subtotal,
          product:products (
            name
          )
        )
      `)
      .eq("id", id)
      .single(),
  ]);

  if (orderResult.error || !orderResult.data) {
    notFound();
  }

  const data = orderResult.data;

const customer = data.customer?.[0] ?? null;
const cashier = data.cashier?.[0] ?? null;

const order = {
  order_number: data.order_number,
  created_at: data.created_at,

  subtotal: Number(data.subtotal ?? 0),
  discount_amount: Number(
    data.discount_amount ?? 0,
  ),
  tax_amount: Number(data.tax_amount ?? 0),
  total: Number(data.total ?? 0),

  paid_amount:
    data.paid_amount == null
      ? null
      : Number(data.paid_amount),

  change_amount:
    data.change_amount == null
      ? null
      : Number(data.change_amount),

  customer_name:
    customer?.full_name ?? null,

  cashier_name:
    cashier?.full_name ?? null,

  items: data.items.map((item) => {
    const product = item.product?.[0] ?? null;

    return {
      id: item.id,
      product_name:
        product?.name ?? "Unknown product",
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      subtotal: Number(item.subtotal),
    };
  }),
};



  return (
    <div className="space-y-6">
      <OrderReceipt
        order={order}
        settings={settings}
      />
    </div>
  );
}