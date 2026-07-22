import Link from "next/link";
import {
  Eye,
  Trash2,
  Pencil,
  UserRound,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import {
  createCustomer,
  deleteCustomer,
} from "./actions";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  created_at: string;
};

export default async function CustomersPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("customers")
    .select(`
      id,
      name,
      phone,
      email,
      address,
      created_at
    `)
    .order("created_at", {
      ascending: false,
    });

  const customers = (data ?? []) as Customer[];

  return (
    <main>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">
          Customers
        </h1>

        <p className="mt-1 text-slate-500">
          Manage customer information and purchase history
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[400px_1fr]">
        <section className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
              <UserRound size={22} />
            </div>

            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                Add Customer
              </h2>

              <p className="text-sm text-slate-500">
                Save customer contact information
              </p>
            </div>
          </div>

          <form
            action={createCustomer}
            className="mt-6 space-y-5"
          >
            <FormField
              label="Customer name"
              htmlFor="name"
            >
              <input
                id="name"
                name="name"
                type="text"
                required
                minLength={2}
                placeholder="Customer name"
                className={inputClass}
              />
            </FormField>

            <FormField label="Phone" htmlFor="phone">
              <input
                id="phone"
                name="phone"
                type="tel"
                placeholder="012 345 678"
                className={inputClass}
              />
            </FormField>

            <FormField label="Email" htmlFor="email">
              <input
                id="email"
                name="email"
                type="email"
                placeholder="customer@example.com"
                className={inputClass}
              />
            </FormField>

            <FormField label="Address" htmlFor="address">
              <textarea
                id="address"
                name="address"
                rows={3}
                placeholder="Customer address"
                className={`${inputClass} resize-none`}
              />
            </FormField>

            <FormField label="Note" htmlFor="note">
              <textarea
                id="note"
                name="note"
                rows={3}
                placeholder="Optional note"
                className={`${inputClass} resize-none`}
              />
            </FormField>

            <button
              type="submit"
              className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700"
            >
              Add Customer
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5">
            <h2 className="text-xl font-semibold text-slate-900">
              Customer List
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              {customers.length} customers
            </p>
          </div>

          {error ? (
            <div className="p-6 text-red-600">
              {error.message}
            </div>
          ) : customers.length === 0 ? (
            <div className="p-12 text-center">
              <UserRound
                size={44}
                className="mx-auto text-slate-300"
              />

              <p className="mt-4 font-medium text-slate-700">
                No customers yet
              </p>

              <p className="mt-1 text-sm text-slate-500">
                Add your first customer using the form.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-6 py-4 font-semibold">
                      Customer
                    </th>

                    <th className="px-6 py-4 font-semibold">
                      Phone
                    </th>

                    <th className="px-6 py-4 font-semibold">
                      Address
                    </th>

                    <th className="px-6 py-4 text-right font-semibold">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200">
                  {customers.map((customer) => (
                    <tr key={customer.id}>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-900">
                          {customer.name}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          {customer.email || "No email"}
                        </p>
                      </td>

                      <td className="px-6 py-4 text-sm text-slate-600">
                        {customer.phone || "—"}
                      </td>

                      <td className="max-w-xs px-6 py-4 text-sm text-slate-600">
                        {customer.address || "—"}
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/dashboard/customers/${customer.id}`}
                            className="rounded-lg p-2 text-blue-600 transition hover:bg-blue-50"
                            aria-label={`View ${customer.name}`}
                          >
                            <Eye size={19} />
                          </Link>
                              <Link
  href={`/dashboard/customers/${customer.id}/edit`}
  className="rounded-lg p-2 text-blue-600 transition hover:bg-blue-50"
>
  <Pencil size={19} />
 
</Link>

                          <form action={deleteCustomer}>
                            <input
                              type="hidden"
                              name="customerId"
                              value={customer.id}
                            />

                            <button
                              type="submit"
                              aria-label={`Delete ${customer.name}`}
                              className="rounded-lg p-2 text-red-600 transition hover:bg-red-50"
                            >
                              <Trash2 size={19} />
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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