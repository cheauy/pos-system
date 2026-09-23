import "server-only";

import { redirect } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business/get-current-business";
import type { CurrentBusiness } from "@/lib/business/types";
import { businessHasPermission } from "@/lib/auth/effective-permissions";
import type { Permission } from "./permissions";

export async function requirePermission(
  permission: Permission,
): Promise<CurrentBusiness> {
  const business = await getCurrentBusiness();

  if (!(await businessHasPermission(business, permission))) {
    redirect("/dashboard");
  }

  return business;
}

export async function requireAnyPermission(
  requiredPermissions: Permission[],
): Promise<CurrentBusiness> {
  const business = await getCurrentBusiness();
  const checks = await Promise.all(
    requiredPermissions.map((permission) =>
      businessHasPermission(business, permission),
    ),
  );

  if (!checks.some(Boolean)) {
    redirect("/dashboard");
  }

  return business;
}
