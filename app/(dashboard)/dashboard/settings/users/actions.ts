"use server";

import { revalidatePath } from "next/cache";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type CreateUserState = {
  success: boolean;
  message: string;
};

export async function createEmployee(
  _previousState: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  const fullName = String(
    formData.get("full_name") ?? "",
  ).trim();

  const email = String(
    formData.get("email") ?? "",
  )
    .trim()
    .toLowerCase();

  const password = String(
    formData.get("password") ?? "",
  );

  const role = String(
    formData.get("role") ?? "cashier",
  );

  if (!fullName) {
    return {
      success: false,
      message: "Full name is required.",
    };
  }

  if (!email) {
    return {
      success: false,
      message: "Email is required.",
    };
  }

  if (password.length < 8) {
    return {
      success: false,
      message: "Password must contain at least 8 characters.",
    };
  }

  if (
    !["admin", "manager", "cashier"].includes(role)
  ) {
    return {
      success: false,
      message: "Invalid role selected.",
    };
  }

  // Check the currently logged-in user.
  const supabase = await createClient();

  const {
    data: { user: currentUser },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !currentUser) {
    return {
      success: false,
      message: "You must be logged in.",
    };
  }

  // Confirm that the current user is an Admin.
  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", currentUser.id)
    .single();

  const canManageUsers =
  currentProfile?.role === "owner" ||
  currentProfile?.role === "admin";

if (
  !currentProfile ||
  !canManageUsers ||
  !currentProfile.is_active
) {
  return {
    success: false,
    message: "Only an Owner or Admin can create users.",
  };
}

  // Create the employee's Auth account.
  const {
    data: createdUser,
    error: createError,
  } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
    },
  });

  if (createError || !createdUser.user) {
    return {
      success: false,
      message:
        createError?.message ??
        "Unable to create the user.",
    };
  }

  

  // The trigger creates a cashier profile.
  // Update it with the role selected by the Admin.
  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({
      full_name: fullName,
      role,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", createdUser.user.id);

  if (profileError) {
    // Remove the Auth user if profile creation fails.
    await supabaseAdmin.auth.admin.deleteUser(
      createdUser.user.id,
    );

    return {
      success: false,
      message: `Profile error: ${profileError.message}`,
    };
  }

  revalidatePath(
    "/dashboard/settings/users",
  );

  return {
    success: true,
    message: "User created successfully.",
  };
}

export type DeleteUserState = {
  success: boolean;
  message: string;
};

export async function deleteEmployee(
  userId: string,
): Promise<DeleteUserState> {
  if (!userId) {
    return {
      success: false,
      message: "User ID is required.",
    };
  }

  const supabase = await createClient();

  const {
    data: { user: currentUser },
    error: currentUserError,
  } = await supabase.auth.getUser();

  if (currentUserError || !currentUser) {
    return {
      success: false,
      message: "You must be logged in.",
    };
  }

  if (currentUser.id === userId) {
    return {
      success: false,
      message: "You cannot delete your own account.",
    };
  }

  const {
    data: currentProfile,
    error: currentProfileError,
  } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", currentUser.id)
    .single();

  if (currentProfileError || !currentProfile) {
    return {
      success: false,
      message: "Unable to verify your permission.",
    };
  }

  const canDeleteUsers =
    currentProfile.role === "owner" ||
    currentProfile.role === "admin";

  if (!canDeleteUsers || !currentProfile.is_active) {
    return {
      success: false,
      message:
        "Only an active Owner or Admin can delete users.",
    };
  }

  const {
    data: targetProfile,
    error: targetProfileError,
  } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", userId)
    .single();

  if (targetProfileError || !targetProfile) {
    return {
      success: false,
      message: "User profile was not found.",
    };
  }

  if (targetProfile.role === "owner") {
    return {
      success: false,
      message: "Owner accounts cannot be deleted.",
    };
  }

  if (
    currentProfile.role === "admin" &&
    targetProfile.role === "admin"
  ) {
    return {
      success: false,
      message:
        "Only the Owner can delete an Admin account.",
    };
  }

  const { error: deleteError } =
    await supabaseAdmin.auth.admin.deleteUser(
      userId,
    );

  if (deleteError) {
    return {
      success: false,
      message: deleteError.message,
    };
  }

  revalidatePath("/dashboard/settings/users");

  return {
    success: true,
    message: "User deleted successfully.",
  };
}
