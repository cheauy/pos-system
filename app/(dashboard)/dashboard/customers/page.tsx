import { requirePermission } from "@/lib/auth/require-permission";
import { hasPermission } from "@/lib/auth/permissions";
import { getCustomerFieldSettings } from "@/lib/customers/get-customer-field-settings";
import { getStorefrontSettings } from "@/lib/storefront/get-storefront";
import { createClient } from "@/lib/supabase/server";
import { CustomersWorkspace } from "./customers-workspace";

type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  address: string | null;
  created_at: string;
};

type OrderRow = {
  id: string;
  customer_id: string | null;
  order_number: string;
  total: number;
  status: string;
  order_source: string;
  created_at: string;
};

type PurchaseHistoryItem = {
  id: string;
  orderNumber: string;
  total: number;
  status: string;
  orderSource: string;
  createdAt: string;
};

export default async function CustomersPage() {
  const business = await requirePermission("customers.view");
  const supabase = await createClient();

  const [customerResult, orderResult, fieldSettings, storefrontSettings] =
    await Promise.all([
      supabase
        .from("customers")
        .select("id,name,phone,email,birthday,address,created_at")
        .eq("business_id", business.id)
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase
        .from("orders")
        .select("id,customer_id,order_number,total,status,order_source,created_at")
        .eq("business_id", business.id)
        .not("customer_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(10000),
      getCustomerFieldSettings(business.id),
      getStorefrontSettings(business.id),
    ]);

  if (customerResult.error) {
    throw new Error(customerResult.error.message);
  }

  if (orderResult.error) {
    throw new Error(orderResult.error.message);
  }

  const customers = (customerResult.data ?? []) as CustomerRow[];
  const orders = (orderResult.data ?? []) as OrderRow[];
  const metrics = new Map<
    string,
    { orderCount: number; totalSpent: number; lastPurchaseAt: string | null }
  >();
  const historyByCustomer = new Map<string, PurchaseHistoryItem[]>();

  for (const order of orders) {
    if (!order.customer_id) continue;

    const history = historyByCustomer.get(order.customer_id) ?? [];
    if (history.length < 25) {
      history.push({
        id: order.id,
        orderNumber: order.order_number,
        total: Number(order.total ?? 0),
        status: order.status,
        orderSource: order.order_source,
        createdAt: order.created_at,
      });
      historyByCustomer.set(order.customer_id, history);
    }

    if (order.status !== "completed") continue;

    const current = metrics.get(order.customer_id) ?? {
      orderCount: 0,
      totalSpent: 0,
      lastPurchaseAt: null,
    };

    current.orderCount += 1;
    current.totalSpent += Number(order.total ?? 0);
    if (!current.lastPurchaseAt) {
      current.lastPurchaseAt = order.created_at;
    }
    metrics.set(order.customer_id, current);
  }

  const activeCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const enrichedCustomers = customers.map((customer) => {
    const metric = metrics.get(customer.id);
    const lastPurchaseAt = metric?.lastPurchaseAt ?? null;
    return {
      ...customer,
      orderCount: metric?.orderCount ?? 0,
      totalSpent: metric?.totalSpent ?? 0,
      lastPurchaseAt,
      isActive:
        lastPurchaseAt !== null &&
        new Date(lastPurchaseAt).getTime() >= activeCutoff,
      purchaseHistory: historyByCustomer.get(customer.id) ?? [],
    };
  });

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const stats = {
    total: enrichedCustomers.length,
    newThisMonth: enrichedCustomers.filter(
      (customer) => new Date(customer.created_at).getTime() >= monthStart.getTime(),
    ).length,
    repeat: enrichedCustomers.filter((customer) => customer.orderCount >= 2).length,
    active: enrichedCustomers.filter((customer) => customer.isActive).length,
  };

  return (
    <CustomersWorkspace
      customers={enrichedCustomers}
      stats={stats}
      currency={storefrontSettings.currency}
      accentColor={storefrontSettings.primary_color || "#2563EB"}
      fieldSettings={fieldSettings}
      canManageSettings={business.role === "owner"}
      canCreate={hasPermission(business.role, "customers.create")}
      canUpdate={hasPermission(business.role, "customers.update")}
    />
  );
}
