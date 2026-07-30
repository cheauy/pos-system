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
  ProductMode,
} from "@/lib/business/types";
import {
  supabaseAdmin,
} from "@/lib/supabase/admin";
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
    "editor",
    "viewer",
  ].includes(value);
}



export async function createBusinessUser(
  _previousState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  try {

 const business =
      await requireAnyPermission([
        "users.create",
        "users.create_limited",
      ]);

  const {
  data: businessLimit,
  error: businessLimitError,
} = await supabaseAdmin
  .from("businesses")
  .select("max_staff")
  .eq("id", business.id)
  .maybeSingle();

if (businessLimitError) {
  return {
    success: false,
    message:
      businessLimitError.message,
  };
}

if (!businessLimit) {
  return {
    success: false,
    message:
      "Business was not found.",
  };
}

const {
  count: activeStaffCount,
  error: staffCountError,
} = await supabaseAdmin
  .from("business_members")
  .select("id", {
    count: "exact",
    head: true,
  })
  .eq("business_id", business.id)
  .eq("is_active", true)
  .neq("role", "owner");

if (staffCountError) {
  return {
    success: false,
    message:
      staffCountError.message,
  };
}

const maxStaff = Number(
  businessLimit.max_staff ?? 3,
);

if (
  (activeStaffCount ?? 0) >= maxStaff
) {
 return {
    success: false,
    message: `You've reached the maximum of ${maxStaff} active staff members. Upgrade your staff plan or disable an active user before creating another user.`
  }
}



    const fullName = getRequiredText(
      formData,
      "fullName",
    );

    const email = getRequiredText(
      formData,
      "email",
    ).toLowerCase();

    const password = getRequiredText(
      formData,
      "password",
    );
    const confirmPassword =
  getRequiredText(
    formData,
    "confirmPassword",
  );

if (password !== confirmPassword) {
  return {
    success: false,
    message:
      "Password and confirmation password do not match.",
  };
}

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
            ? "Admins may create only Editor or Viewer users."
            : "You are not allowed to assign this role.",
      };
    }

    if (
      !email.includes("@") ||
      email.length < 5
    ) {
      return {
        success: false,
        message:
          "Enter a valid email address.",
      };
    }

    if (password.length < 8) {
      return {
        success: false,
        message:
          "Password must contain at least 8 characters.",
      };
    }

    const {
      data: createdAuthData,
      error: createAuthError,
    } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
        },
      });

    if (
      createAuthError ||
      !createdAuthData.user
    ) {
      return {
        success: false,
        message:
          createAuthError?.message ??
          "Unable to create the user.",
      };
    }

    const newUserId =
      createdAuthData.user.id;

    const {
      error: profileError,
    } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: newUserId,
          full_name: fullName,
          email,
          role: roleValue,
        },
        {
          onConflict: "id",
        },
      );

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(
        newUserId,
      );

      return {
        success: false,
        message:
          `Unable to create profile: ${profileError.message}`,
      };
    }



const {
  error: membershipError,
} = await supabaseAdmin
  .from("business_members")
  .insert({
    business_id: business.id,
    user_id: newUserId,
    role: roleValue,
    is_active: true,
  });

    if (membershipError) {
      await supabaseAdmin
        .from("profiles")
        .delete()
        .eq("id", newUserId);

      await supabaseAdmin.auth.admin.deleteUser(
        newUserId,
      );

      return {
        success: false,
        message:
          `Unable to assign business: ${membershipError.message}`,
      };
    }

    await createAuditLog({
      action: "create",
      entityType: "user",
      entityId: newUserId,
      description:
        `Created ${roleValue} user ${fullName}`,
 metadata: {
  business_id: business.id,
  email,
  role: roleValue,
  business_product_mode:
    business.productMode,
},
    });

    revalidatePath(
      "/dashboard/settings/users",
    );

   return {
  success: true,
  message:
    `${fullName} was created successfully.`,
};
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to create user.",
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
  const business =
    await requirePermission(
      "users.delete",
    );

  const memberId = getRequiredText(
    formData,
    "memberId",
  );

  const {
    data: member,
    error: memberError,
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

  if (memberError || !member) {
    throw new Error(
      memberError?.message ??
        "Business user was not found.",
    );
  }

  if (member.role === "owner") {
    throw new Error(
      "The business owner cannot be deleted.",
    );
  }

  if (
    business.role === "admin" &&
    !["editor", "viewer"].includes(
      member.role,
    )
  ) {
    throw new Error(
      "Admins may delete only Editor or Viewer users.",
    );
  }

  const {
    data: profile,
  } = await supabaseAdmin
    .from("profiles")
    .select("full_name, email")
    .eq("id", member.user_id)
    .maybeSingle();

  const {
    error: membershipDeleteError,
  } = await supabaseAdmin
    .from("business_members")
    .delete()
    .eq("id", memberId)
    .eq("business_id", business.id);

  if (membershipDeleteError) {
    throw new Error(
      membershipDeleteError.message,
    );
  }

  const {
    error: authDeleteError,
  } =
    await supabaseAdmin.auth.admin.deleteUser(
      member.user_id,
    );

  if (authDeleteError) {
    throw new Error(
      `The membership was removed, but the Auth account could not be deleted: ${authDeleteError.message}`,
    );
  }

  await createAuditLog({
    action: "delete",
    entityType: "user",
    entityId: member.user_id,
    description:
      `Deleted business user ${
        profile?.full_name ??
        profile?.email ??
        member.user_id
      }`,
    metadata: {
      business_id: business.id,
      deleted_role: member.role,
      email: profile?.email ?? null,
    },
  });

  revalidatePath(
    "/dashboard/settings/users",
  );

  return {
    success: true,
  };
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
    !["editor", "viewer"].includes(
      member.role,
    )
  ) {
    throw new Error(
      "Admins may manage only Editor and Viewer users.",
    );
  }

  const newStatus = !member.is_active;
  if (newStatus) {
  const {
    data: businessLimit,
    error: businessLimitError,
  } = await supabaseAdmin
    .from("businesses")
    .select("max_staff")
    .eq("id", business.id)
    .maybeSingle();

  if (businessLimitError) {
   return {
        success: false,
        message:
          businessLimitError.message,
      };
  }

  if (!businessLimit) {
 return {
        success: false,
        message:
          "Business was not found.",
      };
  }

  const {
    count: activeStaffCount,
    error: staffCountError,
  } = await supabaseAdmin
    .from("business_members")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("business_id", business.id)
    .eq("is_active", true)
    .neq("role", "owner");

  if (staffCountError) {
    return {
        success: false,
        message:
          staffCountError.message,
      };
  }

  const maxStaff = Number(
    businessLimit.max_staff ?? 3,
  );

  if (
    (activeStaffCount ?? 0) >= maxStaff
  ) {
 return {
        success: false,
        message: `The business has reached its ${maxStaff}-staff limit. Disable one active user before enabling another.`,
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
