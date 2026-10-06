import "server-only";
import { createClient as createBaseClient } from "./server";
import { getBranchContext } from "@/lib/branches/context";

// The migration check is schema-level: once it passes it stays true for this
// server process, so later requests skip the extra round trip. Failures are
// never cached and are re-checked on the next call.
let scopeReady = false;

// Explicitly used by operational screens. Shared management and analytics use
// the normal client; SQL policies and write guards enforce this request context.
export async function createClient() {
  const context = await getBranchContext();
  if (!context.branchId) throw new Error("Activate a branch before continuing.");
  const client = await createBaseClient({
    "x-tenh-branch-id": context.branchId,
    "x-tenh-business-id": context.business.id,
  });
  if (!scopeReady) {
    const ready = await client.rpc("tenh_branch_scope_ready");
    if (ready.error || ready.data !== true) throw new Error("Apply 20260921100000_operating_branches.sql before using branch operations.");
    scopeReady = true;
  }
  return client;
}
