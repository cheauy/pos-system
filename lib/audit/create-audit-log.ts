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

  await supabase.from("audit_logs").insert({
    user_id: user.id,
    action,
    entity_type: entityType,
    entity_id: entityId,
    description,
    metadata,
  });
}