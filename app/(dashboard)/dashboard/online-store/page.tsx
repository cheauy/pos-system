import {
  ExternalLink,
  Globe2,
  ShoppingBag,
  Store,
} from "lucide-react";

import {
  requirePermission,
} from "@/lib/auth/require-permission";
import {
  getStorefrontSettings,
} from "@/lib/storefront/get-storefront";
import {
  formatBusinessType,
} from "@/lib/storefront/types";
import {
  getRootDomain,
  getSubdomainUrl,
} from "@/lib/tenancy/domain";
import StorefrontSettingsForm from "./storefront-settings-form";
import QrSection from "./qr-section";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function OnlineStorePage() {
  const business = await requirePermission(
    "storefront.view",
  );

  const settings = await getStorefrontSettings(
    business.id,
  );

  const storeUrl = getSubdomainUrl(
    business.slug,
  );

  const canEdit =
    business.role === "owner" ||
    business.role === "admin";

  const { data: tables, error: tablesError } = await supabaseAdmin
    .from("business_tables")
    .select("id, name, public_token, is_active")
    .eq("business_id", business.id)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (tablesError) {
    throw new Error(`Unable to load table QR codes: ${tablesError.message}`);
  }

  return (
    <main className="space-y-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
              <Store size={24} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">
                Online Store
              </h1>
              <p className="mt-1 text-slate-500">
                Publish {business.name} online and control the customer storefront.
              </p>
            </div>
          </div>
        </div>

        <a
          href={storeUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Open Public Store
          <ExternalLink size={16} />
        </a>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          icon={<Globe2 size={21} />}
          label="Storefront"
          value={
            settings.is_published
              ? "Published"
              : "Private"
          }
          description={`${business.slug}.${getRootDomain()}`}
        />

        <SummaryCard
          icon={<ShoppingBag size={21} />}
          label="Online Orders"
          value={
            settings.accept_online_orders
              ? "Enabled"
              : "Paused"
          }
          description="Checkout ordering control"
        />

        <SummaryCard
          icon={<Store size={21} />}
          label="Business Type"
          value={formatBusinessType(
            settings.business_type,
          )}
          description="Controls storefront presentation"
        />
      </section>

      <StorefrontSettingsForm
        settings={settings}
        storeUrl={storeUrl}
        businessName={business.name}
        canEdit={canEdit}
      />

      <QrSection
        storeUrl={storeUrl}
        tables={tables ?? []}
        allowDineIn={settings.allow_dine_in}
        canEdit={canEdit}
      />
    </main>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  description,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="w-fit rounded-xl bg-blue-50 p-3 text-blue-600">
        {icon}
      </div>
      <p className="mt-4 text-sm font-medium text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-slate-900">
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-slate-500">
        {description}
      </p>
    </div>
  );
}
