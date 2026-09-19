import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  StorefrontSettings,
} from "./types";

export async function getStorefrontSettings(
  businessId: string,
): Promise<StorefrontSettings> {
  const {
    data,
    error,
  } = await supabaseAdmin
    .from("business_storefronts")
    .select(`
      business_id,
      business_type,
      is_published,
      accept_online_orders,
      template_key,
      display_name,
      description,
      logo_url,
      banner_url,
      primary_color,
      phone,
      address,
      currency,
      social_links,
      allow_pickup,
      allow_delivery,
      allow_dine_in,
      minimum_order,
      delivery_fee,
      checkout_message,
      accept_cod,
      accept_khqr,
      khqr_image_url,
      khqr_account_name,
      khqr_instructions,
      allow_scheduled_orders,
      min_schedule_lead_minutes,
      max_schedule_days,
      enable_coupons,
      loyalty_enabled,
      loyalty_spend_per_point,
      loyalty_minimum_order,
      estimated_minutes,
      created_at,
      updated_at
    `)
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load online store settings: ${error.message}`,
    );
  }

  if (data) {
    return data as StorefrontSettings;
  }

  const {
    data: created,
    error: createError,
  } = await supabaseAdmin
    .from("business_storefronts")
    .insert({
      business_id: businessId,
    })
    .select(`
      business_id,
      business_type,
      is_published,
      accept_online_orders,
      template_key,
      display_name,
      description,
      logo_url,
      banner_url,
      primary_color,
      phone,
      address,
      currency,
      social_links,
      allow_pickup,
      allow_delivery,
      allow_dine_in,
      minimum_order,
      delivery_fee,
      checkout_message,
      accept_cod,
      accept_khqr,
      khqr_image_url,
      khqr_account_name,
      khqr_instructions,
      allow_scheduled_orders,
      min_schedule_lead_minutes,
      max_schedule_days,
      enable_coupons,
      loyalty_enabled,
      loyalty_spend_per_point,
      loyalty_minimum_order,
      estimated_minutes,
      created_at,
      updated_at
    `)
    .single();

  if (createError || !created) {
    throw new Error(
      `Unable to create online store settings: ${
        createError?.message ?? "Unknown error"
      }`,
    );
  }

  return created as StorefrontSettings;
}
