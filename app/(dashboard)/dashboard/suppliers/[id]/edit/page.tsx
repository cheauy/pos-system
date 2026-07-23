import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ArrowLeft,
  Building2,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";

import { updateSupplier } from "@/app/(dashboard)/dashboard/suppliers/actions";

type SupplierEditPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function SupplierEditPage({
  params,
}: SupplierEditPageProps) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: supplier, error } =
    await supabase
      .from("suppliers")
      .select(`
        id,
        name,
        contact_person,
        phone,
        email,
        address,
        notes
      `)
      .eq("id", id)
      .single();

  if (error || !supplier) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-3xl">
      <Link
        href="/dashboard/suppliers"
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft size={17} />
        Back to suppliers
      </Link>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
            <Building2 size={22} />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Edit Supplier
            </h1>

            <p className="text-sm text-slate-500">
              Update supplier information
            </p>
          </div>
        </div>

        <form
          action={updateSupplier}
          className="mt-8 grid gap-5 md:grid-cols-2"
        >
          <input
            type="hidden"
            name="supplierId"
            value={supplier.id}
          />

          <FormField
            label="Supplier name"
            htmlFor="name"
          >
            <input
              id="name"
              name="name"
              required
              defaultValue={supplier.name}
              className={inputClass}
            />
          </FormField>

          <FormField
            label="Contact person"
            htmlFor="contactPerson"
          >
            <input
              id="contactPerson"
              name="contactPerson"
              defaultValue={
                supplier.contact_person ?? ""
              }
              className={inputClass}
            />
          </FormField>

          <FormField
            label="Phone"
            htmlFor="phone"
          >
            <input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={supplier.phone ?? ""}
              className={inputClass}
            />
          </FormField>

          <FormField
            label="Email"
            htmlFor="email"
          >
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={supplier.email ?? ""}
              className={inputClass}
            />
          </FormField>

          <div className="md:col-span-2">
            <FormField
              label="Address"
              htmlFor="address"
            >
              <textarea
                id="address"
                name="address"
                rows={3}
                defaultValue={supplier.address ?? ""}
                className={`${inputClass} resize-none`}
              />
            </FormField>
          </div>

          <div className="md:col-span-2">
            <FormField
              label="Notes"
              htmlFor="notes"
            >
              <textarea
                id="notes"
                name="notes"
                rows={4}
                defaultValue={supplier.notes ?? ""}
                className={`${inputClass} resize-none`}
              />
            </FormField>
          </div>

          <div className="flex justify-end gap-3 md:col-span-2">
            <Link
              href="/dashboard/suppliers"
              className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </Link>

            <button
              type="submit"
              className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700"
            >
              Save Changes
            </button>
          </div>
        </form>
      </section>
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