import { requirePermission } from "@/lib/auth/require-permission";
import { businessHasPermission } from "@/lib/auth/effective-permissions";
import { createClient } from "@/lib/supabase/branch-server";
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
  product_id: string | null;
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
  cancelled_at: string | null;
  cancel_reason: string | null;
  cancelled_items: { order_item_id: string; product_name: string; quantity: number; unit_price: number; subtotal: number }[] | null;
  orders: OrderRelation;
  return_items: ReturnItemRow[] | null;
};

export default async function ReturnsPage() {
  const [business, supabase] = await Promise.all([requirePermission("orders.view"), createClient()]);

  const [returnsResult, ordersCountResult, storefrontResult, canManage] = await Promise.all([
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
        cancelled_at,
        cancel_reason,
        cancelled_items,
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
          product_id,
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
    businessHasPermission(business, "orders.return"),
  ]);

  if (returnsResult.error) {
    throw new Error(returnsResult.error.message);
  }

  const rows = (returnsResult.data ?? []) as ReturnRow[];
  const images = await productImages(supabase, business.id, rows.flatMap((row) => (row.return_items ?? []).map((item) => item.product_id)));
  const records: ReturnWorkspaceRecord[] = rows.map(
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
        cancelledAt: record.cancelled_at,
        cancelReason: record.cancel_reason,
        items: [
          // A cancelled return's items live only in its snapshot.
          ...(record.cancelled_items ?? []).map((item, index) => ({
            id: `cancelled-${record.id}-${index}`,
            productName: item.product_name,
            quantity: Number(item.quantity ?? 0),
            unitPrice: Number(item.unit_price ?? 0),
            subtotal: Number(item.subtotal ?? 0),
          })),
          ...(record.return_items ?? []).map((item) => ({
            id: item.id,
            productName: item.product_name,
            imageUrl: item.product_id ? images.get(item.product_id) ?? null : null,
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
      canManage={canManage}
      canCancel={business.role === "owner"}
    />
  );
}

// Thumbnails for the phone list. A failed lookup only hides images; it never blocks the page.
async function productImages(supabase: Awaited<ReturnType<typeof createClient>>, businessId: string, ids: (string | null)[]) {
  const images = new Map<string, string>();
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const chunks: string[][] = [];
  for (let start = 0; start < unique.length; start += 150) chunks.push(unique.slice(start, start + 150));
  // Chunks are independent; read them together instead of one round trip each.
  const results = await Promise.all(chunks.map(chunk => supabase.from("products").select("id,image_url,variant_image_url").eq("business_id", businessId).in("id", chunk)));
  for (const { data } of results) {
    for (const product of data ?? []) {
      const url = product.variant_image_url || product.image_url;
      if (typeof url === "string" && /^https?:\/\//.test(url)) images.set(product.id, url);
    }
  }
  return images;
}

function normalizeStatus(value: string | null): ReturnWorkspaceRecord["status"] {
  if (value === "pending" || value === "approved" || value === "refunded" || value === "exchanged" || value === "rejected" || value === "cancelled") {
    return value;
  }
  return "refunded";
}

function normalizeReturnType(value: string | null): ReturnWorkspaceRecord["returnType"] {
  return value === "exchange" ? "exchange" : "refund";
}
