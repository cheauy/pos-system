import { requirePermission } from "@/lib/auth/require-permission";
import { businessHasPermission } from "@/lib/auth/effective-permissions";
import { createClient } from "@/lib/supabase/branch-server";

import PurchaseOrdersClient, {
  type PurchaseOrderListItem,
  type PurchaseOrderSupplier,
} from "./purchase-orders-client";

type PurchaseOrderRow = {
  id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  po_number: string;
  reference_number: string | null;
  status: "draft" | "sent" | "partial" | "received" | "cancelled";
  order_date: string;
  expected_date: string | null;
  notes: string | null;
  subtotal: number | string;
  total: number | string;
  created_by: string | null;
  created_at: string;
};

type PurchaseOrderItemRow = {
  id: string;
  purchase_order_id: string;
  product_name: string;
  sku: string | null;
  ordered_quantity: number;
  received_quantity: number;
  unit_cost: number | string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
};

export default async function PurchaseOrdersPage() {
  const business = await requirePermission("purchases.view");
  const [canCreate, canUpdate] = await Promise.all([
    businessHasPermission(business, "purchases.create"),
    businessHasPermission(business, "purchases.update"),
  ]);
  const supabase = await createClient();

  const [ordersResult, itemsResult, suppliersResult] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select(
        "id,supplier_id,supplier_name,po_number,reference_number,status,order_date,expected_date,notes,subtotal,total,created_by,created_at",
      )
      .eq("business_id", business.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("purchase_order_items")
      .select(
        "id,purchase_order_id,product_name,sku,ordered_quantity,received_quantity,unit_cost",
      )
      .eq("business_id", business.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("suppliers")
      .select("id,name,contact_person,phone,email,address,notes,is_active")
      .eq("business_id", business.id)
      .order("name", { ascending: true }),
  ]);

  if (ordersResult.error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
        <p className="font-semibold">Failed to load purchase orders</p>
        <p className="mt-1 text-sm">{ordersResult.error.message}</p>
      </div>
    );
  }

  const orders = (ordersResult.data ?? []) as PurchaseOrderRow[];
  const items = (itemsResult.data ?? []) as PurchaseOrderItemRow[];
  const suppliers = (suppliersResult.data ?? []) as PurchaseOrderSupplier[];

  const creatorIds = Array.from(
    new Set(
      orders
        .map((order) => order.created_by)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  let profileMap = new Map<string, string>();

  if (creatorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id,full_name")
      .in("id", creatorIds);

    profileMap = new Map(
      ((profiles ?? []) as ProfileRow[]).map((profile) => [
        profile.id,
        profile.full_name?.trim() || "Team member",
      ]),
    );
  }

  const itemsByOrder = new Map<string, PurchaseOrderItemRow[]>();

  for (const item of items) {
    const group = itemsByOrder.get(item.purchase_order_id) ?? [];
    group.push(item);
    itemsByOrder.set(item.purchase_order_id, group);
  }

  const purchaseOrders: PurchaseOrderListItem[] = orders.map((order) => {
    const orderItems = itemsByOrder.get(order.id) ?? [];
    const orderedQuantity = orderItems.reduce(
      (sum, item) => sum + Number(item.ordered_quantity || 0),
      0,
    );
    const receivedQuantity = orderItems.reduce(
      (sum, item) => sum + Number(item.received_quantity || 0),
      0,
    );

    return {
      ...order,
      subtotal: Number(order.subtotal || 0),
      total: Number(order.total || 0),
      created_by_name: order.created_by
        ? profileMap.get(order.created_by) ?? "Team member"
        : "—",
      item_count: orderItems.length,
      ordered_quantity: orderedQuantity,
      received_quantity: receivedQuantity,
      items: orderItems.map((item) => ({
        ...item,
        unit_cost: Number(item.unit_cost || 0),
      })),
    };
  });

  return (
    <PurchaseOrdersClient
      orders={purchaseOrders}
      suppliers={suppliers}
      canCreate={canCreate}
      canUpdate={canUpdate}
    />
  );
}
