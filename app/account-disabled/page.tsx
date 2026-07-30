import Link from "next/link";
import { ShieldX } from "lucide-react";

import LogoutButton from "@/components/logout-button";

export default function AccountDisabledPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <ShieldX size={28} />
        </div>

        <h1 className="mt-5 text-2xl font-bold text-slate-900">
          Account inactive
        </h1>

        <p className="mt-3 text-sm leading-6 text-slate-600">
          Your account has been disabled and cannot access the
          dashboard. Contact your business owner or administrator if
          you believe this is a mistake.
        </p>

        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <LogoutButton />

          <Link
            href="/login"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Back to login
          </Link>
        </div>
      </section>
    </main>
  );
}
