import "server-only";
import { createClient as createBaseClient } from "./server";
import { getBranchContext } from "@/lib/branches/context";

// Explicitly used by operational screens. Shared management and analytics use
// the normal client; SQL policies and write guards enforce this request context.
export async function createClient() {
  const context = await getBranchContext();
  if (!context.branchId) throw new Error("Activate a branch before continuing.");
  const client = await createBaseClient({
    "x-tenh-branch-id": context.branchId,
    "x-tenh-business-id": context.business.id,
  });
  const ready = await client.rpc("tenh_branch_scope_ready");
  if (ready.error || ready.data !== true) throw new Error("Apply 20260921100000_operating_branches.sql before using branch operations.");
  return client;
}
