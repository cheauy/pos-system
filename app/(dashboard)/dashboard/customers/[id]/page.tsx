import Link from "next/link";
import { ArrowLeft, CalendarDays, Mail, MapPin, Phone, ReceiptText } from "lucide-react";
import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/auth/require-permission";
import { getCustomerFieldSettings } from "@/lib/customers/get-customer-field-settings";
import { createClient } from "@/lib/supabase/branch-server";
import { getStorefrontSettings } from "@/lib/storefront/get-storefront";

type CustomerOrder = {
  id: string;
  order_number: string;
  total: number;
  status: string;
  order_source: string;
  coupon_code: string | null;
  created_at: string;
};

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  address: string | null;
  orders: CustomerOrder[];
};

type CustomerPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CustomerDetailsPage({ params }: CustomerPageProps) {
  const { id } = await params;
  const business = await requirePermission("customers.view");
  const scopedDb=await createClient();

  const [settings, fieldSettings, customerResult] = await Promise.all([
    getStorefrontSettings(business.id),
    getCustomerFieldSettings(business.id),
    scopedDb
      .from("customers")
      .select(`
        id,
        name,
        phone,
        email,
        birthday,
        address,
        orders (
          id,
          order_number,
          total,
          status,
          order_source,
          coupon_code,
          created_at
        )
      `)
      .eq("id", id)
      .eq("business_id", business.id)
      .maybeSingle(),
  ]);

  if (customerResult.error || !customerResult.data) {
    notFound();
  }

  const customer = customerResult.data as unknown as Customer;
  const orders = [...(customer.orders ?? [])].sort(
    (first, second) =>
      new Date(second.created_at).getTime() - new Date(first.created_at).getTime(),
  );
  const completedOrders = orders.filter((order) => order.status === "completed");
  const totalSpent = completedOrders.reduce((sum, order) => sum + Number(order.total), 0);
  const averageOrder = completedOrders.length > 0 ? totalSpent / completedOrders.length : 0;
  const lastPurchase = completedOrders[0]?.created_at ?? null;

  return (
    <main>
      <Link
        href="/dashboard/customers"
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-600"
      >
        <ArrowLeft size={18} />
        Back to customers
      </Link>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <section className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-600">
              {initials(customer.name)}
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{customer.name}</h1>
              <span className="mt-1 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Active</span>
            </div>
          </div>

          <div className="mt-6 space-y-4 text-sm">
            <InformationRow icon={<Phone size={16} />} label="Phone" value={customer.phone} />
            {fieldSettings.emailEnabled ? <InformationRow icon={<Mail size={16} />} label="Email" value={customer.email} /> : null}
            {fieldSettings.birthdayEnabled ? <InformationRow icon={<CalendarDays size={16} />} label="Birthday" value={formatBirthday(customer.birthday)} /> : null}
            <InformationRow icon={<MapPin size={16} />} label="Address" value={customer.address} />
          </div>

          <Link
            href={`/dashboard/customers/${customer.id}/edit`}
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Edit Customer
          </Link>
        </section>

        <section>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <SummaryCard title="Completed orders" value={String(completedOrders.length)} />
            <SummaryCard title="Total spent" value={formatMoney(totalSpent, settings.currency)} />
            <SummaryCard title="Average order" value={formatMoney(averageOrder, settings.currency)} subtitle={lastPurchase ? `Last purchase ${formatDate(lastPurchase)}` : "No purchases yet"} />
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-5">
              <h2 className="text-xl font-semibold text-slate-900">Purchase History</h2>
            </div>

            {orders.length === 0 ? (
              <div className="p-12 text-center">
                <ReceiptText size={42} className="mx-auto text-slate-300" />
                <p className="mt-4 text-slate-500">This customer has no orders yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {orders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/dashboard/orders/${order.id}`}
                    className="flex items-center justify-between gap-4 px-6 py-5 transition hover:bg-slate-50"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{order.order_number}</p>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-slate-500">{order.order_source}</span>
                        {order.coupon_code ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">{order.coupon_code}</span> : null}
                      </div>
                      <p className="mt-1 text-sm text-slate-500">{formatDate(order.created_at)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-slate-900">{formatMoney(Number(order.total), settings.currency)}</p>
                      <p className="mt-1 text-xs capitalize text-slate-500">{order.status}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function InformationRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-0.5 break-words text-slate-700">{value || "—"}</p>
      </div>
    </div>
  );
}

function SummaryCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
      {subtitle ? <p className="mt-1 text-xs text-slate-400">{subtitle}</p> : null}
    </div>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "C";
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Phnom_Penh" }).format(new Date(value));
}

function formatBirthday(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}
