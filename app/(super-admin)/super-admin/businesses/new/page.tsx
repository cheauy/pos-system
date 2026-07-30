import Link from "next/link";
import {
  ArrowLeft,
  Building2,
} from "lucide-react";

import CreateBusinessForm from
  "@/components/super-admin/create-business-form";
import { requireSuperAdmin } from
  "@/lib/auth/require-super-admin";

export default async function NewBusinessPage() {
  await requireSuperAdmin();

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/super-admin/businesses"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={17} />
          Back to businesses
        </Link>

        <CreateBusinessForm />
      </div>
    </main>
  );
}