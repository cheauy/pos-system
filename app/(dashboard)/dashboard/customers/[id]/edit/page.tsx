import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { updateCustomer } from "@/app/(dashboard)//dashboard/customers/actions";

type EditCustomerPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditCustomerPage({
  params,
}: EditCustomerPageProps) {
  const { id } = await params;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("customers")
    .select(`
      id,
      name,
      phone,
      email,
      address,
      note
    `)
    .eq("id", id)
    .single();

  if (error || !data) {
    notFound();
  }

  return (
    <main>
      <Link
        href={`/dashboard/customers/${id}`}
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-600"
      >
        <ArrowLeft size={18} />
        Back to customer
      </Link>

      <div className="mx-auto max-w-2xl">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">
            Edit Customer
          </h1>

          <form
            action={updateCustomer}
            className="mt-6 space-y-5"
          >
            <input
              type="hidden"
              name="customerId"
              value={data.id}
            />

            <FormField
              label="Customer name"
              htmlFor="name"
            >
              <input
                id="name"
                name="name"
                required
                minLength={2}
                defaultValue={data.name}
                className={inputClass}
              />
            </FormField>

            <FormField label="Phone" htmlFor="phone">
              <input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={data.phone ?? ""}
                className={inputClass}
              />
            </FormField>

            <FormField label="Email" htmlFor="email">
              <input
                id="email"
                name="email"
                type="email"
                defaultValue={data.email ?? ""}
                className={inputClass}
              />
            </FormField>

            <FormField
              label="Address"
              htmlFor="address"
            >
              <textarea
                id="address"
                name="address"
                rows={4}
                defaultValue={data.address ?? ""}
                className={`${inputClass} resize-none`}
              />
            </FormField>

            <FormField label="Note" htmlFor="note">
              <textarea
                id="note"
                name="note"
                rows={4}
                defaultValue={data.note ?? ""}
                className={`${inputClass} resize-none`}
              />
            </FormField>

            <button
              type="submit"
              className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
            >
              Save Changes
            </button>
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
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-sm font-medium text-slate-700"
      >
        {label}
      </label>

      {children}
    </div>
  );
}