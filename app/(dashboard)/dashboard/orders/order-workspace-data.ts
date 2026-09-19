import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { OrderDetail, OrderRow, PaymentState, WorkspaceData, WorkspaceFilters } from "./order-workspace-types";

type Customer = { id: string; name: string; phone: string | null; email: string | null; address: string | null };
type Product = { name: string; image_url: string | null };
type RawItem = { id: string; product_name: string | null; quantity: number; unit_price: number; subtotal: number; variant_label: string | null; selected_options: { name?: string }[] | null; products: Product | Product[] | null };
type RawOrder = {
  id: string; order_number: string; customer_id: string | null; order_source: string;
  fulfillment_type: string | null; status: OrderRow["status"]; online_status: string | null;
  payment_method: string; payment_status: string | null; payment_reference: string | null;
  total: number; subtotal: number; discount: number; delivery_fee: number; amount_paid: number;
  change_amount: number; remaining_balance: number; credit_amount: number; loyalty_points_earned: number;
  coupon_code: string | null; coupon_discount: number; created_at: string; updated_at: string | null;
  location_id: string | null; guest_name: string | null; guest_phone: string | null; guest_address: string | null;
  customer_note: string | null; table_name: string | null; requested_for: string | null;
  customers: Customer | Customer[] | null; order_items: RawItem[];
};
function one<T>(value: T | T[] | null): T | null { return Array.isArray(value) ? value[0] ?? null : value; }
function number(value: unknown) { const result = Number(value ?? 0); return Number.isFinite(result) ? result : 0; }
function imageUrl(value: string | null | undefined) {
  if (!value) return null;
  try { const parsed = new URL(value); return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : null; } catch { return null; }
}
export async function loadWorkspace(businessId: string, filters: WorkspaceFilters): Promise<WorkspaceData> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tenh_orders_workspace", { p_business_id: businessId, p_filters: filters });
  if (error) {
    if (error.code === "PGRST202" || /tenh_orders_workspace|archived_at/.test(error.message)) {
      throw new Error("Run the included 20260919_orders_workspace_safe_actions.sql migration in Supabase, then refresh this page.");
    }
    console.error("Orders workspace:", error.message);
    throw new Error("Orders could not be loaded. Please refresh or check your database connection.");
  }
  if (!data || !Array.isArray(data.rows)) throw new Error("The Orders workspace returned an invalid response.");
  return data as WorkspaceData;
}

// Called only with the current business ID resolved on the server.
export async function loadOrderDetail(businessId: string, orderId: string): Promise<OrderDetail> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("orders").select(`
    id,order_number,customer_id,order_source,fulfillment_type,status,online_status,
    payment_method,payment_status,payment_reference,total,subtotal,discount,delivery_fee,
    amount_paid,change_amount,remaining_balance,credit_amount,loyalty_points_earned,coupon_code,coupon_discount,
    created_at,updated_at,location_id,guest_name,guest_phone,guest_address,customer_note,table_name,requested_for,
    customers(id,name,phone,email,address),
    order_items(id,product_name,quantity,unit_price,subtotal,variant_label,selected_options,products(name,image_url))
  `).eq("id", orderId).eq("business_id", businessId).is("archived_at", null).maybeSingle();
  if (error) { console.error("Order detail:", error.message); throw new Error("Unable to load this order. Please try again."); }
  if (!data) throw new Error("This order is no longer available. Refresh the Orders list.");
  const order = data as unknown as RawOrder;
  const customer = one(order.customers);
  const [branch, returns, activity] = await Promise.all([
    order.location_id
      ? supabase.from("business_locations").select("name").eq("id", order.location_id).eq("business_id", businessId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("returns").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("order_id", orderId),
    supabase.from("audit_logs").select("id,description,created_at,action").eq("business_id", businessId).eq("entity_type", "order").eq("entity_id", orderId).order("created_at", { ascending: false }).limit(30),
  ]);
  const paid = Math.max(0, number(order.amount_paid) - number(order.change_amount));
  const paymentState: PaymentState = order.status === "refunded" || order.payment_status === "refunded" ? "refunded"
    : order.payment_status === "pending_verification" ? "pending_verification"
    : order.payment_status === "paid" || paid >= number(order.total) ? "paid"
    : number(order.amount_paid) > 0 ? "partial" : "unpaid";
  return {
    id: order.id, orderNumber: order.order_number, customerId: order.customer_id,
    customerName: customer?.name || order.guest_name || "Walk-in customer",
    customerPhone: customer?.phone || order.guest_phone || null,
    customerEmail: customer?.email || null, customerAddress: customer?.address || order.guest_address || null,
    guestName: order.guest_name, guestPhone: order.guest_phone, guestAddress: order.guest_address,
    source: order.order_source || "pos", fulfillment: order.fulfillment_type,
    status: order.status, onlineStatus: order.online_status,
    paymentState, paymentMethod: order.payment_method, total: number(order.total),
    amountPaid: number(order.amount_paid), createdAt: order.created_at, updatedAt: order.updated_at,
    branchId: order.location_id, branchName: branch.data?.name || "Unassigned",
    itemCount: (order.order_items ?? []).length,
    // Fail closed if return history could not be checked. SQL re-checks under lock.
    deleteBlocked: !!returns.error || (returns.count ?? 0) > 0 || number(order.amount_paid) > 0
      || ["paid", "refunded", "pending_verification"].includes(order.payment_status ?? "")
      || !!order.payment_reference || order.payment_method === "credit" || number(order.credit_amount) > 0 || number(order.loyalty_points_earned) > 0,
    note: order.customer_note, subtotal: number(order.subtotal), discount: number(order.discount),
    deliveryFee: number(order.delivery_fee), changeAmount: number(order.change_amount),
    remainingBalance: number(order.remaining_balance), couponCode: order.coupon_code,
    couponDiscount: number(order.coupon_discount), paymentReference: order.payment_reference,
    tableName: order.table_name, requestedFor: order.requested_for,
    items: (order.order_items ?? []).map((item) => ({
      id: item.id, name: item.product_name || one(item.products)?.name || "Deleted product",
      imageUrl: imageUrl(one(item.products)?.image_url), variant: item.variant_label,
      quantity: number(item.quantity), unitPrice: number(item.unit_price), subtotal: number(item.subtotal),
      options: Array.isArray(item.selected_options) ? item.selected_options.map((option) => option?.name ?? "").filter(Boolean) : [],
    })),
    activity: [
      { id: "order-created", description: "Order created", createdAt: order.created_at },
      ...(activity.data ?? []).filter((entry) => entry.action !== "create").map((entry) => ({ id: entry.id, description: entry.description, createdAt: entry.created_at })),
    ].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    activityUnavailable: !!activity.error,
  };
}
