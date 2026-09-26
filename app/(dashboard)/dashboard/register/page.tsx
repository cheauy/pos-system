import { getBranchContext } from "@/lib/branches/context";
import { requirePermission } from "@/lib/auth/require-permission";
import { supabaseAdmin } from "@/lib/supabase/admin";
import RegisterClient from "./register-client";
import type { Movement, Order } from "./register-model";

export default async function RegisterPage() {
  const business = await requirePermission("register.manage");
  const { branchId } = await getBranchContext();

  // Restrict trusted-client reads before sending any register data to the browser.
  const locations = await supabaseAdmin.from("business_locations")
    .select("id,name,code,is_active,plan_disable_pending")
    .eq("business_id", business.id).eq("is_active", true)
    .order("is_default", { ascending: false }).order("name");
  if (locations.error) throw new Error("Unable to load register branches.");
  const allowedBranches = (locations.data ?? []).filter(location =>
    location.id === branchId || (business.role === "owner" && location.plan_disable_pending));
  const allowedIds = allowedBranches.map(location => location.id);
  if (!allowedIds.length) throw new Error("No register branch is available.");
  const [recent, opened] = await Promise.all([
    supabaseAdmin.from("cash_register_shifts").select("*")
      .eq("business_id", business.id).in("location_id", allowedIds)
      .order("opened_at", { ascending: false }).limit(50),
    supabaseAdmin.from("cash_register_shifts").select("*")
      .eq("business_id", business.id).in("location_id", allowedIds).eq("status", "open"),
  ]);
  if (recent.error || opened.error) throw new Error("Unable to load registers. Please retry.");

  const shifts = [
    ...new Map([...(opened.data ?? []), ...(recent.data ?? [])].map((shift) => [shift.id, shift])).values(),
  ].sort((a, b) => b.opened_at.localeCompare(a.opened_at));
  const ids = shifts.map((shift) => shift.id);
  const movements: Movement[] = [];
  const orders: Order[] = [];

  if (ids.length) {
    for (let offset = 0; ; offset += 1000) {
      const result = await supabaseAdmin
        .from("cash_movements")
        .select("id,shift_id,movement_type,amount,reason,reference,created_at,created_by")
        .eq("business_id", business.id)
        .in("shift_id", ids)
        .order("created_at", { ascending: false })
        .order("id")
        .range(offset, offset + 999);
      if (result.error) throw new Error("Unable to load cash movements.");
      movements.push(...(result.data as Movement[]));
      if (result.data.length < 1000) break;
    }

    for (let offset = 0; ; offset += 1000) {
      const result = await supabaseAdmin
        .from("orders")
        .select("id,order_number,register_shift_id,payment_method,total,amount_paid,change_amount,status,created_at,pos_checkout")
        .eq("business_id", business.id)
        .in("register_shift_id", ids)
        .order("created_at", { ascending: false })
        .order("id")
        .range(offset, offset + 999);
      if (result.error) throw new Error("Unable to load shift payments.");
      orders.push(...(result.data as Order[]));
      if (result.data.length < 1000) break;
    }
  }

  const people = [...new Set([...shifts.map((shift) => shift.opened_by), ...movements.map((movement) => movement.created_by)])];
  const names: Record<string, string> = {};
  if (people.length) {
    const profiles = await supabaseAdmin.from("profiles").select("id,full_name").in("id", people);
    if (profiles.error) throw new Error("Unable to load shift staff.");
    for (const profile of profiles.data ?? []) names[profile.id] = profile.full_name || "Staff";
  }

  const openLocationIds = new Set((opened.data ?? []).map((shift) => shift.location_id));
  const branches = allowedBranches.filter(
    (branch) => branch.id === branchId || (branch.plan_disable_pending && openLocationIds.has(branch.id)),
  );

  return (
    <RegisterClient
      branches={branches}
      shifts={shifts}
      movements={movements}
      orders={orders}
      names={names}
    />
  );
}
