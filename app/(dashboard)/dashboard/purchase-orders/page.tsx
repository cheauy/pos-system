import { requirePermission } from "@/lib/auth/require-permission";
import { businessHasPermission } from "@/lib/auth/effective-permissions";
import { getBranchContext } from "@/lib/branches/context";
import PurchaseOrdersClient from "./purchase-orders-client";
import { loadPurchaseOrders } from "./list-actions";

export default async function PurchaseOrdersPage({searchParams}:{searchParams:Promise<{new?:string}>}) {
  const business=await requirePermission("purchases.view");
  const [workspace,canCreate,canUpdate,scope,params]=await Promise.all([
    loadPurchaseOrders(),businessHasPermission(business,"purchases.create"),
    businessHasPermission(business,"purchases.update"),getBranchContext(),searchParams,
  ]);
  return <PurchaseOrdersClient key={`${scope.userId}:${business.id}:${scope.branchId}`} workspace={workspace}
    canCreate={canCreate} canUpdate={canUpdate} openNew={params.new==="1"&&canCreate}/>;
}
