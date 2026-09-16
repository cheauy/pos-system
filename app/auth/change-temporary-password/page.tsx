"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ChangeTemporaryPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      if (!data.user) {
        router.replace("/login");
        return;
      }
      setChecking(false);
    });
    return () => { mounted = false; };
  }, [router, supabase]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      setError(userError?.message ?? "Your session has expired.");
      setSaving(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: {
        ...(user.user_metadata ?? {}),
        require_password_change: false,
        staff_invite_pending: false,
      },
    });

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    router.replace("/auth/continue");
    router.refresh();
  }

  if (checking) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 dark:bg-slate-950"><p className="text-sm text-slate-500">Checking account...</p></main>;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:p-9">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"><KeyRound className="h-7 w-7" /></div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-blue-600">First login security</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">Create your own password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">Your business owner created a temporary password. Replace it before continuing to Tenh POS.</p>

        <form onSubmit={submit} className="mt-7 space-y-4">
          <PasswordField label="New password" value={password} onChange={setPassword} shown={showPassword} onToggle={() => setShowPassword((current) => !current)} />
          <PasswordField label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} shown={showConfirm} onToggle={() => setShowConfirm((current) => !current)} />
          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">{error}</div>}
          <button type="submit" disabled={saving} className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">{saving ? "Saving password..." : "Save password and continue"}</button>
        </form>
      </div>
    </main>
  );
}

function PasswordField({ label, value, onChange, shown, onToggle }: { label: string; value: string; onChange: (value: string) => void; shown: boolean; onToggle: () => void }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</label>
      <div className="relative">
        <input type={shown ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} required minLength={8} autoComplete="new-password" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-12 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-blue-950/40" placeholder="At least 8 characters" />
        <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" aria-label={shown ? "Hide password" : "Show password"}>{shown ? <EyeOff size={18} /> : <Eye size={18} />}</button>
      </div>
    </div>
  );
}
