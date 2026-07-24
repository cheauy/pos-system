"use server";

import { revalidatePath } from "next/cache";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AppearanceActionState = {
  success: boolean;
  message: string;
};

const allowedThemes = ["system", "light", "dark"] as const;
const allowedLanguages = ["en", "km"] as const;

export async function updateAppearanceSettings(
  _previousState: AppearanceActionState,
  formData: FormData,
): Promise<AppearanceActionState> {
  const settingsId = String(
    formData.get("settings_id") ?? "",
  );

  const defaultTheme = String(
    formData.get("default_theme") ?? "",
  );

  const defaultLanguage = String(
    formData.get("default_language") ?? "",
  );

  if (!settingsId) {
    return {
      success: false,
      message: "Settings ID is missing.",
    };
  }

  if (
    !allowedThemes.includes(
      defaultTheme as (typeof allowedThemes)[number],
    )
  ) {
    return {
      success: false,
      message: "Invalid theme selected.",
    };
  }

  if (
    !allowedLanguages.includes(
      defaultLanguage as (typeof allowedLanguages)[number],
    )
  ) {
    return {
      success: false,
      message: "Invalid language selected.",
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

  const { data: profile, error: profileError } =
    await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .single();

  if (
    profileError ||
    !profile ||
    profile.is_active !== true
  ) {
    return {
      success: false,
      message: "Unable to verify your account.",
    };
  }

  if (
    profile.role !== "owner" &&
    profile.role !== "admin"
  ) {
    return {
      success: false,
      message:
        "Only Owner or Admin can update appearance settings.",
    };
  }

  const { error: updateError } = await supabaseAdmin
    .from("system_settings")
    .update({
      default_theme: defaultTheme,
      default_language: defaultLanguage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", settingsId);

  if (updateError) {
    return {
      success: false,
      message: updateError.message,
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings/system");

  return {
    success: true,
    message: "Appearance settings updated successfully.",
  };
}