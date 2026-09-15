"use server";

import {
  getBusinessModeDefaults,
  getBusinessModePreset,
} from "@/lib/business/business-mode-presets";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  getTenantDashboardUrl,
  isValidTenantSlug,
  normalizeTenantSlug,
} from "@/lib/tenancy/domain";

import type { GetStartedState } from "./state";

const SELF_REGISTRATION_MONTHS = 1;

function requiredText(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required.`);
  }

  return value.trim();
}

function cleanupMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to create your Tenh POS business.";
}

export async function createOwnerBusiness(
  _previousState: GetStartedState,
  formData: FormData,
): Promise<GetStartedState> {
  let createdBusinessId: string | null = null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        message: "Sign in before setting up your business.",
      };
    }

    const {
      data: profile,
      error: profileError,
    } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      throw new Error(
        `Unable to load your account: ${profileError.message}`,
      );
    }

    if (!profile || profile.is_active !== true) {
      return {
        success: false,
        message: "Your Tenh POS account is not active.",
      };
    }

    // Do not create a second business if another tab/request completed setup.
    const {
      data: existingMembership,
      error: membershipLookupError,
    } = await supabaseAdmin
      .from("business_members")
      .select("business_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (membershipLookupError) {
      throw new Error(
        `Unable to check your business access: ${membershipLookupError.message}`,
      );
    }

    if (existingMembership) {
      const { data: existingBusiness } = await supabaseAdmin
        .from("businesses")
        .select("slug")
        .eq("id", existingMembership.business_id)
        .maybeSingle();

      if (existingBusiness?.slug) {
        return {
          success: true,
          message: "Your business is already set up.",
          destination: getTenantDashboardUrl(
            existingBusiness.slug,
            "/dashboard",
          ),
        };
      }

      return {
        success: false,
        message: "Your account already belongs to a business.",
      };
    }

    const selectedMode = requiredText(formData, "businessMode");
    const preset = getBusinessModePreset(selectedMode);

    if (!preset) {
      return {
        success: false,
        message: "Choose a valid business type.",
      };
    }

    const businessName = requiredText(formData, "businessName");
    const requestedSlug = requiredText(formData, "subdomain");
    const slug = normalizeTenantSlug(requestedSlug);

    if (businessName.length < 2 || businessName.length > 100) {
      return {
        success: false,
        message: "Business name must be between 2 and 100 characters.",
      };
    }

    if (
      !isValidTenantSlug(slug) ||
      slug.length > 40 ||
      slug !== requestedSlug.toLowerCase()
    ) {
      return {
        success: false,
        message:
          "Choose a store address using 2–40 lowercase letters, numbers or hyphens.",
      };
    }

    const {
      data: existingSlug,
      error: slugError,
    } = await supabaseAdmin
      .from("businesses")
      .select("id")
      .ilike("slug", slug)
      .maybeSingle();

    if (slugError) {
      throw new Error(
        `Unable to check store address: ${slugError.message}`,
      );
    }

    if (existingSlug) {
      return {
        success: false,
        message: "This Tenh POS store address is already in use.",
      };
    }

    const subscriptionStartedAt = new Date();
    const subscriptionExpiresAt = new Date(subscriptionStartedAt);
    subscriptionExpiresAt.setMonth(
      subscriptionExpiresAt.getMonth() + SELF_REGISTRATION_MONTHS,
    );

    const {
      data: business,
      error: businessError,
    } = await supabaseAdmin
      .from("businesses")
      .insert({
        name: businessName,
        slug,
        owner_id: user.id,
        product_mode: preset.productMode,
        max_staff: 3,
        subscription_months: SELF_REGISTRATION_MONTHS,
        subscription_started_at: subscriptionStartedAt.toISOString(),
        subscription_expires_at: subscriptionExpiresAt.toISOString(),
        is_active: true,
        disabled_at: null,
        disabled_reason: null,
      })
      .select("id")
      .single();

    if (businessError || !business) {
      throw new Error(
        businessError?.message ?? "Unable to create your business workspace.",
      );
    }

    createdBusinessId = business.id;

    const { error: membershipError } = await supabaseAdmin
      .from("business_members")
      .insert({
        business_id: createdBusinessId,
        user_id: user.id,
        role: "owner",
        is_active: true,
      });

    if (membershipError) {
      throw new Error(
        `Unable to create owner access: ${membershipError.message}`,
      );
    }

    const { error: ownerProfileError } = await supabaseAdmin
      .from("profiles")
      .update({
        role: "owner",
        is_active: true,
      })
      .eq("id", user.id);

    if (ownerProfileError) {
      throw new Error(
        `Unable to update owner profile: ${ownerProfileError.message}`,
      );
    }

    const storefrontDefaults = getBusinessModeDefaults(preset.value);

    const { error: storefrontError } = await supabaseAdmin
      .from("business_storefronts")
      .upsert(
        {
          business_id: createdBusinessId,
          business_type: preset.value,
          display_name: businessName,
          allow_pickup: storefrontDefaults.allowPickup,
          allow_delivery: storefrontDefaults.allowDelivery,
          allow_dine_in: storefrontDefaults.allowDineIn,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "business_id" },
      );

    if (storefrontError) {
      throw new Error(
        `Unable to configure online store: ${storefrontError.message}`,
      );
    }

    const {
      data: mainBranch,
      error: locationError,
    } = await supabaseAdmin
      .from("business_locations")
      .insert({
        business_id: createdBusinessId,
        name: "Main Branch",
        code: "MAIN",
        is_default: true,
        is_active: true,
      })
      .select("id")
      .single();

    if (locationError || !mainBranch) {
      throw new Error(
        locationError?.message ?? "Unable to create the default branch.",
      );
    }

    const { error: defaultLocationError } = await supabaseAdmin
      .from("business_members")
      .update({ default_location_id: mainBranch.id })
      .eq("business_id", createdBusinessId)
      .eq("user_id", user.id);

    if (defaultLocationError) {
      throw new Error(
        `Unable to set your default branch: ${defaultLocationError.message}`,
      );
    }

    const { error: historyError } = await supabaseAdmin
      .from("subscription_history")
      .insert({
        business_id: createdBusinessId,
        action: "created",
        months: SELF_REGISTRATION_MONTHS,
        previous_expiry: null,
        new_expiry: subscriptionExpiresAt.toISOString(),
        reason: "Owner first-login onboarding",
        created_by: user.id,
      });

    if (historyError) {
      throw new Error(
        `Unable to create subscription history: ${historyError.message}`,
      );
    }

    return {
      success: true,
      message: "Your Tenh POS business is ready.",
      destination: getTenantDashboardUrl(slug, "/dashboard"),
    };
  } catch (error) {
    // Keep the account. Only remove the partially-created business workspace.
    if (createdBusinessId) {
      await supabaseAdmin
        .from("businesses")
        .delete()
        .eq("id", createdBusinessId);
    }

    return {
      success: false,
      message: cleanupMessage(error),
    };
  }
}
