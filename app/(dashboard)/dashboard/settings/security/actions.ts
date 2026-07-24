"use server";

import { createClient } from "@/lib/supabase/server";

export type ChangePasswordState = {
  success: boolean;
  message: string;
};

export async function changePassword(
  _previousState: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const currentPassword = String(
    formData.get("current_password") ?? "",
  );

  const newPassword = String(
    formData.get("new_password") ?? "",
  );

  const confirmPassword = String(
    formData.get("confirm_password") ?? "",
  );

  if (!currentPassword) {
    return {
      success: false,
      message: "Current password is required.",
    };
  }

  if (newPassword.length < 8) {
    return {
      success: false,
      message:
        "New password must contain at least 8 characters.",
    };
  }

  if (newPassword.length > 72) {
    return {
      success: false,
      message:
        "New password cannot exceed 72 characters.",
    };
  }

  if (newPassword !== confirmPassword) {
    return {
      success: false,
      message:
        "New password and confirmation do not match.",
    };
  }

  if (currentPassword === newPassword) {
    return {
      success: false,
      message:
        "New password must be different from the current password.",
    };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user || !user.email) {
    return {
      success: false,
      message: "You must be logged in.",
    };
  }

  /*
   * Verify the existing password before allowing
   * the password change.
   */
  const {
    error: passwordVerificationError,
  } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (passwordVerificationError) {
    return {
      success: false,
      message: "Current password is incorrect.",
    };
  }

  const { error: updateError } =
    await supabase.auth.updateUser({
      password: newPassword,
    });

  if (updateError) {
    return {
      success: false,
      message: updateError.message,
    };
  }

  return {
    success: true,
    message: "Password changed successfully.",
  };
}