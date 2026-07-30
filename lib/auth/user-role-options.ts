import type {
  BusinessRole,
} from "@/lib/business/types";

export function getAssignableRoles(
  currentRole: BusinessRole,
): BusinessRole[] {
  switch (currentRole) {
    case "owner":
      return [
        "admin",
        "manager",
        "cashier",
      ];

    case "admin":
      return [
        "manager",
        "cashier",
      ];

    case "manager":
      return ["cashier"];

    default:
      return [];
  }
}

export function canAssignRole(
  currentRole: BusinessRole,
  targetRole: BusinessRole,
): boolean {
  return getAssignableRoles(
    currentRole,
  ).includes(targetRole);
}