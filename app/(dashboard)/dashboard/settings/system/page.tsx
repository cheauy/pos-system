import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Palette } from "lucide-react";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import AppearanceForm, {
  type AppearanceSettings,
} from "./appearance-form";

export default async function SystemPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    profile.is_active !== true ||
    !["owner", "admin"].includes(profile.role)
  ) {
    redirect("/dashboard/settings");
  }

  const { data: settings, error } = await supabaseAdmin
    .from("system_settings")
    .select("id, default_theme, default_language")
    .limit(1)
    .single()
    .overrideTypes<AppearanceSettings>();

  if (error || !settings) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5">
        <p className="font-medium text-red-700">
          Unable to load appearance settings
        </p>

        <p className="mt-1 text-sm text-red-600">
          {error?.message ??
            "System settings record was not found."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/settings"
          className="rounded-lg border p-2 hover:bg-gray-50 dark:hover:bg-gray-900"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>

        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
          <Palette className="h-6 w-6 text-blue-600" />
        </div>

        <div>
          <h1 className="text-2xl font-bold">
            Appearance Settings
          </h1>

          <p className="text-sm text-gray-500">
            Manage the default theme and language.
          </p>
        </div>
      </div>

      <AppearanceForm settings={settings} />
    </div>
  );
}