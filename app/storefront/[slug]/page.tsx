// Public TENH storefront route target.
//
// The actual storefront implementation lives in app/_sites/[slug], which is a
// Next.js private folder. Private folders are intentionally not routable, so
// host rewrites must target this routable wrapper instead.
import StorefrontPage from "@/app/_sites/[slug]/page";
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { formatBusinessType } from "@/lib/storefront/types";
import { getSubdomainUrl, normalizeTenantSlug } from "@/lib/tenancy/domain";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const slug = normalizeTenantSlug((await params).slug);
  const { data: business } = await supabaseAdmin.from("businesses")
    .select("id, name, is_active, subscription_expires_at").eq("slug", slug).maybeSingle();
  if (!business?.is_active || (business.subscription_expires_at &&
    new Date(business.subscription_expires_at).getTime() <= Date.now())) {
    return { title: "Store unavailable", robots: { index: false, follow: false } };
  }
  const { data: store } = await supabaseAdmin.from("business_storefronts")
    .select("is_published, display_name, description, business_type, banner_url, logo_url, social_links")
    .eq("business_id", business.id).maybeSingle();
  if (!store?.is_published) return { title: "Store unavailable", robots: { index: false, follow: false } };
  const name = store.display_name?.trim() || business.name;
  const title = store.social_links?.profile?.seoTitle || `${name} | ${formatBusinessType(store.business_type)}`;
  const description = store.social_links?.profile?.seoDescription || store.description || `Shop ${name} online and discover our latest products.`;
  const url = getSubdomainUrl(slug);
  const image = store.banner_url || store.logo_url;
  return { title: { absolute: title }, description, alternates: { canonical: url },
    openGraph: { title, description, url, siteName: name, type: "website", ...(image ? { images: [image] } : {}) },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, ...(image ? { images: [image] } : {}) },
  };
}

export default StorefrontPage;
