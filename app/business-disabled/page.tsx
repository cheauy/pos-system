"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Ban, Loader2, LogOut } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { getAppUrl } from "@/lib/tenancy/domain";

const COPY: Record<string, { title: string; body: string; note: string }> = {
  subscription_expired: {
    title: "Business subscription expired",
    body: "Your business subscription is no longer active, so team access is temporarily locked.",
    note: "Ask the business owner to renew or reactivate the TENH POS subscription. Your account can be used again when access is restored.",
  },
  access_removed: {
    title: "You no longer have access",
    body: "The business owner removed your account from this TENH POS business.",
    note: "If you believe this was a mistake, contact the business owner. Your TENH login may still be used for another business you belong to.",
  },
  access_disabled: {
    title: "Your business access is disabled",
    body: "Your membership is currently disabled for this TENH POS business.",
    note: "Contact the business owner or administrator if your access should be restored.",
  },
  seat_limit: {
    title: "Your seat is paused",
    body: "Your access was paused because the business subscription no longer has enough active user seats.",
    note: "The owner can upgrade the subscription or free another seat, then reactivate your user.",
  },
  owner_action_required: {
    title: "Owner setup required",
    body: "This business is waiting for the owner to choose a TENH POS subscription or start the 7-day free trial.",
    note: "Team access will become available only after the owner activates an eligible paid team plan.",
  },
  business_unavailable: {
    title: "Business access unavailable",
    body: "The business you previously used is no longer available to this account.",
    note: "The business may have been deleted or your membership may have been removed. Contact the business owner if you need access again.",
  },
  business_disabled: {
    title: "Business account disabled",
    body: "Access to this TENH POS business has been disabled.",
    note: "Contact the business owner or TENH POS administrator if the business should be reactivated.",
  },
};

export default function BusinessDisabledPage() {
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [signingOut, setSigningOut] = useState(false);
  const reason = searchParams.get("reason") ?? "business_disabled";
  const copy = COPY[reason] ?? COPY.business_disabled;

  async function handleSignOut() {
    setSigningOut(true);

    try {
      await supabase.auth.signOut();
      window.location.assign(getAppUrl("/login"));
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
          {copy.title}
        </h1>

        <p className="mt-3 leading-7 text-slate-600">
          {copy.body}
        </p>

        <div className="mt-6 rounded-xl bg-amber-50 p-4 text-left">
          <p className="text-sm font-semibold text-amber-800">
            What you can do
          </p>
          <p className="mt-1 text-sm leading-6 text-amber-700">
            {copy.note}
          </p>
        </div>

        <button
          type="button"
          disabled={signingOut}
          onClick={handleSignOut}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
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
