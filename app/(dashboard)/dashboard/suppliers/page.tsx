import { getBranchContext } from "@/lib/branches/context";
import SuppliersClient from "./suppliers-client";
import { loadSuppliers } from "./list-actions";

export default async function SuppliersPage() {
  const [workspace,scope]=await Promise.all([loadSuppliers(),getBranchContext()]);
  return <SuppliersClient key={`${scope.userId}:${scope.business.id}:${scope.branchId}`} workspace={workspace}/>;
}
