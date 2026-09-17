import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import ReturnsWorkspace, { type ReturnWorkspaceRecord } from "./returns-workspace";

type CustomerRelation =
  | { id: string; name: string; phone: string | null; email: string | null }
  | { id: string; name: string; phone: string | null; email: string | null }[]
  | null;

type OrderRelation =
  | {
      order_number: string;
      payment_method: string | null;
      customers: CustomerRelation;
    }
  | {
      order_number: string;
      payment_method: string | null;
      customers: CustomerRelation;
    }[]
  | null;

type ReturnItemRow = {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

type ReturnRow = {
  id: string;
  return_number: string;
  order_id: string;
  reason: string;
  refund_amount: number;
  created_at: string;
  status: string | null;
  return_type: string | null;
  source: string | null;
  refund_method: string | null;
  restock_status: string | null;
  import_product_name: string | null;
  import_quantity: number | null;
  orders: OrderRelation;
  return_items: ReturnItemRow[] | null;
};

export default async function ReturnsPage() {
  const business = await requirePermission("orders.view");
  const supabase = await createClient();

  const [returnsResult, ordersCountResult, storefrontResult] = await Promise.all([
    supabase
      .from("returns")
      .select(`
        id,
        return_number,
        order_id,
        reason,
        refund_amount,
        created_at,
        status,
        return_type,
        source,
        refund_method,
        restock_status,
        import_product_name,
        import_quantity,
        orders (
          order_number,
          payment_method,
          customers (
            id,
            name,
            phone,
            email
          )
        ),
        return_items (
          id,
          product_name,
          quantity,
          unit_price,
          subtotal
        )
      `)
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("status", "completed"),
    supabase
      .from("business_storefronts")
      .select("primary_color")
      .eq("business_id", business.id)
      .maybeSingle(),
  ]);

  if (returnsResult.error) {
    throw new Error(returnsResult.error.message);
  }

  const records: ReturnWorkspaceRecord[] = ((returnsResult.data ?? []) as ReturnRow[]).map(
    (record) => {
      const order = Array.isArray(record.orders) ? record.orders[0] : record.orders;
      const customer = Array.isArray(order?.customers)
        ? order?.customers[0]
        : order?.customers;

      return {
        id: record.id,
        returnNumber: record.return_number,
        orderId: record.order_id,
        orderNumber: order?.order_number ?? "—",
        paymentMethod: order?.payment_method ?? null,
        customerName: customer?.name ?? "Walk-in customer",
        customerPhone: customer?.phone ?? null,
        customerEmail: customer?.email ?? null,
        reason: record.reason,
        refundAmount: Number(record.refund_amount ?? 0),
        createdAt: record.created_at,
        status: normalizeStatus(record.status),
        returnType: normalizeReturnType(record.return_type),
        source: record.source === "import" ? "import" : "system",
        refundMethod: record.refund_method,
        restockStatus: record.restock_status,
        items: [
          ...(record.return_items ?? []).map((item) => ({
            id: item.id,
            productName: item.product_name,
            quantity: Number(item.quantity ?? 0),
            unitPrice: Number(item.unit_price ?? 0),
            subtotal: Number(item.subtotal ?? 0),
          })),
          ...(record.import_product_name
            ? [
                {
                  id: `import-${record.id}`,
                  productName: record.import_product_name,
                  quantity: Math.max(1, Number(record.import_quantity ?? 1)),
                  unitPrice: 0,
                  subtotal: 0,
                },
              ]
            : []),
        ],
      };
    },
  );

  return (
    <ReturnsWorkspace
      initialRecords={records}
      completedOrderCount={ordersCountResult.count ?? 0}
      accentColor={storefrontResult.data?.primary_color || "#2563EB"}
      canManage={business.role === "owner" || business.role === "admin" || business.role === "manager"}
    />
  );
}

function normalizeStatus(value: string | null): ReturnWorkspaceRecord["status"] {
  if (value === "pending" || value === "approved" || value === "refunded" || value === "exchanged" || value === "rejected") {
    return value;
  }
  return "refunded";
}

function normalizeReturnType(value: string | null): ReturnWorkspaceRecord["returnType"] {
  return value === "exchange" ? "exchange" : "refund";
}
