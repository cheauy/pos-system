import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  Info,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/lib/business/get-current-business";

import ProfileForm from "./profile-form";
import styles from "./profile-responsive.module.css";

type ProfileRow = {
  full_name: string | null;
  role: string;
  is_active: boolean;
  updated_at: string | null;
};

export default async function ProfilePage() {
  const supabase = await createClient();
  // The business check is an access guard only; it does not feed the user lookup.
  const [, {
    data: { user },
    error: userError,
  }] = await Promise.all([getCurrentBusiness(), supabase.auth.getUser()]);

  if (userError || !user) {
    redirect("/login");
  }

  const { data, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, role, is_active, updated_at")
    .eq("id", user.id)
    .single();

  const profile = data as ProfileRow | null;

  if (profileError || !profile) {
    return (
      <main className="mx-auto w-full max-w-[1600px] pb-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h1 className="text-xl font-semibold text-red-700">Unable to load profile</h1>
          <p className="mt-2 text-sm text-red-600">
            {profileError?.message ?? "Profile not found."}
          </p>
        </div>
      </main>
    );
  }

  if (!profile.is_active) {
    return (
      <main className="mx-auto w-full max-w-[1600px] pb-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h1 className="text-xl font-semibold text-red-700">Account inactive</h1>
          <p className="mt-2 text-sm text-red-600">Contact the Owner or Admin.</p>
        </div>
      </main>
    );
  }

  return (
    <main className={`mx-auto w-full max-w-[1600px] space-y-5 pb-8 ${styles.page}`}>
      <section className={styles.intro}>
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to settings
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
          Profile
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Manage your personal information.
        </p>
      </section>

      <ProfileForm
        defaultFullName={profile.full_name ?? ""}
        email={user.email ?? ""}
        role={profile.role}
        showIdentity
        avatarUrl={typeof user.user_metadata?.avatar_url === 'string' && user.user_metadata.avatar_url.startsWith('https://') ? user.user_metadata.avatar_url : undefined}
        lastUpdated={formatLastUpdated(profile.updated_at)}
        security={(
        <aside id="profile-security" aria-labelledby="profile-security-tab" className={`${styles.security} rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900`}>
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-950 dark:text-white">Security</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Keep your account secure.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <SecurityLink
              icon={KeyRound}
              title="Change password"
              description="Update your password regularly for better security."
            />
            <SecurityLink
              icon={LockKeyhole}
              title="Login security"
              description="Review the security controls available for your account."
            />
          </div>

          <div className="mt-5 flex items-start gap-3 rounded-xl bg-blue-50 px-4 py-4 dark:bg-blue-950/30">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300" />
            <div>
              <p className="text-sm font-bold text-blue-700 dark:text-blue-200">
                Your account is secured
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                Keep your information up to date and use a strong password.
              </p>
            </div>
          </div>
        </aside>
        )}
      />
    </main>
  );
}

function SecurityLink({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link
      href="/dashboard/settings/security"
      className="group flex items-center gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-blue-200 hover:bg-blue-50/40 dark:border-slate-700 dark:hover:border-blue-900 dark:hover:bg-blue-950/20"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-950 dark:text-white">{title}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-blue-600" />
    </Link>
  );
}

function formatLastUpdated(value: string | null) {
  if (!value) return "Profile information up to date";

  const updated = new Date(value);
  const now = new Date();
  const sameDay =
    updated.getFullYear() === now.getFullYear() &&
    updated.getMonth() === now.getMonth() &&
    updated.getDate() === now.getDate();

  if (sameDay) return "Last updated today";

  return `Last updated ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(updated)}`;
}
