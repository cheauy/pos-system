import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";

import { updateCustomer } from "@/app/(dashboard)/dashboard/customers/actions";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCustomerFieldSettings } from "@/lib/customers/get-customer-field-settings";
import { createClient } from "@/lib/supabase/branch-server";

type EditCustomerPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditCustomerPage({ params }: EditCustomerPageProps) {
  const { id } = await params;
  const business = await requirePermission("customers.update");
  const supabase = await createClient();

  const [customerResult, fieldSettings] = await Promise.all([
    supabase
      .from("customers")
      .select("id,name,phone,email,birthday,address")
      .eq("id", id)
      .eq("business_id", business.id)
      .maybeSingle(),
    getCustomerFieldSettings(business.id),
  ]);

  if (customerResult.error || !customerResult.data) {
    notFound();
  }

  const data = customerResult.data;

  return (
    <main>
      <Link
        href="/dashboard/customers"
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-600"
      >
        <ArrowLeft size={18} />
        Back to customers
      </Link>

      <div className="mx-auto max-w-2xl">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Edit Customer</h1>

          <form action={updateCustomer} className="mt-6 space-y-5">
            <input type="hidden" name="customerId" value={data.id} />

            <FormField label="Customer name" htmlFor="name" required>
              <input id="name" name="name" required minLength={2} defaultValue={data.name} className={inputClass} />
            </FormField>

            <FormField label="Phone" htmlFor="phone" required>
              <input id="phone" name="phone" type="tel" required defaultValue={data.phone ?? ""} className={inputClass} />
            </FormField>

            {fieldSettings.emailEnabled ? (
              <FormField label="Email" htmlFor="email">
                <input id="email" name="email" type="email" defaultValue={data.email ?? ""} className={inputClass} />
              </FormField>
            ) : null}

            {fieldSettings.birthdayEnabled ? (
              <FormField label="Birthday" htmlFor="birthday">
                <input id="birthday" name="birthday" type="date" defaultValue={data.birthday ?? ""} className={inputClass} />
              </FormField>
            ) : null}

            <FormField label="Address" htmlFor="address">
              <textarea id="address" name="address" rows={4} defaultValue={data.address ?? ""} className={`${inputClass} resize-none`} />
            </FormField>

            <PendingSubmitButton
              pendingText="Saving changes..."
              className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
            >
              Save Changes
            </PendingSubmitButton>
          </form>
        </section>
      </div>
    </main>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

function FormField({
  label,
  htmlFor,
  required = false,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block text-sm font-medium text-slate-700">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </label>
      {children}
    </div>
  );
}
