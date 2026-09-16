import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  CircleUserRound,
  ShieldCheck,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";

import SecurityForm from "./security-form";

type ProfileRow = {
  full_name: string | null;
  role: string;
  is_active: boolean;
};

export default async function SecurityPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { data, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, role, is_active")
    .eq("id", user.id)
    .single();

  const profile = data as ProfileRow | null;

  if (profileError || !profile) {
    return (
      <main className="mx-auto w-full max-w-[1600px] pb-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h1 className="text-xl font-semibold text-red-700">Unable to load account</h1>
          <p className="mt-2 text-sm text-red-600">
            {profileError?.message ?? "Profile not found."}
          </p>
        </div>
      </main>
    );
  }

  if (!profile.is_active) {
    redirect("/account-disabled");
  }

  const hasPasswordIdentity =
    user.identities?.some((identity) => identity.provider === "email") ?? false;

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-5 pb-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href="/dashboard/settings"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to settings
          </Link>

          <div className="mt-4 flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
              <ShieldCheck className="h-9 w-9" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
                Security
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Manage your password, login methods and keep your account safe.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
              Your account is protected
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Security controls are active
            </p>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
            <CircleUserRound className="h-9 w-9" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-slate-950 dark:text-white">
              {profile.full_name || "Unnamed User"}
            </h2>
            <p className="truncate text-sm text-slate-500 dark:text-slate-400">
              {user.email ?? "No email"}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold capitalize text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                {profile.role}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Active
              </span>
            </div>
          </div>
        </div>

        <Link
          href="/dashboard/settings/profile"
          className="inline-flex items-center justify-center rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 dark:border-blue-900 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-blue-950/30"
        >
          Edit profile
        </Link>
      </section>

      <SecurityForm
        email={user.email ?? ""}
        emailVerified={Boolean(user.email_confirmed_at)}
        hasPasswordIdentity={hasPasswordIdentity}
        lastSignInAt={user.last_sign_in_at ?? null}
        profileRole={profile.role}
      />
    </main>
  );
}
