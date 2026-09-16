"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, ShieldCheck } from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type Factor = {
  id: string;
  status?: string;
  friendly_name?: string | null;
};

export default function MfaChallengePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [factor, setFactor] = useState<Factor | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadFactor();
  }, []);

  async function loadFactor() {
    const { data, error: factorError } = await supabase.auth.mfa.listFactors();

    if (factorError) {
      setError(factorError.message);
      setLoading(false);
      return;
    }

    const verified = ((data?.totp ?? []) as Factor[]).find(
      (item) => item.status === "verified",
    );

    if (!verified) {
      router.replace("/auth/continue");
      return;
    }

    setFactor(verified);
    setLoading(false);
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factor || !/^\d{6}$/.test(code)) return;

    setVerifying(true);
    setError("");

    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code,
    });

    if (verifyError) {
      setError(verifyError.message || "Invalid verification code.");
      setVerifying(false);
      return;
    }

    router.replace("/auth/continue");
    router.refresh();
  }

  async function signOut() {
    await supabase.auth.signOut({ scope: "local" });
    window.location.assign("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:p-9">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
          <ShieldCheck className="h-8 w-8" />
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-blue-600">
          Two-factor authentication
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">
          Enter your authenticator code
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          Open your authenticator app and enter the 6-digit code to finish signing in to Tenh POS.
        </p>

        {loading ? (
          <div className="mt-7 rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-800">
            Loading security settings...
          </div>
        ) : (
          <form onSubmit={verify} className="mt-7 space-y-4">
            <div className="relative">
              <LockKeyhole className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                placeholder="123456"
                className="w-full rounded-xl border border-slate-200 py-3.5 pl-12 pr-4 text-center font-mono text-xl tracking-[0.32em] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={verifying || code.length !== 6}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {verifying ? "Verifying..." : "Verify and continue"}
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-5 w-full text-sm font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
        >
          Sign out and use another account
        </button>
      </div>
    </main>
  );
}
