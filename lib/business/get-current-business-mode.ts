import "server-only";

import { getBusinessModePreset } from "@/lib/business/business-mode-presets";
import type { ProductMode } from "@/lib/business/types";
import { supabaseAdmin } from "@/lib/supabase/admin";

function inferBusinessType(productMode: ProductMode) {
  if (productMode === "variant") return "fashion";
  if (productMode === "configurable") return "milk_tea";
  return "general";
}

function timestamp(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getCurrentBusinessMode({
  businessId,
  productMode,
}: {
  businessId: string;
  productMode: ProductMode;
}) {
  const [storefrontResult, appliedChangeResult] = await Promise.all([
    supabaseAdmin
      .from("business_storefronts")
      .select("business_type,updated_at")
      .eq("business_id", businessId)
      .maybeSingle(),
    supabaseAdmin
      .from("business_change_orders")
      .select("requested_business_type,requested_product_mode,applied_at")
      .eq("business_id", businessId)
      .eq("status", "applied")
      .eq("change_business_mode", true)
      .order("applied_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const storedPreset = getBusinessModePreset(
    storefrontResult.data?.business_type ?? "",
  );
  const appliedPreset = getBusinessModePreset(
    appliedChangeResult.data?.requested_business_type ?? "",
  );

  const storedMatchesEngine = storedPreset?.productMode === productMode;
  const appliedMatchesEngine =
    appliedPreset?.productMode === productMode &&
    appliedChangeResult.data?.requested_product_mode === productMode;

  const appliedIsAtLeastAsNew =
    timestamp(appliedChangeResult.data?.applied_at) >=
    timestamp(storefrontResult.data?.updated_at);

  let preset =
    appliedPreset && appliedMatchesEngine &&
    (!storedPreset || !storedMatchesEngine || appliedIsAtLeastAsNew)
      ? appliedPreset
      : storedPreset && storedMatchesEngine
        ? storedPreset
        : getBusinessModePreset(inferBusinessType(productMode));

  preset ??= getBusinessModePreset("general");

  if (!preset) {
    throw new Error("Unable to resolve the current business mode.");
  }

  return {
    value: preset.value,
    label: preset.label,
    shortLabel: preset.shortLabel,
    productMode: preset.productMode,
  };
}
