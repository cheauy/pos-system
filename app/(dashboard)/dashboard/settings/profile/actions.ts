"use server";

import { revalidatePath } from "next/cache";

import { getCurrentBusiness } from "@/lib/business/get-current-business";
import { supabaseAdmin } from "@/lib/supabase/admin";
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
  const requestedBusinessName = formData.get("business_name");
  const businessName =
    typeof requestedBusinessName === "string"
      ? requestedBusinessName.trim()
      : null;

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

  if (businessName !== null && (businessName.length < 2 || businessName.length > 100)) {
    return {
      success: false,
      message: "Business name must be between 2 and 100 characters.",
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

  const business = await getCurrentBusiness();

  if (businessName !== null && businessName !== business.name) {
    if (business.role !== "owner") {
      return {
        success: false,
        message: "Only the business Owner can change the business name.",
      };
    }

    const { error: businessUpdateError } = await supabaseAdmin
      .from("businesses")
      .update({ name: businessName })
      .eq("id", business.id);

    if (businessUpdateError) {
      return {
        success: false,
        message: businessUpdateError.message,
      };
    }
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
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/settings");

  return {
    success: true,
    message: "Profile updated successfully.",
  };
}