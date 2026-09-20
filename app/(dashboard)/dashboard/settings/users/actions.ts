"use server";
import {
  revalidatePath,
} from "next/cache";



import type {
  UserStatusActionState,
} from "./state";
import {
  requireAnyPermission,
  requirePermission,
} from "@/lib/auth/require-permission";
import {
  canAssignRole,
} from "@/lib/auth/user-role-options";
import type {
  BusinessRole,
} from "@/lib/business/types";
import {
  supabaseAdmin,
} from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { assertBranchOperation } from "@/lib/subscriptions/branch-limits";
import { getAppUrl } from "@/lib/tenancy/domain";
import {
  createAuditLog,
} from "@/lib/audit/create-audit-log";

export type UserActionState = {
  success: boolean;
  message: string;
  updatedRole?: BusinessRole;
};

function getRequiredText(
  formData: FormData,
  key: string,
) {
  const value = formData.get(key);

  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(`${key} is required.`);
  }

  return value.trim();
}

function isBusinessRole(
  value: string,
): value is BusinessRole {
  return [
    "owner",
    "admin",
    "manager",
    "cashier",
  ].includes(value);
}

type SeatPolicyRow = {
  max_staff: number | null;
  subscription_status: string | null;
  subscription_plan_key: string | null;
  subscription_user_limit: number | null;
  subscription_team_enabled: boolean | null;
};

function resolveSeatPolicy(row: SeatPolicyRow) {
  const status = row.subscription_status ?? "active";

  if (["trial_pending", "trialing", "trial_blocked"].includes(status)) {
    return { maxUsers: 1, teamEnabled: false, label: "7-day free trial" };
  }

  if (status === "expired") {
    return { maxUsers: 1, teamEnabled: false, label: "expired subscription" };
  }

  const configuredLimit = Number(row.subscription_user_limit ?? 0);
  const maxUsers =
    Number.isInteger(configuredLimit) && configuredLimit > 0
      ? configuredLimit
      : Math.max(1, Number(row.max_staff ?? 0) + 1);

  const teamEnabled =
    row.subscription_team_enabled ?? maxUsers > 1;

  return {
    maxUsers: teamEnabled ? maxUsers : 1,
    teamEnabled,
    label: row.subscription_plan_key || "current subscription",
  };
}

