import { createClient } from "@/lib/supabase/server";

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

  const {
    data: membership,
    error: membershipError,
  } = await supabase
    .from("business_members")
    .select("business_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    console.error(
      "Unable to determine the business for an audit log:",
      membershipError?.message ?? "Active membership not found.",
    );
    return;
  }

  const { error } = await supabase.from("audit_logs").insert({
    business_id: membership.business_id,
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
