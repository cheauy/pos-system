import { createClient } from "@/lib/supabase/server";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "cancel"
  | "return"
  | "login"
  | "logout"
  | "stock_adjustment";

export type AuditEntityType =
  | "order"
  | "purchase"
  | "product"
  | "inventory"
  | "expense"
  | "user"
  | "customer"
  | "supplier"
  | "profile"
  | "auth";

type CreateAuditLogParams = {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  description: string;
  metadata?: Record<string, unknown>;
};

export async function createAuditLog({
  action,
  entityType,
  entityId = null,
  description,
  metadata = {},
}: CreateAuditLogParams): Promise<void> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.error("Audit log failed: user is not authenticated");
    return;
  }

  const { error } = await supabase
    .from("audit_logs")
    .insert({
      user_id: user.id,
      action,
      entity_type: entityType,
      entity_id: entityId,
      description,
      metadata,
    });

  if (error) {
    console.error("Failed to create audit log:", error.message);
  }
}