async function loadSeatPolicy(businessId: string) {
  const { data, error } = await supabaseAdmin
    .from("businesses")
    .select(
      "max_staff,subscription_status,subscription_plan_key,subscription_user_limit,subscription_team_enabled",
    )
    .eq("id", businessId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Business was not found.");

  return resolveSeatPolicy(data as SeatPolicyRow);
}

async function assertAvailableUserSeat(
  businessId: string,
  options: { excludeMemberId?: string } = {},
) {
  const policy = await loadSeatPolicy(businessId);

  if (!policy.teamEnabled || policy.maxUsers <= 1) {
    throw new Error(
      policy.label === "7-day free trial"
        ? "The 7-day free trial includes the owner only. Choose a paid team plan to add staff."
        : "Your current subscription includes the owner only. Upgrade to a team plan to add staff.",
    );
  }

  let query = supabaseAdmin
    .from("business_members")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("is_active", true);

  if (options.excludeMemberId) {
    query = query.neq("id", options.excludeMemberId);
  }

  const { count, error } = await query;
  if (error) throw new Error(error.message);

  if ((count ?? 0) >= policy.maxUsers) {
    throw new Error(
      `This subscription allows ${policy.maxUsers} total user${policy.maxUsers === 1 ? "" : "s"}, including the owner. Disable or remove a user, or upgrade the subscription before adding another member.`,
    );
  }

  return policy;
}


export async function createBusinessUser(
  _previousState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  try {
    const business = await requireAnyPermission([
      "users.create",
      "users.create_limited",
    ]);

    await assertAvailableUserSeat(business.id);

    const fullName = getRequiredText(formData, "fullName");
    const email = getRequiredText(formData, "email").toLowerCase();
    const password = getRequiredText(formData, "password");
    const confirmPassword = getRequiredText(formData, "confirmPassword");
    const roleValue = getRequiredText(formData, "role");
    const branchId = getRequiredText(formData, "branchId");
    await assertBranchOperation(business.id, branchId);
    const sendInviteEmail = formData.get("sendInviteEmail") === "on";
    const requirePasswordChange =
      sendInviteEmail || formData.get("requirePasswordChange") === "on";

    if (password !== confirmPassword) {
      return {
        success: false,
        message: "Password and confirmation password do not match.",
      };
    }

    if (!isBusinessRole(roleValue)) {
      return { success: false, message: "Invalid role." };
    }

    if (!canAssignRole(business.role, roleValue)) {
      return {
        success: false,
        message:
          business.role === "admin"
            ? "Admins may create only Manager or Cashier users."
            : "You are not allowed to assign this role.",
      };
    }

    if (!email.includes("@") || email.length < 5) {
      return { success: false, message: "Enter a valid email address." };
    }

    if (password.length < 8) {
      return {
        success: false,
        message: "Password must contain at least 8 characters.",
      };
    }

    const baseMetadata = {
      full_name: fullName,
      business_id: business.id,
      business_role: roleValue,
      require_password_change: requirePasswordChange,
      staff_invite_pending: false,
    };

    const { data: createdAuthData, error: createAuthError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: baseMetadata,
      });

    if (createAuthError || !createdAuthData.user) {
      const message = createAuthError?.message ?? "Unable to create the user.";
      return {
        success: false,
        message: /already|registered|exists/i.test(message)
          ? "An account with this email already exists."
          : message,
      };
    }

    const newUserId = createdAuthData.user.id;

    async function cleanupCreatedAccount() {
      await supabaseAdmin
        .from("business_members")
        .delete()
        .eq("business_id", business.id)
        .eq("user_id", newUserId);
      await supabaseAdmin.from("profiles").delete().eq("id", newUserId);
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: newUserId,
          full_name: fullName,
          email,
          role: roleValue,
          business_id: business.id,
          is_active: true,
        },
        { onConflict: "id" },
      );

    if (profileError) {
      await cleanupCreatedAccount();
      return {
        success: false,
        message: `Unable to create profile: ${profileError.message}`,
      };
    }

    const { error: membershipError } = await supabaseAdmin
      .from("business_members")
      .insert({
        business_id: business.id,
        user_id: newUserId,
        role: roleValue,
        default_location_id: branchId,
        is_active: true,
      });

    if (membershipError) {
      await cleanupCreatedAccount();
      return {
        success: false,
        message: `Unable to assign business access: ${membershipError.message}`,
      };
    }

    let inviteWarning = "";

    if (sendInviteEmail) {
      try {
        const supabase = await createClient();
        const { error: inviteError } =
          await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: getAppUrl("/reset-password"),
          });

        if (inviteError) {
          inviteWarning = ` User created, but the invite email could not be sent: ${inviteError.message}`;
        } else {
          await supabaseAdmin.auth.admin.updateUserById(newUserId, {
            user_metadata: {
              ...baseMetadata,
              staff_invite_pending: true,
              require_password_change: true,
            },
          });
        }
      } catch (inviteError) {
        inviteWarning = ` User created, but the invite email could not be sent: ${
          inviteError instanceof Error
            ? inviteError.message
            : "unknown email error"
        }`;
      }
    }

    await createAuditLog({
      action: "create",
      entityType: "user",
      entityId: newUserId,
      description: `Created ${roleValue} user ${fullName}`,
      metadata: {
        business_id: business.id,
        email,
        role: roleValue,
        business_product_mode: business.productMode,
        send_invite_email: sendInviteEmail,
        require_password_change: requirePasswordChange,
      },
    });

    revalidatePath("/dashboard/settings/users");

    return {
      success: true,
      message: `${fullName} was created successfully.${inviteWarning}`,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Unable to create user.",
    };
  }
}

