import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  CircleUserRound,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";

import ProfileForm from "./profile-form";

export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from("profiles")
    .select(
      "full_name, role, is_active",
    )
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <h1 className="text-xl font-semibold text-red-700">
          Unable to load profile
        </h1>

        <p className="mt-2 text-sm text-red-600">
          {profileError?.message ??
            "Profile not found."}
        </p>
      </div>
    );
  }

  if (!profile.is_active) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <h1 className="text-xl font-semibold text-red-700">
          Account inactive
        </h1>

        <p className="mt-2 text-sm text-red-600">
          Contact the Owner or Admin.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/settings"
          aria-label="Back to settings"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-white transition hover:bg-gray-100"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>

        <div>
          <h1 className="text-3xl font-bold">
            Profile
          </h1>

          <p className="text-sm text-gray-500">
            Manage your personal information.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 rounded-xl border bg-white p-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
          <CircleUserRound className="h-9 w-9 text-blue-600" />
        </div>

        <div>
          <h2 className="text-lg font-semibold">
            {profile.full_name ||
              "Unnamed User"}
          </h2>

          <p className="text-sm text-gray-500">
            {user.email ?? "No email"}
          </p>

          <span className="mt-2 inline-block rounded-full bg-blue-50 px-3 py-1 text-xs font-medium capitalize text-blue-700">
            {profile.role}
          </span>
        </div>
      </div>

      <ProfileForm
        defaultFullName={
          profile.full_name ?? ""
        }
        email={user.email ?? ""}
        role={profile.role}
      />
    </div>
  );
}