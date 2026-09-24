import "server-only";

import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from '@/lib/supabase/server';
import { getBranchContext } from '@/lib/branches/context';
import type { BusinessRole, CurrentBusiness } from "@/lib/business/types";
import {
  permissions,
  rolePermissions,
  type Permission,
} from "@/lib/auth/permissions";

const known = new Set<string>(permissions);

function fallback(role: BusinessRole): Permission[] {
  return [...(rolePermissions[role] ?? [])];
}

export const getRolePermissions = cache(
  async (businessId: string, role: BusinessRole, locationId?: string): Promise<Permission[]> => {
    if (role === "owner") return [...permissions];
    if (role === "admin") return fallback(role);

    const branchId = locationId ?? (await getBranchContext()).branchId;
    const { data, error } = await supabaseAdmin
      .from("branch_role_permissions")
      .select("permission,enabled")
      .eq("business_id", businessId)
      .eq("location_id", branchId)
      .eq("role", role);

    // Older databases fall back to the existing role defaults until the
    // migration is applied. Access never expands beyond the old defaults.
    if (error) {
      if (["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code ?? "")) {
        return fallback(role);
      }
      throw new Error(`Unable to load role permissions: ${error.message}`);
    }

    if (!data?.length) return fallback(role);

    const overrides = new Map<string, boolean>();
    for (const row of data) {
      if (known.has(row.permission)) overrides.set(row.permission, row.enabled === true);
    }

    return permissions.filter((permission) =>
      overrides.has(permission)
        ? overrides.get(permission) === true
        : rolePermissions[role]?.includes(permission) === true,
    );
  },
);

const currentUserId = cache(async () => {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) throw new Error('Sign in again to verify permissions.');
  return user.id;
});

export const getEffectivePermissions = cache(async (businessId: string, role: BusinessRole) => {
  const userId = await currentUserId();
  const { data: member, error } = await supabaseAdmin.from('business_members')
    .select('id,role,is_active,team_password_required,default_location_id').eq('business_id',businessId).eq('user_id',userId).maybeSingle();
  if (error) throw new Error('Unable to verify user permissions.');
  if (!member?.is_active || member.team_password_required || member.role !== role) return [];
  if (role === 'owner') return [...permissions];
  const baseline = await getRolePermissions(businessId, role, member.default_location_id ?? undefined);
  const result = await supabaseAdmin.from('business_member_permissions').select('permission,enabled').eq('member_id',member.id);
  if (result.error) throw new Error('Unable to load individual permissions. Apply the user-permissions migration.');
  const overrides = new Map<string, boolean>((result.data ?? []).map(row => [row.permission, row.enabled === true]));
  return permissions.filter(permission => overrides.has(permission) ? overrides.get(permission) : baseline.includes(permission));
});

export async function businessHasPermission(
  business: Pick<CurrentBusiness, "id" | "role">,
  permission: Permission,
) {
  const effective = await getEffectivePermissions(business.id, business.role);
  return effective.includes(permission);
}

export async function getPermissionMatrix(businessId: string) {
  const result = {} as Record<BusinessRole, Permission[]>;
  for (const role of ["owner", "admin", "manager", "staff", "cashier"] as BusinessRole[]) {
    result[role] = await getRolePermissions(businessId, role);
  }
  return result;
}