export async function updateBusinessUserRole(
  _previousState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  try {
    const business =
      await requirePermission(
        "users.update_role",
      );

    const memberId = getRequiredText(
      formData,
      "memberId",
    );

    const roleValue = getRequiredText(
      formData,
      "role",
    );

    if (!isBusinessRole(roleValue)) {
      return {
        success: false,
        message: "Invalid role.",
      };
    }

    if (
      !canAssignRole(
        business.role,
        roleValue,
      )
    ) {
      return {
        success: false,
        message:
          business.role === "admin"
            ? "Admins may assign only Manager or Cashier."
            : "You cannot assign this role.",
      };
    }

    const {
      data: targetMember,
      error: targetError,
    } = await supabaseAdmin
      .from("business_members")
      .select(`
        id,
        user_id,
        role
      `)
      .eq("id", memberId)
      .eq("business_id", business.id)
      .maybeSingle();

    if (targetError) {
      return {
        success: false,
        message: targetError.message,
      };
    }

    if (!targetMember) {
      return {
        success: false,
        message:
          "Business member was not found.",
      };
    }

    if (targetMember.role === "owner") {
      return {
        success: false,
        message:
          "The business owner role cannot be changed.",
      };
    }

    if (
      business.role === "admin" &&
      !["manager", "cashier"].includes(
        targetMember.role,
      )
    ) {
      return {
        success: false,
        message:
          "Admins can manage only Manager and Cashier users.",
      };
    }

    if (
      business.role === "admin" &&
      !["manager", "cashier"].includes(
        roleValue,
      )
    ) {
      return {
        success: false,
        message:
          "Admins may assign only Manager or Cashier roles.",
      };
    }

    if (targetMember.role === roleValue) {
      return {
        success: false,
        message:
          "This user already has the selected role.",
      };
    }

    const {
      data: updatedMember,
      error: membershipError,
    } = await supabaseAdmin
      .from("business_members")
      .update({
        role: roleValue,
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", memberId)
      .eq("business_id", business.id)
      .select("id, role")
      .maybeSingle();

    if (membershipError) {
      return {
        success: false,
        message: membershipError.message,
      };
    }

    if (!updatedMember) {
      return {
        success: false,
        message:
          "The user role was not updated.",
      };
    }

    const {
      error: profileUpdateError,
    } = await supabaseAdmin
      .from("profiles")
      .update({
        role: roleValue,
      })
      .eq("id", targetMember.user_id);

    if (profileUpdateError) {
      await supabaseAdmin
        .from("business_members")
        .update({
          role: targetMember.role,
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", memberId)
        .eq("business_id", business.id);

      return {
        success: false,
        message:
          `Unable to update the profile role: ${profileUpdateError.message}`,
      };
    }

    await createAuditLog({
      action: "update",
      entityType: "user",
      entityId: targetMember.user_id,
      description:
        `Changed user role from ${targetMember.role} to ${roleValue}`,
      metadata: {
        business_id: business.id,
        old_role: targetMember.role,
        new_role: roleValue,
      },
    });

    revalidatePath(
      "/dashboard/settings/users",
    );

    return {
      success: true,
      message:
        "User role updated successfully.",
      updatedRole: roleValue,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to update user role.",
    };
  }
}

export async function deleteBusinessUser(
  formData: FormData,
) {
  const business = await requirePermission("users.delete");
  const memberId = getRequiredText(formData, "memberId");

  const { data: member, error: memberError } = await supabaseAdmin
    .from("business_members")
    .select("id,user_id,role,is_active")
    .eq("id", memberId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (memberError || !member) {
    throw new Error(memberError?.message ?? "Business user was not found.");
  }

  if (member.role === "owner") {
    throw new Error("The business owner cannot be removed from Users settings.");
  }

  if (
    business.role === "admin" &&
    !["manager", "cashier"].includes(member.role)
  ) {
    throw new Error("Admins may remove only Manager or Cashier users.");
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("full_name,email")
    .eq("id", member.user_id)
    .maybeSingle();

  // Removing somebody from a business must not destroy their TENH Auth account:
  // the same person may belong to another business. Keep a disabled membership
  // tombstone so a signed-in user gets a clear "access removed" state.
  const { error: removeError } = await supabaseAdmin
    .from("business_members")
    .update({
      is_active: false,
      disabled_at: new Date().toISOString(),
      disabled_reason: "removed_by_owner",
      updated_at: new Date().toISOString(),
    })
    .eq("id", memberId)
    .eq("business_id", business.id);

  if (removeError) throw new Error(removeError.message);

  await createAuditLog({
    action: "delete",
    entityType: "user",
    entityId: member.user_id,
    description: `Removed business user ${
      profile?.full_name ?? profile?.email ?? member.user_id
    }`,
    metadata: {
      business_id: business.id,
      removed_role: member.role,
      email: profile?.email ?? null,
      auth_account_deleted: false,
    },
  });

  revalidatePath("/dashboard/settings/users");
  return { success: true };
}

export async function toggleBusinessUserStatus(
   _previousState: UserStatusActionState,
  formData: FormData,
) : Promise<UserStatusActionState>{
  const business =
    await requirePermission(
      "users.update_role",
    );

  const memberId = getRequiredText(
    formData,
    "memberId",
  );

  const { data: member, error } =
    await supabaseAdmin
      .from("business_members")
      .select(`
        id,
        user_id,
        role,
        is_active
      `)
      .eq("id", memberId)
      .eq("business_id", business.id)
      .maybeSingle();

if (error) {
    return {
      success: false,
      message: error.message,
    };
  }

  if (!member) {
    return {
      success: false,
      message: "Business user was not found.",
    };
  }

  if (member.role === "owner") {
    return {
      success: false,
      message: "The business owner cannot be disabled.",
    };
  }


  if (
    business.role === "admin" &&
    !["manager", "cashier"].includes(
      member.role,
    )
  ) {
    throw new Error(
      "Admins may manage only Manager and Cashier users.",
    );
  }

  const newStatus = !member.is_active;
  if (newStatus) {
    try {
      await assertAvailableUserSeat(business.id, { excludeMemberId: memberId });
    } catch (seatError) {
      return {
        success: false,
        message:
          seatError instanceof Error
            ? seatError.message
            : "Unable to verify subscription user limit.",
      };
    }
  }



 const { error: updateError } =
  await supabaseAdmin
    .from("business_members")
    .update({
      is_active: newStatus,
      disabled_at: newStatus
        ? null
        : new Date().toISOString(),
      disabled_reason: newStatus
        ? null
        : "manually_disabled",
      updated_at:
        new Date().toISOString(),
    })
    .eq("id", memberId)
    .eq("business_id", business.id);

  await createAuditLog({
    action: "update",
    entityType: "user",
    entityId: member.user_id,
    description: newStatus
      ? "Activated business user"
      : "Disabled business user",
    metadata: {
      business_id: business.id,
      is_active: newStatus,
    },
  });

  if (updateError) {
    return {
      success: false,
      message: updateError.message,
    };
  }

  revalidatePath(
    "/dashboard/settings/users",
  );

  return {
    success: true,
    message: newStatus
      ? "User enabled successfully."
      : "User disabled successfully.",
  };
}

export async function assignMemberBranch(memberId: string, branchId: string) {
  try {
    const business = await requirePermission("users.update_role");
    await assertBranchOperation(business.id, branchId);
    const { data: member, error } = await supabaseAdmin.from("business_members").select("id,role").eq("business_id", business.id).eq("id", memberId).single();
    if (error || !member) throw new Error("Business member not found.");
    if (business.role !== "owner" && !(business.role === "admin" && ["manager", "cashier"].includes(member.role))) throw new Error("You cannot change this user's branch.");
    const result = await supabaseAdmin.from("business_members").update({default_location_id: branchId, updated_at: new Date().toISOString()}).eq("business_id", business.id).eq("id", memberId);
    if (result.error) throw new Error(result.error.message);
    revalidatePath("/dashboard/settings/users");
    return {success: true, message: "Assigned branch saved."};
  } catch (error) { return {success: false, message: error instanceof Error ? error.message : "Unable to assign branch."}; }
}
