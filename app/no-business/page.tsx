import Link from "next/link";
import {
  Building2,
  LogOut,
} from "lucide-react";

export default function NoBusinessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <Building2 size={28} />
        </div>

        <h1 className="mt-5 text-2xl font-bold text-slate-900">
          No Business Assigned
        </h1>

        <p className="mt-3 text-sm leading-6 text-slate-500">
          Your account is not connected to an active
          business. Please contact the platform owner or
          administrator.
        </p>

        <Link
          href="/login"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          <LogOut size={18} />
          Back to Login
        </Link>
      </section>
    </main>
  );
}