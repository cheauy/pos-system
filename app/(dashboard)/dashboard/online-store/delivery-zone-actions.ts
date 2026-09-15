"use server";

import { revalidatePath } from "next/cache";

import { createAuditLog } from "@/lib/audit/create-audit-log";
import { requirePermission } from "@/lib/auth/require-permission";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type DeliveryZoneActionState = {
  success: boolean;
  message: string;
  submittedAt: number;
};

function getText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getNumber(formData: FormData, key: string, fallback = 0) {
  const raw = getText(formData, key);
  const value = raw === "" ? fallback : Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${key} must be a valid number.`);
  }
  return value;
}

export async function saveDeliveryZone(
  _previousState: DeliveryZoneActionState,
  formData: FormData,
): Promise<DeliveryZoneActionState> {
  try {
    const business = await requirePermission("storefront.update");
    const id = getText(formData, "zoneId");
    const name = getText(formData, "name");
    const fee = getNumber(formData, "fee");
    const minimumOrder = getNumber(formData, "minimumOrder");
    const isActive = formData.get("isActive") === "on";

    if (name.length < 1 || name.length > 80) {
      throw new Error("Delivery zone name must contain 1–80 characters.");
    }
    if (fee < 0) {
      throw new Error("Delivery fee cannot be negative.");
    }
    if (minimumOrder < 0) {
      throw new Error("Minimum order cannot be negative.");
    }

    const values = {
      business_id: business.id,
      name,
      fee,
      minimum_order: minimumOrder,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (id) {
      result = await supabaseAdmin
        .from("business_delivery_zones")
        .update(values)
        .eq("id", id)
        .eq("business_id", business.id)
        .select("id, name")
        .maybeSingle();
    } else {
      result = await supabaseAdmin
        .from("business_delivery_zones")
        .insert(values)
        .select("id, name")
        .single();
    }

    if (result.error || !result.data) {
      if (result.error?.code === "23505") {
        throw new Error("A delivery zone with this name already exists.");
      }
      throw new Error(result.error?.message ?? "Unable to save delivery zone.");
    }

    await createAuditLog({
      action: id ? "update" : "create",
      entityType: "business",
      entityId: business.id,
      description: `${id ? "Updated" : "Created"} delivery zone ${result.data.name}`,
      metadata: {
        delivery_zone_id: result.data.id,
        fee,
        minimum_order: minimumOrder,
        is_active: isActive,
      },
    });

    revalidatePath("/dashboard/online-store");
    revalidatePath(`/_sites/${business.slug}`);

    return {
      success: true,
      message: `${result.data.name} saved.`,
      submittedAt: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Unable to save delivery zone.",
      submittedAt: Date.now(),
    };
  }
}

export async function deleteDeliveryZone(formData: FormData) {
  const business = await requirePermission("storefront.update");
  const id = getText(formData, "zoneId");

  if (!id) throw new Error("Delivery zone ID is required.");

  const { data: zone, error: loadError } = await supabaseAdmin
    .from("business_delivery_zones")
    .select("id, name")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();

  if (loadError || !zone) {
    throw new Error(loadError?.message ?? "Delivery zone not found.");
  }

  const { error } = await supabaseAdmin
    .from("business_delivery_zones")
    .delete()
    .eq("id", id)
    .eq("business_id", business.id);

  if (error) throw new Error(error.message);

  await createAuditLog({
    action: "delete",
    entityType: "business",
    entityId: business.id,
    description: `Deleted delivery zone ${zone.name}`,
    metadata: { delivery_zone_id: zone.id },
  });

  revalidatePath("/dashboard/online-store");
  revalidatePath(`/_sites/${business.slug}`);
}
