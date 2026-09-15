import { Building2, Loader2 } from "lucide-react";

export default function SuperAdminLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-8 py-7 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Building2 className="h-6 w-6" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />

              <p className="font-semibold text-slate-900">
                Loading Super Admin
              </p>
            </div>

            <p className="mt-1 text-sm text-slate-500">
              Preparing business information...
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}