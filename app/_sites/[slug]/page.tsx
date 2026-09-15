import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  Building2,
  ShoppingBag,
} from "lucide-react";

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  getRootUrl,
  normalizeTenantSlug,
} from "@/lib/tenancy/domain";

type StorefrontPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function StorefrontPage({
  params,
}: StorefrontPageProps) {
  const { slug: rawSlug } = await params;
  const slug = normalizeTenantSlug(rawSlug);

  if (!slug) {
    notFound();
  }

  const {
    data: business,
    error,
  } = await supabaseAdmin
    .from("businesses")
    .select(`
      id,
      name,
      slug,
      is_active,
      product_mode,
      subscription_expires_at
    `)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load online store: ${error.message}`,
    );
  }

  if (!business) {
    notFound();
  }

  const expiryTime =
    business.subscription_expires_at
      ? new Date(
          business.subscription_expires_at,
        ).getTime()
      : null;

  const subscriptionExpired =
    expiryTime !== null &&
    !Number.isNaN(expiryTime) &&
    expiryTime <= Date.now();

  const storeAvailable =
    business.is_active &&
    !subscriptionExpired;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
              <Building2 size={22} />
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">
                TENH POS Store
              </p>
              <h1 className="text-lg font-bold text-slate-950">
                {business.name}
              </h1>
            </div>
          </div>

          <Link
            href={getRootUrl("/login")}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Owner sign in
          </Link>
        </header>

        {storeAvailable ? (
          <section className="mt-16 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="grid gap-10 p-8 sm:p-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
              <div>
                <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Online
                </span>

                <h2 className="mt-5 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
                  {business.name}
                </h2>

                <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
                  This business is connected to its TENH POS online storefront. Product browsing, cart and QR ordering are the next module being enabled.
                </p>

                <div className="mt-7 flex flex-wrap gap-3">
                  <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-700">
                    Store address: {business.slug}
                  </div>

                  <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-medium capitalize text-slate-700">
                    {String(
                      business.product_mode,
                    ).replaceAll("_", " ")} products
                  </div>
                </div>
              </div>

              <div className="rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-white shadow-xl shadow-blue-100">
                <ShoppingBag size={34} />

                <p className="mt-6 text-sm font-medium text-blue-100">
                  Online ordering foundation
                </p>

                <p className="mt-2 text-2xl font-bold">
                  Storefront connected
                </p>

                <p className="mt-3 text-sm leading-6 text-blue-100">
                  This subdomain now resolves safely to the correct TENH business tenant.
                </p>

                <a
                  href="/dashboard"
                  className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
                >
                  Open owner dashboard
                  <ArrowRight size={16} />
                </a>
              </div>
            </div>
          </section>
        ) : (
          <section className="mt-16 rounded-3xl border border-amber-200 bg-amber-50 p-10 text-center">
            <p className="text-lg font-bold text-amber-950">
              This store is temporarily unavailable
            </p>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-amber-800">
              Online ordering is paused because the business account is inactive or its subscription has expired.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
