"use server";

import { validCash } from "./register-model";
import { assertBranchOperation } from "@/lib/subscriptions/branch-limits";
import { revalidatePath } from "next/cache";
import { createAuditLog } from "@/lib/audit/create-audit-log";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/branch-server";
import { createClient as createBaseClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function text(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export async function openRegisterShift(formData: FormData) {
  const business = await requirePermission("register.manage");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Login required.");
  const locationId = text(formData, "locationId");
  const openingValue = text(formData, "openingCash");
  const openingCash = Number(openingValue);
  if (!locationId) throw new Error("Choose a branch.");
  if (!validCash(openingValue)) throw new Error("Invalid opening cash.");

  const { data: location } = await supabase
    .from("business_locations")
    .select("id")
    .eq("id", locationId)
    .eq("business_id", business.id)
    .eq("is_active", true)
    .eq("plan_disable_pending", false)
    .maybeSingle();
  if (!location) throw new Error("Branch not found or is closing after a plan change.");
  await assertBranchOperation(business.id, locationId);

  const existing = await supabase
    .from("cash_register_shifts")
    .select("id")
    .eq("business_id", business.id)
    .eq("location_id", locationId)
    .eq("status", "open")
    .limit(1);
  if (existing.error) throw new Error("Unable to verify the register state.");
  if (existing.data?.length) throw new Error("This branch already has an open shift. Refresh to view it.");

  const { data, error } = await supabase.from("cash_register_shifts").insert({
    business_id: business.id,
    location_id: locationId,
    opened_by: user.id,
    opening_cash: openingCash,
    opening_note: text(formData, "note") || null,
  }).select("id").single();
  if (error) throw new Error(error.message);

  await createAuditLog({
    action: "open",
    entityType: "register_shift",
    entityId: data.id,
    description: "Opened cash register shift",
    metadata: { location_id: locationId, opening_cash: openingCash },
  }).catch(() => console.error("Shift opened but audit logging failed."));
  revalidatePath("/dashboard/register");
  revalidatePath("/dashboard/pos");
}

export async function addCashMovement(formData: FormData) {
  const business = await requirePermission("register.manage");
  const shiftId = text(formData, "shiftId");
  const type = text(formData, "type");
  if (type !== "cash_in" && type !== "cash_out") throw new Error("Invalid cash movement type.");
  const amountText = text(formData, "amount");
  const amount = Number(amountText);
  const reason = text(formData, "reason");
  if (!shiftId || !reason || !validCash(amountText, true)) throw new Error("Complete the cash movement form.");

  const supabase = await createClient();
  const shift = await requireOpenShift(supabase, business.id, shiftId);
  await assertBranchOperation(business.id, shift.location_id);

  const { error } = await supabase.rpc("record_cash_movement", {
    p_business_id: business.id,
    p_shift_id: shiftId,
    p_type: type,
    p_amount: amount,
    p_reason: [reason, text(formData, "note")].filter(Boolean).join(" — "),
    p_reference: text(formData, "reference") || null,
  });
  if (error) throw new Error(error.message);

  await createAuditLog({
    action: type,
    entityType: "register_shift",
    entityId: shiftId,
    description: type === "cash_in" ? "Cash added to register" : "Cash removed from register",
    metadata: { amount, reason },
  }).catch(() => console.error("Cash movement saved but audit logging failed."));
  revalidatePath("/dashboard/register");
  revalidatePath("/dashboard/pos");
}

export async function closeRegisterShift(formData: FormData) {
  const business = await requirePermission("register.manage");
  const shiftId = text(formData, "shiftId");
  const closingText = text(formData, "closingCash");
  const closingCash = Number(closingText);
  if (!shiftId || !validCash(closingText)) throw new Error("Enter the counted closing cash.");

  // Read with the trusted server client after permission verification so an
  // excess branch can still expose its one open drawer for a safe close.
  const { data: shift, error: shiftError } = await supabaseAdmin
    .from("cash_register_shifts")
    .select("id,status,location_id")
    .eq("business_id", business.id)
    .eq("id", shiftId)
    .maybeSingle();
  if (shiftError) throw new Error("Unable to verify the shift. Refresh and retry.");
  if (!shift || shift.status !== "open") throw new Error("This shift is no longer open or is unavailable. Refresh the register.");

  const { data: location, error: locationError } = await supabaseAdmin
    .from("business_locations")
    .select("id,is_active,plan_disable_pending")
    .eq("business_id", business.id)
    .eq("id", shift.location_id)
    .maybeSingle();
  if (locationError || !location || !location.is_active) throw new Error("This register branch is no longer available.");

  let supabase: Awaited<ReturnType<typeof createClient>>;
  if (location.plan_disable_pending) {
    // Only the close action gets a temporary authenticated branch header. The
    // branch is hidden from normal operating context and all new operations are
    // blocked while it waits for this drawer to close.
    supabase = await createBaseClient({
      "x-tenh-branch-id": shift.location_id,
      "x-tenh-business-id": business.id,
    }) as Awaited<ReturnType<typeof createClient>>;
  } else {
    await assertBranchOperation(business.id, shift.location_id);
    supabase = await createClient();
  }

  const { data, error } = await supabase.rpc("tenh_close_register_accounted", {
    p_business_id: business.id,
    p_shift_id: shiftId,
    p_closing_cash: closingCash,
    p_note: text(formData, "note") || null,
  });
  if (error) throw new Error(error.code === "PGRST202" ? "Apply 20260921090000_register_pos_accounting.sql before closing the register." : error.message);

  await createAuditLog({
    action: "close",
    entityType: "register_shift",
    entityId: shiftId,
    description: location.plan_disable_pending
      ? "Closed final register before branch plan disable"
      : "Closed cash register shift",
    metadata: data ?? {},
  }).catch(() => console.error("Shift closed but audit logging failed."));
  revalidatePath("/dashboard/register");
  revalidatePath("/dashboard/pos");
  revalidatePath("/dashboard/settings/branches");
}

async function requireOpenShift(
  db: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  shiftId: string,
) {
  const { data, error } = await db
    .from("cash_register_shifts")
    .select("id,status,location_id")
    .eq("business_id", businessId)
    .eq("id", shiftId)
    .maybeSingle();
  if (error) throw new Error("Unable to verify the shift. Refresh and retry.");
  if (!data || data.status !== "open") throw new Error("This shift is no longer open or is unavailable. Refresh the register.");
  return data;
}
