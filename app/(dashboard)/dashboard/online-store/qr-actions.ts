"use server";

import { revalidatePath } from "next/cache";

import { createAuditLog } from "@/lib/audit/create-audit-log";
import { requirePermission } from "@/lib/auth/require-permission";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supportsDineIn } from "@/lib/storefront/profile";

export type TableActionState = {
  success: boolean;
  message: string;
  submittedAt: number;
};

function getText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function createBusinessTable(
  _previousState: TableActionState,
  formData: FormData,
): Promise<TableActionState> {
  try {
    const business = await requirePermission("storefront.update");
    const name = getText(formData, "name");
    const { data: settings, error: settingsError } = await supabaseAdmin.from("business_storefronts")
      .select("business_type, allow_dine_in").eq("business_id", business.id).single();
    if (settingsError || !settings || !supportsDineIn(settings.business_type) || !settings.allow_dine_in) {
      throw new Error("Table QR codes require a food-service store with dine-in enabled.");
    }

    if (name.length < 1 || name.length > 60) {
      throw new Error("Table name must contain 1–60 characters.");
    }

    const { data, error } = await supabaseAdmin
      .from("business_tables")
      .insert({
        business_id: business.id,
        name,
      })
      .select("id, name")
      .single();

    if (error || !data) {
      if (error?.code === "23505") {
        throw new Error("A table with this name already exists.");
      }
      throw new Error(error?.message ?? "Unable to create table.");
    }

    await createAuditLog({
      action: "create",
      entityType: "business",
      entityId: business.id,
      description: `Created online ordering table ${data.name}`,
      metadata: { table_id: data.id },
    });

    revalidatePath("/dashboard/online-store");
    revalidatePath("/dashboard/online-store/ordering");

    return {
      success: true,
      message: `${data.name} QR created.`,
      submittedAt: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unable to create table.",
      submittedAt: Date.now(),
    };
  }
}

export async function regenerateBusinessTableToken(formData: FormData) {
  const business = await requirePermission("storefront.update");
  const tableId = getText(formData, "tableId");

  if (!tableId) throw new Error("Table ID is required.");

  const { data, error } = await supabaseAdmin
    .from("business_tables")
    .update({
      public_token: crypto.randomUUID(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", tableId)
    .eq("business_id", business.id)
    .select("id, name")
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message ?? "Table not found.");
  }

  await createAuditLog({
    action: "update",
    entityType: "business",
    entityId: business.id,
    description: `Regenerated QR token for ${data.name}`,
    metadata: { table_id: data.id },
  });

  revalidatePath("/dashboard/online-store");
    revalidatePath("/dashboard/online-store/ordering");
}

export async function deleteBusinessTable(formData: FormData) {
  const business = await requirePermission("storefront.update");
  const tableId = getText(formData, "tableId");

  if (!tableId) throw new Error("Table ID is required.");

  const { data: table, error: loadError } = await supabaseAdmin
    .from("business_tables")
    .select("id, name")
    .eq("id", tableId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (loadError || !table) {
    throw new Error(loadError?.message ?? "Table not found.");
  }

  const { error } = await supabaseAdmin
    .from("business_tables")
    .delete()
    .eq("id", tableId)
    .eq("business_id", business.id);

  if (error) throw new Error(error.message);

  await createAuditLog({
    action: "delete",
    entityType: "business",
    entityId: business.id,
    description: `Deleted online ordering table ${table.name}`,
    metadata: { table_id: table.id },
  });

  revalidatePath("/dashboard/online-store");
    revalidatePath("/dashboard/online-store/ordering");
}
