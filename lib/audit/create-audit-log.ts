import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business/get-current-business";

type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "cancel"
  | "return"
  | "login"
  | "logout"
  | "stock_adjustment";

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
  | "user";

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
    });

  if (error) {
    console.error(
      "Unable to create audit log:",
      error.message,
    );
  }
}
