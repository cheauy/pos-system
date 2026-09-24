import { getBranchContext } from "@/lib/branches/context";
import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business/get-current-business";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";

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

  if (["order","product","expense","inventory","purchase","customer","supplier","coupon","register_shift","user"].includes(entityType)) {
    const {branchId}=await getBranchContext();
    const branchTables:Partial<Record<AuditEntity,string>>={order:'orders',expense:'expenses',purchase:'purchases',customer:'customers',supplier:'suppliers',coupon:'business_coupons',register_shift:'cash_register_shifts'};
    const table=branchTables[entityType];
    const record=table && entityId?await supabaseAdmin.from(table).select('location_id').eq('business_id',business.id).eq('id',entityId).maybeSingle():null;
    if(record?.error)console.error('Unable to determine the audit branch:',record.error.message);
    metadata={...metadata,branch_id:record?.error?null:record?.data?.location_id || branchId};
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
