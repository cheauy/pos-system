"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type ChangePasswordState = {
  success: boolean;
  message: string;
};

export type DeleteAccountState = {
  success: boolean;
  message: string;
};

function hasStrongPassword(value: string) {
  return (
    value.length >= 8 &&
    /[A-Z]/.test(value) &&
    /[a-z]/.test(value) &&
    /\d/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
}

export async function changePassword(
  _previousState: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const currentPassword = String(formData.get("current_password") ?? "");
  const newPassword = String(formData.get("new_password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (!hasStrongPassword(newPassword)) {
    return {
      success: false,
      message:
        "Use at least 8 characters with uppercase, lowercase, a number and a symbol.",
    };
  }

  if (newPassword.length > 72) {
    return {
      success: false,
      message: "New password cannot exceed 72 characters.",
    };
  }

  if (newPassword !== confirmPassword) {
    return {
      success: false,
      message: "New password and confirmation do not match.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user || !user.email) {
    return { success: false, message: "You must be logged in." };
  }

  const hasPasswordIdentity =
    user.identities?.some((identity) => identity.provider === "email") ?? false;

  if (hasPasswordIdentity) {
    if (!currentPassword) {
      return { success: false, message: "Current password is required." };
    }

    if (currentPassword === newPassword) {
      return {
        success: false,
        message: "New password must be different from the current password.",
      };
    }

    const { error: verificationError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (verificationError) {
      return { success: false, message: "Current password is incorrect." };
    }
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateError) {
    return { success: false, message: updateError.message };
  }

  // A password change is a good time to revoke refresh tokens on other devices.
  await supabase.auth.signOut({ scope: "others" });

  return {
    success: true,
    message: hasPasswordIdentity
      ? "Password changed successfully. Other device sessions were signed out."
      : "Password created successfully. You can now sign in with email and password.",
  };
}

export async function deleteOwnAccount(
  _previousState: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const confirmation = String(formData.get("confirmation") ?? "").trim();

  if (confirmation !== "DELETE") {
    return {
      success: false,
      message: 'Type "DELETE" to confirm account deletion.',
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, message: "You must be logged in." };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return { success: false, message: profileError.message };
  }

  if (profile?.role === "super_admin") {
    return {
      success: false,
      message: "A Super Admin account cannot delete itself from this page.",
    };
  }

  const { data: ownerMemberships, error: ownerError } = await supabaseAdmin
    .from("business_members")
    .select("business_id")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .eq("is_active", true);

  if (ownerError) {
    return { success: false, message: ownerError.message };
  }

  if ((ownerMemberships ?? []).length > 0) {
    const businessIds = ownerMemberships!.map((membership) => membership.business_id);
    const { data: businesses } = await supabaseAdmin
      .from("businesses")
      .select("name")
      .in("id", businessIds);

    const names = (businesses ?? [])
      .map((business) => business.name)
      .filter(Boolean)
      .join(", ");

    return {
      success: false,
      message:
        `You are the protected owner${names ? ` of ${names}` : " of a business"}. ` +
        "Transfer ownership through Super Admin before deleting this account.",
    };
  }

  // Soft-delete preserves historical foreign-key references while permanently
  // disabling this Auth identity. This is safer for POS/audit history.
  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(
    user.id,
    true,
  );

  if (deleteError) {
    return { success: false, message: deleteError.message };
  }

  await supabaseAdmin
    .from("business_members")
    .update({
      is_active: false,
      disabled_at: new Date().toISOString(),
      disabled_reason: "account_deleted",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  await supabaseAdmin
    .from("profiles")
    .update({ is_active: false })
    .eq("id", user.id);

  return {
    success: true,
    message: "Your account has been deleted.",
  };
}
