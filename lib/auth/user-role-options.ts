import type { BusinessRole } from "@/lib/business/types";
/** Legacy admin accounts keep their existing permissions but are no longer assignable. */
export function getAssignableRoles(currentRole: BusinessRole): BusinessRole[] {
  if (currentRole === "owner") return ["manager", "staff", "cashier"];
  if (currentRole === "manager" || currentRole === "admin") return ["staff", "cashier"];
  return [];
}
export function canAssignRole(currentRole: BusinessRole, targetRole: BusinessRole): boolean {
  return getAssignableRoles(currentRole).includes(targetRole);
}
