import { requirePermission } from "@/lib/auth/require-permission";
import { getBusinessModePreset } from "@/lib/business/business-mode-presets";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getBusinessChangeEntitlements } from "@/lib/subscriptions/entitlements";
import { getRootDomain } from "@/lib/tenancy/domain";

import BusinessSettingsClient from "./business-settings-client";

function inferBusinessType(productMode: string) {
  if (productMode === "variant") return "fashion";
  if (productMode === "configurable") return "milk_tea";
  return "general";
}

export default async function BusinessSettingsPage() {
  const business = await requirePermission("business.view");

  const { data: storefront } = await supabaseAdmin
    .from("business_storefronts")
    .select("business_type")
    .eq("business_id", business.id)
    .maybeSingle();

  const entitlements = await getBusinessChangeEntitlements(business.id);

  const storedBusinessType = storefront?.business_type ?? "";
  const currentBusinessType =
    getBusinessModePreset(storedBusinessType)?.value ??
    inferBusinessType(business.productMode);

  return (
    <BusinessSettingsClient
      businessName={business.name}
      currentBusinessType={currentBusinessType}
      currentProductMode={business.productMode}
      initialSlug={business.slug}
      rootDomain={getRootDomain()}
      canEdit={business.role === "owner"}
      subscriptionPlanKey={entitlements.planKey}
      freeUrlChangesRemaining={entitlements.urlFreeRemaining}
      freeBusinessModeChangesRemaining={entitlements.modeFreeRemaining}
    />
  );
}
