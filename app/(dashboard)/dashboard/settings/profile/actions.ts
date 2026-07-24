"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type UpdateProfileState = {
  success: boolean;
  message: string;
};

export async function updateProfile(
  _previousState: UpdateProfileState,
  formData: FormData,
): Promise<UpdateProfileState> {
  const fullName = String(
    formData.get("full_name") ?? "",
  ).trim();

  if (!fullName) {
    return {
      success: false,
      message: "Full name is required.",
    };
  }

  if (fullName.length < 2) {
    return {
      success: false,
      message: "Full name must contain at least 2 characters.",
    };
  }

  if (fullName.length > 100) {
    return {
      success: false,
      message: "Full name cannot exceed 100 characters.",
    };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      success: false,
      message: "You must be logged in.",
    };
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (updateError) {
    return {
      success: false,
      message: updateError.message,
    };
  }

  revalidatePath("/dashboard/settings/profile");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");

  return {
    success: true,
    message: "Profile updated successfully.",
  };
}