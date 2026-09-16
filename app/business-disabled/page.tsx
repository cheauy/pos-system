"use client";

import { useState } from "react";
import {
  Ban,
  Clock3,
  Loader2,
  LogOut,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { getRootUrl } from "@/lib/tenancy/domain";

export default function BusinessDisabledPage() {
  const supabase = createClient();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);

    try {
      await supabase.auth.signOut();
      window.location.assign(getRootUrl("/login"));
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
          <Ban size={32} />
        </div>

        <h1 className="mt-6 text-2xl font-bold text-slate-900">
          Business Account Inactive
        </h1>

        <p className="mt-3 leading-7 text-slate-600">
          Access to this TENH POS business is currently disabled. Your store
          address remains protected while you are inside the reactivation
          period.
        </p>

        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left">
          <div className="flex items-start gap-3">
            <Clock3 className="mt-0.5 shrink-0 text-amber-700" size={20} />
            <div>
              <p className="text-sm font-semibold text-amber-900">
                60-day store-address protection
              </p>
              <p className="mt-1 text-sm leading-6 text-amber-800">
                If the business stays inactive for 60 days, TENH POS removes
                it from active access and releases its store address. After
                release, another customer can register that address.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-slate-50 p-4 text-left">
          <p className="text-sm font-semibold text-slate-800">
            Want to keep this store address?
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Reactivate the business before the 60-day deadline. Reactivation
            cancels the scheduled release.
          </p>
        </div>

        <a
          href="https://t.me/NOC_UY"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700"
        >
          Contact Administrator
        </a>

        <button
          type="button"
          disabled={signingOut}
          onClick={handleSignOut}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {signingOut ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Signing out...
            </>
          ) : (
            <>
              <LogOut size={18} />
              Sign Out
            </>
          )}
        </button>
      </section>
    </main>
  );
}
