import "server-only";

import { redirect } from "next/navigation";
import { getCurrentBusiness } from "./get-current-business";
import type {
  BusinessRole,
  CurrentBusiness,
} from "./types";

export async function requireBusinessRole(
  allowedRoles: BusinessRole[],
): Promise<CurrentBusiness> {
  const business = await getCurrentBusiness();

  if (!allowedRoles.includes(business.role)) {
    redirect("/dashboard");
  }

  return business;
}