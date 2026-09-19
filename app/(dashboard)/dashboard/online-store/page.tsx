import CatalogDialog from "./catalog-dialog";
import QRCode from "qrcode";
import QrSection from "./qr-section";
import { supportsDineIn } from "@/lib/storefront/profile";
import {
  ExternalLink,
  Globe2,
  ShoppingBag,
  Store,
  Tag,
} from "lucide-react";

import { requirePermission } from "@/lib/auth/require-permission";
import { getStorefrontSettings } from "@/lib/storefront/get-storefront";
import { formatBusinessType } from "@/lib/storefront/types";
import { getSubdomainUrl } from "@/lib/tenancy/domain";
import StorefrontSettingsForm from "./storefront-settings-form";
import CopyStoreUrlButton from "./copy-store-url-button";
import CatalogManager from "./catalog-manager";
import { supabaseAdmin } from "@/lib/supabase/admin";

export default async function OnlineStorePage() {
  const business = await requirePermission("storefront.view");
  const settings = await getStorefrontSettings(business.id);
  const storeUrl = getSubdomainUrl(business.slug);
  const canEdit = business.role === "owner" || business.role === "admin";
  const [productResult, categoryResult, tablesResult] = await Promise.all([
    supabaseAdmin.from("products")
      .select("id, name, sku, size, color, image_url, variant_image_url, selling_price, stock_quantity, is_online, category_id")
      .eq("business_id", business.id).eq("is_active", true)
      .order("online_sort_order").order("name"),
    supabaseAdmin.from("categories").select("id, name, is_online")
      .eq("business_id", business.id).order("online_sort_order").order("name"),
    supportsDineIn(settings.business_type) ? supabaseAdmin.from("business_tables").select("id, name, public_token, is_active").eq("business_id", business.id).eq("is_active", true).order("name") : Promise.resolve({ data: [], error: null }),
  ]);
  if (productResult.error || categoryResult.error || tablesResult.error) {
    throw new Error("Unable to load the store catalog. Please try again.");
  }

  return (
    <main className="space-y-4 pb-20">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
            <span>Online Store</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Online Store
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Publish {business.name} online and control your customer experience.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CatalogDialog>      <CatalogManager products={productResult.data ?? []} categories={categoryResult.data ?? []}
        currency={settings.currency} canEdit={canEdit} storeUrl={storeUrl} featuredIds={settings.social_links?.profile?.featuredProductIds ?? []} /></CatalogDialog>

          <a
            href={storeUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            Open Public Store
            <ExternalLink size={15} />
          </a>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={<Globe2 size={20} />}
          iconClass="bg-emerald-50 text-emerald-600"
          label="Storefront"
          value={settings.is_published ? "Public" : "Private"}
          valueClass={settings.is_published ? "text-emerald-600" : "text-slate-900"}
          description={settings.is_published ? "Your store is live and visible" : "Your store is hidden from customers"}
        />
        <SummaryCard
          icon={<ShoppingBag size={20} />}
          iconClass="bg-rose-50 text-rose-500"
          label="Online Orders"
          value={settings.accept_online_orders ? "Accepting" : "Paused"}
          valueClass={settings.accept_online_orders ? "text-emerald-600" : "text-slate-900"}
          description={settings.accept_online_orders ? "Customers can place orders" : "Orders are not being accepted"}
        />
        <SummaryCard
          icon={<Tag size={20} />}
          iconClass="bg-blue-50 text-blue-600"
          label="Business Type"
          value={formatBusinessType(settings.business_type)}
          description="Controls your storefront experience"
        />
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-blue-50 p-2.5 text-blue-600">
              <Store size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-500">Store URL</p>
              <p className="mt-1 truncate text-sm font-bold text-blue-600">
                {storeUrl.replace(/^https?:\/\//, "")}
              </p>
              <p className="mt-1 text-xs text-slate-500">Your public store link</p>
            </div>
            <CopyStoreUrlButton value={storeUrl} />
          </div>
        </div>
      </section>

      <StorefrontSettingsForm
        settings={settings}
        storeUrl={storeUrl}
        businessName={business.name}
        canEdit={canEdit}
      >



      <div className="min-w-0">
        <QrSection storeUrl={storeUrl} storeQrImage={await QRCode.toDataURL(storeUrl, { width: 400, margin: 4 })} tables={tablesResult.data ?? []} allowDineIn={settings.allow_dine_in} canEdit={canEdit} showTables={supportsDineIn(settings.business_type)} />
      </div>
      </StorefrontSettingsForm>


    </main>
  );
}

function SummaryCard({
  icon,
  iconClass,
  label,
  value,
  valueClass = "text-slate-900",
  description,
}: {
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  value: string;
  valueClass?: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`rounded-lg p-2.5 ${iconClass}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className={`mt-1 truncate text-base font-bold ${valueClass}`}>{value}</p>
          <p className="mt-1 truncate text-xs text-slate-500">{description}</p>
        </div>
      </div>
    </div>
  );
}
