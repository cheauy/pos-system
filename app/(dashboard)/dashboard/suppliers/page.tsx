import Link from "next/link";

import {
  Building2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Power,
  Trash2,
  UserRound,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";

import {
  createSupplier,
  deleteSupplier,
  toggleSupplierStatus,
} from "./actions";

type Supplier = {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
};

export default async function SuppliersPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("suppliers")
    .select(`
      id,
      name,
      contact_person,
      phone,
      email,
      address,
      notes,
      is_active,
      created_at
    `)
    .order("created_at", {
      ascending: false,
    });

  const suppliers =
    (data ?? []) as Supplier[];

  const activeSuppliers = suppliers.filter(
    (supplier) => supplier.is_active,
  ).length;

  return (
    <main>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">
          Suppliers
        </h1>

        <p className="mt-1 text-slate-500">
          Manage companies and people who supply
          your products
        </p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <SummaryCard
          title="Total Suppliers"
          value={suppliers.length.toString()}
        />

        <SummaryCard
          title="Active Suppliers"
          value={activeSuppliers.toString()}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <section className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
              <Building2 size={22} />
            </div>

            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                Add Supplier
              </h2>

              <p className="text-sm text-slate-500">
                Create a new supplier record
              </p>
            </div>
          </div>

          <form
            action={createSupplier}
            className="mt-6 space-y-5"
          >
            <FormField
              label="Supplier name"
              htmlFor="name"
            >
              <input
                id="name"
                name="name"
                required
                placeholder="Example: ABC Trading"
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
                placeholder="Example: Dara"
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
                placeholder="Example: 012 345 678"
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
                placeholder="supplier@example.com"
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
                rows={2}
                placeholder="Supplier address"
                className={`${inputClass} resize-none`}
              />
            </FormField>

            <FormField
              label="Notes"
              htmlFor="notes"
            >
              <textarea
                id="notes"
                name="notes"
                rows={3}
                placeholder="Optional notes"
                className={`${inputClass} resize-none`}
              />
            </FormField>

            <button
              type="submit"
              className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700"
            >
              Save Supplier
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5">
            <h2 className="text-xl font-semibold text-slate-900">
              Supplier List
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              {suppliers.length} supplier records
            </p>
          </div>

          {error ? (
            <div className="p-6 text-red-600">
              {error.message}
            </div>
          ) : suppliers.length === 0 ? (
            <div className="p-12 text-center">
              <Building2
                size={44}
                className="mx-auto text-slate-300"
              />

              <p className="mt-4 font-medium text-slate-700">
                No suppliers yet
              </p>

              <p className="mt-1 text-sm text-slate-500">
                Add your first supplier using the form.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {suppliers.map((supplier) => (
                <article
                  key={supplier.id}
                  className="p-6"
                >
                  <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-lg font-bold text-slate-900">
                          {supplier.name}
                        </h3>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            supplier.is_active
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {supplier.is_active
                            ? "Active"
                            : "Inactive"}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                        {supplier.contact_person && (
                          <InfoRow
                            icon={<UserRound size={16} />}
                            value={
                              supplier.contact_person
                            }
                          />
                        )}

                        {supplier.phone && (
                          <InfoRow
                            icon={<Phone size={16} />}
                            value={supplier.phone}
                          />
                        )}

                        {supplier.email && (
                          <InfoRow
                            icon={<Mail size={16} />}
                            value={supplier.email}
                          />
                        )}

                        {supplier.address && (
                          <InfoRow
                            icon={<MapPin size={16} />}
                            value={supplier.address}
                          />
                        )}
                      </div>

                      {supplier.notes && (
                        <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                          {supplier.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/dashboard/suppliers/${supplier.id}/edit`}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        <Pencil size={16} />
                        Edit
                      </Link>

                      <form
                        action={toggleSupplierStatus}
                      >
                        <input
                          type="hidden"
                          name="supplierId"
                          value={supplier.id}
                        />

                        <input
                          type="hidden"
                          name="currentStatus"
                          value={String(
                            supplier.is_active,
                          )}
                        />

                        <button
                          type="submit"
                          className="inline-flex items-center gap-2 rounded-lg border border-amber-200 px-3 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-50"
                        >
                          <Power size={16} />

                          {supplier.is_active
                            ? "Disable"
                            : "Enable"}
                        </button>
                      </form>

                      <form action={deleteSupplier}>
                        <input
                          type="hidden"
                          name="supplierId"
                          value={supplier.id}
                        />

                        <button
                          type="submit"
                          className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                        >
                          <Trash2 size={16} />
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
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

function InfoRow({
  icon,
  value,
}: {
  icon: React.ReactNode;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-slate-400">
        {icon}
      </span>

      <span>{value}</span>
    </div>
  );
}

function SummaryCard({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">
        {title}
      </p>

      <p className="mt-2 text-2xl font-bold text-slate-900">
        {value}
      </p>
    </div>
  );
}