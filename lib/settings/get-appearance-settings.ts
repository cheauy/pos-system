import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export type AppAppearanceSettings = {
  default_theme: "system" | "light" | "dark";
  default_language: "en" | "km";
};

const defaultSettings: AppAppearanceSettings = {
  default_theme: "system",
  default_language: "en",
};

export async function getAppearanceSettings(): Promise<AppAppearanceSettings> {
  const { data, error } = await supabaseAdmin
    .from("system_settings")
    .select("default_theme, default_language")
    .limit(1)
    .maybeSingle()
    .overrideTypes<AppAppearanceSettings>();

  if (error || !data) {
    return defaultSettings;
  }

  return {
    default_theme:
      data.default_theme === "light" ||
      data.default_theme === "dark"
        ? data.default_theme
        : "system",

    default_language:
      data.default_language === "km" ? "km" : "en",
  };
}