import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export type BusinessHistoryAction =
  | "subscription_extended"
  | "subscription_reactivated"
  | "staff_limit_changed"
  | "business_suspended"
  | "business_restored"
  | "product_mode_changed"
  | "business_deleted_scheduled"
  | "business_deletion_cancelled"
  | "business_updated"
  | "subscription_extension_corrected";

type CreateBusinessHistoryInput = {
  businessId: string;
  action: BusinessHistoryAction;
  title: string;
  description?: string;
  reason?: string | null;
  previousValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  createdBy: string;
};

export async function createBusinessHistory({
  businessId,
  action,
  title,
  description,
  reason,
  previousValues,
  newValues,
  metadata,
  createdBy,
}: CreateBusinessHistoryInput) {
  const { error } = await supabaseAdmin
    .from("business_activity_history")
    .insert({
      business_id: businessId,
      action,
      title,
      description: description ?? null,
      reason: reason ?? null,
      previous_values: previousValues ?? null,
      new_values: newValues ?? null,
      metadata: metadata ?? null,
      created_by: createdBy,
    });

  if (error) {
    throw new Error(
      `Unable to create business history: ${error.message}`,
    );
  }
}