import Link from "next/link";
import { BadgeDollarSign, Building2, CreditCard } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import BusinessChangePaymentList from "./business-change-list";
import SubscriptionPaymentList from "../subscription-payments/payment-list";

export default async function PaymentsPage({ searchParams }: {
  searchParams: Promise<{ type?: string | string[] }>;
}) {
  await requireSuperAdmin();
  const businessChanges = (await searchParams).type === "business-changes";
  return <main className="space-y-6 pb-8">
    <div className="flex items-start gap-3">
      <BadgeDollarSign className="mt-1 text-blue-600" size={28} />
      <div><h1 className="text-3xl font-bold tracking-tight text-slate-950">Payment Approval</h1>
        <p className="mt-1 text-sm text-slate-500">Review subscription and business-change payments.</p></div>
    </div>
    <nav aria-label="Payment types" className="flex flex-wrap gap-2">
      {[
        { label: "Subscriptions", href: "/super-admin/manual-payments", active: !businessChanges, icon: CreditCard },
        { label: "Business changes", href: "/super-admin/manual-payments?type=business-changes", active: businessChanges, icon: Building2 },
      ].map(({ label, href, active, icon: Icon }) => <Link key={href} href={href} aria-current={active ? "page" : undefined}
        className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${active ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
        <Icon size={17} />{label}
      </Link>)}
    </nav>
    {businessChanges ? <BusinessChangePaymentList /> : <SubscriptionPaymentList />}
  </main>;
}
