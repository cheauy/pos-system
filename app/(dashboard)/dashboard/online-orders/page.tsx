import { getBranchContext } from "@/lib/branches/context";
import { getIncomingOrders } from "@/lib/branches/incoming-orders";
import { requirePermission } from "@/lib/auth/require-permission";
import { businessHasPermission } from "@/lib/auth/effective-permissions";

import { getStorefrontSettings } from "@/lib/storefront/get-storefront";
import OnlineOrdersClient from "./online-orders-client";

export default async function OnlineOrdersPage() {
  const business = await requirePermission("orders.view");
  const [canUpdate, canCancel] = await Promise.all([
    businessHasPermission(business, "orders.update"),
    businessHasPermission(business, "orders.cancel"),
  ]);
  const {branchId}=await getBranchContext();

  const [settings, incoming] = await Promise.all([
    getStorefrontSettings(business.id), getIncomingOrders(business.id),
  ]);

  return (
    <OnlineOrdersClient
      businessId={business.id}
      branchId={branchId}
      initialOrders={incoming.orders}
      receiveAll={incoming.receiveAll}
      currency={settings.currency}
      canUpdate={canUpdate}
      canCancel={canCancel}
    />
  );
}
