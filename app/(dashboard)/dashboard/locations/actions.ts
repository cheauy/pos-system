"use server";

import { revalidatePath } from "next/cache";

import { createAuditLog } from "@/lib/audit/create-audit-log";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";

export type BranchActionResult = {
  ok: boolean;
  message: string;
  mode?: "deleted" | "archived";
};

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(formData: FormData, key: string, max = 500) {
  const value = text(formData, key);
  if (!value) return null;
  return value.slice(0, max);
}

function cleanCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 20);
}

function revalidateBranches() {
  revalidatePath("/dashboard/locations");
  revalidatePath("/dashboard/settings");
}

async function validateManager(
  businessId: string,
  managerUserId: string | null,
): Promise<string | null> {
  if (!managerUserId) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_members")
    .select("user_id,role,is_active")
    .eq("business_id", businessId)
    .eq("user_id", managerUserId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data || !["owner", "admin", "manager"].includes(String(data.role))) {
    throw new Error("Selected manager must be an active Owner, Admin, or Manager in this business.");
  }

  return managerUserId;
}

export async function createLocation(
  formData: FormData,
): Promise<BranchActionResult> {
  try {
    const business = await requirePermission("locations.manage");
    const supabase = await createClient();

    const name = text(formData, "name").slice(0, 100);
    const code = cleanCode(text(formData, "code"));
    const managerUserId = await validateManager(
      business.id,
      optionalText(formData, "managerUserId", 64),
    );

    if (!name || !code) {
      return { ok: false, message: "Branch name and code are required." };
    }

    const makeDefault = text(formData, "makeDefault") === "true";

    const { data, error } = await supabase
      .from("business_locations")
      .insert({
        business_id: business.id,
        name,
        code,
        phone: optionalText(formData, "phone", 60),
        address: optionalText(formData, "address", 300),
        city: optionalText(formData, "city", 100),
        state_region: optionalText(formData, "stateRegion", 100),
        timezone: optionalText(formData, "timezone", 100) ?? "Asia/Phnom_Penh",
        opening_hours: optionalText(formData, "openingHours", 120),
        notes: optionalText(formData, "notes", 500),
        manager_user_id: managerUserId,
        is_default: false,
        is_active: true,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return { ok: false, message: "That branch code is already in use." };
      }
      return { ok: false, message: error.message };
    }

    if (makeDefault) {
      const { error: defaultError } = await supabase.rpc(
        "set_default_business_location_safe",
        {
          p_business_id: business.id,
          p_location_id: data.id,
        },
      );
      if (defaultError) {
        return { ok: false, message: defaultError.message };
      }
    }

    await createAuditLog({
      action: "create",
      entityType: "business",
      entityId: data.id,
      description: `Created branch ${name}`,
      metadata: { code, managerUserId, makeDefault },
    });

    revalidateBranches();
    return { ok: true, message: `${name} was created.` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to create branch.",
    };
  }
}

