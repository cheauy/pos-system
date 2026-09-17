"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgeDollarSign,
  Building2,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

type SuperAdminHeaderProps = {
  fullName: string;
  email: string;
};

export default function SuperAdminHeader({
  fullName,
  email,
}: SuperAdminHeaderProps) {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();

    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="mb-8 flex flex-col gap-4 rounded-2xl border border-slate-300 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="rounded-xl bg-blue-100 p-3 text-blue-700">
            <ShieldCheck size={26} />
          </div>

          <div>
            <h1 className="text-xl font-bold text-slate-900">Super Admin</h1>
            <p className="text-sm text-slate-500">{fullName}</p>
            <p className="text-xs text-slate-400">{email}</p>
          </div>
        </div>

        <Link
          href="/super-admin/manual-payments"
          className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 font-semibold text-amber-800 transition hover:bg-amber-100"
        >
          <BadgeDollarSign size={18} />
          Manual Payments
        </Link>
      </div>

      <nav className="flex flex-wrap items-center gap-2" aria-label="Super Admin navigation">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 font-semibold text-blue-700 transition hover:bg-blue-100"
        >
          <LayoutDashboard size={18} />
          Dashboard
        </Link>

        <Link
          href="/super-admin/businesses"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <Building2 size={18} />
          Businesses
        </Link>

        <button
          onClick={handleSignOut}
          className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-3 font-semibold text-white transition hover:bg-red-700"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </nav>
    </header>
  );
}
