import { getBranchContext } from "@/lib/branches/context";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business/get-current-business";
import { headers } from "next/headers";

type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "cancel"
  | "return"
  | "login"
  | "logout"
  | "stock_adjustment"
  | "open"
  | "close"
  | "cash_in"
  | "cash_out";

type AuditEntity =
  | "order"
  | "product"
  | "purchase"
  | "expense"
  | "inventory"
  | "customer"
  | "supplier"
  | "business"
  | "coupon"
  | "storefront"
  | "user"
  | "register_shift";

type AuditLogParams = {
  action: AuditAction;
  entityType: AuditEntity;
  entityId?: string;
  description: string;
  metadata?: Record<string, unknown>;
};

export async function createAuditLog({
  action,
  entityType,
  entityId,
  description,
  metadata = {},
}: AuditLogParams) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  // Resolve the business from the current TENH tenant hostname rather
  // than taking the user's first membership. This keeps audit records
  // isolated correctly when one user belongs to multiple businesses.
  const business = await getCurrentBusiness();

  if (["order","purchase","customer","supplier","coupon","register_shift"].includes(entityType)) {
    const {branchId}=await getBranchContext();
    metadata={...metadata,branch_id:branchId};
  }
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  const ipAddress = forwardedFor?.split(",")[0]?.trim() ||
    requestHeaders.get("x-real-ip") ||
    null;
  const userAgent = requestHeaders.get("user-agent");

  const { error } = await supabase
    .from("audit_logs")
    .insert({
      business_id: business.id,
      user_id: user.id,
      action,
      entity_type: entityType,
      entity_id: entityId,
      description,
      metadata,
      ip_address: ipAddress,
      user_agent: userAgent,
    });

  if (error) {
    console.error(
      "Unable to create audit log:",
      error.message,
    );
  }
}