export async function updateLocation(
  formData: FormData,
): Promise<BranchActionResult> {
  try {
    const business = await requirePermission("locations.manage");
    const supabase = await createClient();

    const id = text(formData, "locationId");
    const name = text(formData, "name").slice(0, 100);
    const code = cleanCode(text(formData, "code"));
    const managerUserId = await validateManager(
      business.id,
      optionalText(formData, "managerUserId", 64),
    );

    if (!id || !name || !code) {
      return { ok: false, message: "Branch, name, and code are required." };
    }

    const { data: existing, error: existingError } = await supabase
      .from("business_locations")
      .select("id,is_default,is_active")
      .eq("id", id)
      .eq("business_id", business.id)
      .maybeSingle();

    if (existingError) return { ok: false, message: existingError.message };
    if (!existing) return { ok: false, message: "Branch not found." };

    const { error } = await supabase
      .from("business_locations")
      .update({
        name,
        code,
        phone: optionalText(formData, "phone", 60),
        address: optionalText(formData, "address", 300),
        city: optionalText(formData, "city", 100),
        state_region: optionalText(formData, "stateRegion", 100),
        timezone: optionalText(formData, "timezone", 100) ?? "Asia/Phnom_Penh",
        opening_hours: optionalText(formData, "openingHours", 120),
        notes: optionalText(formData, "notes", 500),
        manager_user_id: managerUserId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("business_id", business.id);

    if (error) {
      if (error.code === "23505") {
        return { ok: false, message: "That branch code is already in use." };
      }
      return { ok: false, message: error.message };
    }

    const makeDefault = text(formData, "makeDefault") === "true";
    if (makeDefault && !existing.is_default) {
      const { error: defaultError } = await supabase.rpc(
        "set_default_business_location_safe",
        {
          p_business_id: business.id,
          p_location_id: id,
        },
      );
      if (defaultError) return { ok: false, message: defaultError.message };
    }

    await createAuditLog({
      action: "update",
      entityType: "business",
      entityId: id,
      description: `Updated branch ${name}`,
      metadata: { code, managerUserId, makeDefault },
    });

    revalidateBranches();
    return { ok: true, message: `${name} was updated.` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to update branch.",
    };
  }
}

export async function setDefaultLocation(
  formData: FormData,
): Promise<BranchActionResult> {
  try {
    const business = await requirePermission("locations.manage");
    const id = text(formData, "locationId");
    if (!id) return { ok: false, message: "Invalid branch." };

    const supabase = await createClient();
    const { error } = await supabase.rpc("set_default_business_location_safe", {
      p_business_id: business.id,
      p_location_id: id,
    });

    if (error) return { ok: false, message: error.message };

    await createAuditLog({
      action: "update",
      entityType: "business",
      entityId: id,
      description: "Changed default branch",
    });

    revalidateBranches();
    return { ok: true, message: "Default branch updated." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to change default branch.",
    };
  }
}

export async function toggleLocation(
  formData: FormData,
): Promise<BranchActionResult> {
  try {
    const business = await requirePermission("locations.manage");
    const id = text(formData, "locationId");
    const active = text(formData, "active") === "true";
    if (!id) return { ok: false, message: "Invalid branch." };

    const supabase = await createClient();

    if (!active) {
      const { data: branch } = await supabase
        .from("business_locations")
        .select("is_default")
        .eq("id", id)
        .eq("business_id", business.id)
        .maybeSingle();
      if (branch?.is_default) {
        return { ok: false, message: "Choose another default branch before disabling this one." };
      }
    }

    const { error } = await supabase
      .from("business_locations")
      .update({ is_active: active, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("business_id", business.id)
      .eq("is_default", false);

    if (error) return { ok: false, message: error.message };

    await createAuditLog({
      action: "update",
      entityType: "business",
      entityId: id,
      description: active ? "Activated branch" : "Disabled branch",
    });

    revalidateBranches();
    return { ok: true, message: active ? "Branch activated." : "Branch disabled." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to update branch status.",
    };
  }
}

export async function deleteLocation(
  formData: FormData,
): Promise<BranchActionResult> {
  try {
    const business = await requirePermission("locations.manage");
    const id = text(formData, "locationId");
    if (!id) return { ok: false, message: "Invalid branch." };

    const supabase = await createClient();
    const { data: branch } = await supabase
      .from("business_locations")
      .select("name")
      .eq("id", id)
      .eq("business_id", business.id)
      .maybeSingle();

    if (!branch) return { ok: false, message: "Branch not found." };

    const { data, error } = await supabase.rpc(
      "delete_business_location_safe",
      {
        p_business_id: business.id,
        p_location_id: id,
      },
    );

    if (error) return { ok: false, message: error.message };

    const mode = data === "archived" ? "archived" : "deleted";

    await createAuditLog({
      action: "delete",
      entityType: "business",
      entityId: id,
      description:
        mode === "archived"
          ? `Archived branch ${branch.name} to preserve historical records`
          : `Deleted branch ${branch.name}`,
      metadata: { mode },
    });

    revalidateBranches();
    return {
      ok: true,
      mode,
      message:
        mode === "archived"
          ? `${branch.name} had historical activity, so TENH safely archived it instead of deleting its records.`
          : `${branch.name} was deleted.`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to delete branch.",
    };
  }
}
