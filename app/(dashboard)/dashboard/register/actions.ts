"use server";

import { revalidatePath } from "next/cache";
import { createAuditLog } from "@/lib/audit/create-audit-log";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";

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
  const openingCash = Number(text(formData, "openingCash") || "0");
  if (!locationId) throw new Error("Choose a branch.");
  if (!Number.isFinite(openingCash) || openingCash < 0) throw new Error("Invalid opening cash.");

  const { data: location } = await supabase.from("business_locations").select("id").eq("id", locationId).eq("business_id", business.id).eq("is_active", true).maybeSingle();
  if (!location) throw new Error("Branch not found.");

  const { data, error } = await supabase.from("cash_register_shifts").insert({
    business_id: business.id,
    location_id: locationId,
    opened_by: user.id,
    opening_cash: openingCash,
    opening_note: text(formData, "note") || null,
  }).select("id").single();
  if (error) throw new Error(error.message);
  await createAuditLog({ action: "open", entityType: "register_shift", entityId: data.id, description: "Opened cash register shift", metadata: { location_id: locationId, opening_cash: openingCash } });
  revalidatePath("/dashboard/register");
}

export async function addCashMovement(formData: FormData) {
  const business = await requirePermission("register.manage");
  const shiftId = text(formData, "shiftId");
  const type = text(formData, "type");
  if (type !== "cash_in" && type !== "cash_out") {
    throw new Error("Invalid cash movement type.");
  }
  const amount = Number(text(formData, "amount"));
  const reason = text(formData, "reason");
  if (!shiftId || !reason || !Number.isFinite(amount) || amount <= 0) throw new Error("Complete the cash movement form.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_cash_movement", { p_business_id: business.id, p_shift_id: shiftId, p_type: type, p_amount: amount, p_reason: reason, p_reference: text(formData, "reference") || null });
  if (error) throw new Error(error.message);
  await createAuditLog({ action: type, entityType: "register_shift", entityId: shiftId, description: type === "cash_in" ? "Cash added to register" : "Cash removed from register", metadata: { amount, reason } });
  revalidatePath("/dashboard/register");
}

export async function closeRegisterShift(formData: FormData) {
  const business = await requirePermission("register.manage");
  const shiftId = text(formData, "shiftId");
  const closingCash = Number(text(formData, "closingCash"));
  if (!shiftId || !Number.isFinite(closingCash) || closingCash < 0) throw new Error("Enter the counted closing cash.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("close_cash_register_shift", { p_business_id: business.id, p_shift_id: shiftId, p_closing_cash: closingCash, p_note: text(formData, "note") || null });
  if (error) throw new Error(error.message);
  await createAuditLog({ action: "close", entityType: "register_shift", entityId: shiftId, description: "Closed cash register shift", metadata: data ?? {} });
  revalidatePath("/dashboard/register");
}
