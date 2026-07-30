import "server-only";

import { redirect } from "next/navigation";

import {
  getCurrentBusiness,
} from "@/lib/business/get-current-business";
import type {
  CurrentBusiness,
} from "@/lib/business/types";
import {
  hasPermission,
  type Permission,
} from "./permissions";

export async function requirePermission(
  permission: Permission,
): Promise<CurrentBusiness> {
  const business = await getCurrentBusiness();

  if (!hasPermission(business.role, permission)) {
    redirect("/dashboard");
  }

  return business;
}

export async function requireAnyPermission(
  requiredPermissions: Permission[],
): Promise<CurrentBusiness> {
  const business = await getCurrentBusiness();

  const allowed = requiredPermissions.some(
    (permission) =>
      hasPermission(business.role, permission),
  );

  if (!allowed) {
    redirect("/dashboard");
  }

  return business;
}