import Link from "next/link";
import { redirect } from "next/navigation";

import {
  ArrowLeft,
  ShieldCheck,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";

import SecurityForm from "./security-form";

export default async function SecurityPage() {
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
    .select("full_name, role, is_active")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <h1 className="text-xl font-semibold text-red-700">
          Unable to load account
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
            Security
          </h1>

          <p className="text-sm text-gray-500">
            Manage your password and account
            security.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 rounded-xl border bg-white p-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
          <ShieldCheck className="h-7 w-7 text-green-600" />
        </div>

        <div>
          <h2 className="font-semibold">
            Account Security
          </h2>

          <p className="text-sm text-gray-500">
            Signed in as{" "}
            <span className="font-medium text-gray-700">
              {user.email ?? "Unknown email"}
            </span>
          </p>

          <p className="mt-1 text-xs capitalize text-gray-500">
            Role: {profile.role}
          </p>
        </div>
      </div>

      <SecurityForm />
    </div>
  );
}