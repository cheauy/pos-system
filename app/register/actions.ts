"use server";

import {
  getBusinessModeDefaults,
  getBusinessModePreset,
} from "@/lib/business/business-mode-presets";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/tenancy/domain";
import { getStoreSlugAvailability } from "@/lib/tenancy/store-slug-availability";

import type { RegisterBusinessState } from "./state";

const SELF_REGISTRATION_MONTHS = 1;

function requiredText(
  formData: FormData,
  key: string,
) {
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

  return "Unable to create your TENH POS store.";
}

export async function registerOwnerBusiness(
  _previousState: RegisterBusinessState,
  formData: FormData,
): Promise<RegisterBusinessState> {
  let createdAuthUserId: string | null = null;
  let createdBusinessId: string | null = null;

  try {
    // Simple bot trap. Real users never see or fill this field.
    const website = formData.get("website");
    if (typeof website === "string" && website.trim()) {
      return {
        success: false,
        message: "Unable to create account.",
      };
    }

    const selectedMode = requiredText(
      formData,
      "businessMode",
    );
    const preset = getBusinessModePreset(selectedMode);

    if (!preset) {
      return {
        success: false,
        message: "Choose a valid business type.",
      };
    }

    const businessName = requiredText(
      formData,
      "businessName",
    );
    const ownerName = requiredText(
      formData,
      "ownerName",
    );
    const email = requiredText(
      formData,
      "email",
    ).toLowerCase();
    const password = requiredText(
      formData,
      "password",
    );
    const confirmPassword = requiredText(
      formData,
      "confirmPassword",
    );

    const requestedSlug = requiredText(
      formData,
      "subdomain",
    );
    const slugAvailability =
      await getStoreSlugAvailability(requestedSlug);
    const slug = slugAvailability.slug;

    if (businessName.length < 2 || businessName.length > 100) {
      return {
        success: false,
        message: "Business name must be between 2 and 100 characters.",
      };
    }

    if (ownerName.length < 2 || ownerName.length > 100) {
      return {
        success: false,
        message: "Owner name must be between 2 and 100 characters.",
      };
    }

    if (!email.includes("@") || email.length > 254) {
      return {
        success: false,
        message: "Enter a valid email address.",
      };
    }

    if (password.length < 8) {
      return {
        success: false,
        message: "Password must contain at least 8 characters.",
      };
    }

    if (password !== confirmPassword) {
      return {
        success: false,
        message: "Passwords do not match.",
      };
    }

    if (
      slugAvailability.status === "invalid" ||
      slugAvailability.status === "reserved"
    ) {
      return {
        success: false,
        message:
          "Choose a store address using 2–40 lowercase letters, numbers or hyphens.",
      };
    }

    if (slugAvailability.status === "already_taken") {
      return {
        success: false,
        message: "This TENH POS store address is already in use.",
      };
    }

    const {
      data: existingProfile,
      error: profileLookupError,
    } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (profileLookupError) {
      throw new Error(
        `Unable to check email address: ${profileLookupError.message}`,
      );
    }

    if (existingProfile) {
      return {
        success: false,
        message: "An account already exists with this email address.",
      };
    }

    const supabase = await createClient();
    const { data: authData, error: authError } =
      await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: getAppUrl("/auth/continue"),
          data: {
            full_name: ownerName,
            business_name: businessName,
            business_slug: slug,
            business_type: preset.value,
          },
        },
      });

    if (authError || !authData.user) {
      return {
        success: false,
        message:
          authError?.message ??
          "Unable to create your owner account.",
      };
    }

    if (
      Array.isArray(authData.user.identities) &&
      authData.user.identities.length === 0
    ) {
      return {
        success: false,
        message: "An account already exists with this email address.",
      };
    }

    createdAuthUserId = authData.user.id;

    const subscriptionStartedAt = new Date();
    const subscriptionExpiresAt = new Date(
      subscriptionStartedAt,
    );
    subscriptionExpiresAt.setMonth(
      subscriptionExpiresAt.getMonth() +
        SELF_REGISTRATION_MONTHS,
    );

    const {
      data: business,
      error: businessError,
    } = await supabaseAdmin
      .from("businesses")
      .insert({
        name: businessName,
        slug,
        owner_id: createdAuthUserId,
        product_mode: preset.productMode,
        max_staff: 3,
        subscription_months:
          SELF_REGISTRATION_MONTHS,
        subscription_started_at:
          subscriptionStartedAt.toISOString(),
        subscription_expires_at:
          subscriptionExpiresAt.toISOString(),
        is_active: true,
        disabled_at: null,
        disabled_reason: null,
      })
      .select("id")
      .single();

    if (businessError || !business) {
      if (businessError?.code === "23505") {
        throw new Error(
          "This TENH POS store address is already in use.",
        );
      }

      throw new Error(
        businessError?.message ??
          "Unable to create your business workspace.",
      );
    }

    createdBusinessId = business.id;

    const { error: profileError } =
      await supabaseAdmin
        .from("profiles")
        .upsert(
          {
            id: createdAuthUserId,
            full_name: ownerName,
            email,
            role: "owner",
            is_active: true,
          },
          { onConflict: "id" },
        );

    if (profileError) {
      throw new Error(
        `Unable to create owner profile: ${profileError.message}`,
      );
    }

    const { error: membershipError } =
      await supabaseAdmin
        .from("business_members")
        .insert({
          business_id: createdBusinessId,
          user_id: createdAuthUserId,
          role: "owner",
          is_active: true,
        });

    if (membershipError) {
      throw new Error(
        `Unable to create owner membership: ${membershipError.message}`,
      );
    }

    const storefrontDefaults =
      getBusinessModeDefaults(preset.value);

    const { error: storefrontError } =
      await supabaseAdmin
        .from("business_storefronts")
        .update({
          business_type: preset.value,
          display_name: businessName,
          allow_pickup:
            storefrontDefaults.allowPickup,
          allow_delivery:
            storefrontDefaults.allowDelivery,
          allow_dine_in:
            storefrontDefaults.allowDineIn,
          updated_at: new Date().toISOString(),
        })
        .eq("business_id", createdBusinessId);

    if (storefrontError) {
      throw new Error(
        `Unable to configure your store: ${storefrontError.message}`,
      );
    }

    const { error: historyError } =
      await supabaseAdmin
        .from("subscription_history")
        .insert({
          business_id: createdBusinessId,
          action: "created",
          months: SELF_REGISTRATION_MONTHS,
          previous_expiry: null,
          new_expiry:
            subscriptionExpiresAt.toISOString(),
          reason: "Owner self-registration",
          created_by: createdAuthUserId,
        });

    if (historyError) {
      throw new Error(
        `Unable to create subscription history: ${historyError.message}`,
      );
    }

    return {
      success: true,
      message: authData.session
        ? "Your TENH POS store is ready."
        : "Your store has been created. Check your email to confirm your account, then sign in.",
      requiresEmailConfirmation: !authData.session,
      destination: authData.session
        ? getAppUrl("/dashboard")
        : null,
    };
  } catch (error) {
    if (createdBusinessId) {
      await supabaseAdmin
        .from("businesses")
        .delete()
        .eq("id", createdBusinessId);
    }

    if (createdAuthUserId) {
      await supabaseAdmin
        .from("profiles")
        .delete()
        .eq("id", createdAuthUserId);

      await supabaseAdmin.auth.admin.deleteUser(
        createdAuthUserId,
      );

      try {
        const supabase = await createClient();
        await supabase.auth.signOut();
      } catch {
        // Cleanup is best effort; the deleted Auth user cannot use the session.
      }
    }

    return {
      success: false,
      message: cleanupMessage(error),
    };
  }
}
