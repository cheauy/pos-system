"use server";

import { revalidatePath } from "next/cache";

import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import type { ProductMode } from "@/lib/business/types";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  getSubdomainUrl,
  isValidTenantSlug,
  normalizeTenantSlug,
} from "@/lib/tenancy/domain";

import type { CreateBusinessState } from "./state";

const validProductModes: ProductMode[] = [
  "standard",
  "variant",
  "configurable",
];

const validSubscriptionMonths = [
  1,
  3,
  5,
  12,
];

function getRequiredText(
  formData: FormData,
  key: string,
): string {
  const value = formData.get(key);

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required.`);
  }

  return value.trim();
}

function getRequiredInteger(
  formData: FormData,
  key: string,
): number {
  const value = formData.get(key);

  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(`${key} is required.`);
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue)) {
    throw new Error(
      `${key} must be a whole number.`,
    );
  }

  return parsedValue;
}

function isProductMode(
  value: string,
): value is ProductMode {
  return validProductModes.includes(
    value as ProductMode,
  );
}

export async function createCustomerBusiness(
  _previousState: CreateBusinessState,
  formData: FormData,
): Promise<CreateBusinessState> {
  const superAdmin =
    await requireSuperAdmin();

  let createdAuthUserId: string | null = null;
  let createdBusinessId: string | null = null;

  try {
    const businessName = getRequiredText(
      formData,
      "businessName",
    );

    const requestedSubdomain = getRequiredText(
      formData,
      "subdomain",
    );

    const subdomain = normalizeTenantSlug(
      requestedSubdomain,
    );

    if (
      !isValidTenantSlug(subdomain) ||
      subdomain.length > 40 ||
      subdomain !== requestedSubdomain.toLowerCase()
    ) {
      return {
        success: false,
        message:
          "Choose a valid store address using 2–40 lowercase letters, numbers or hyphens. Reserved TENH addresses cannot be used.",
      };
    }

    const {
      data: existingBusinessSlug,
      error: slugError,
    } = await supabaseAdmin
      .from("businesses")
      .select("id")
      .ilike("slug", subdomain)
      .maybeSingle();

    if (slugError) {
      throw new Error(
        `Unable to check store address: ${slugError.message}`,
      );
    }

    if (existingBusinessSlug) {
      return {
        success: false,
        message:
          "This TENH POS store address is already in use. Choose another address.",
      };
    }

    const ownerName = getRequiredText(
      formData,
      "ownerName",
    );

    const ownerEmail = getRequiredText(
      formData,
      "ownerEmail",
    ).toLowerCase();

    const temporaryPassword = getRequiredText(
      formData,
      "temporaryPassword",
    );

    const productModeValue = getRequiredText(
      formData,
      "productMode",
    );

    const maxStaff = getRequiredInteger(
      formData,
      "maxStaff",
    );

    const subscriptionMonths =
      getRequiredInteger(
        formData,
        "subscriptionMonths",
      );

    if (!ownerEmail.includes("@")) {
      return {
        success: false,
        message: "Enter a valid owner email address.",
      };
    }

    if (temporaryPassword.length < 8) {
      return {
        success: false,
        message:
          "Temporary password must contain at least 8 characters.",
      };
    }

    if (!isProductMode(productModeValue)) {
      return {
        success: false,
        message: "Select a valid product mode.",
      };
    }

    if (
      maxStaff < 3 ||
      maxStaff > 100
    ) {
      return {
        success: false,
        message:
          "Staff limit must be between 3 and 100.",
      };
    }

    if (
      !validSubscriptionMonths.includes(
        subscriptionMonths,
      )
    ) {
      return {
        success: false,
        message:
          "Select a valid subscription period.",
      };
    }

    const subscriptionStartedAt =
      new Date();

    const subscriptionExpiresAt =
      new Date(subscriptionStartedAt);

    subscriptionExpiresAt.setMonth(
      subscriptionExpiresAt.getMonth() +
        subscriptionMonths,
    );

    const {
      data: existingProfile,
      error: existingProfileError,
    } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", ownerEmail)
      .maybeSingle();

    if (existingProfileError) {
      throw new Error(
        `Unable to check owner email: ${existingProfileError.message}`,
      );
    }

    if (existingProfile) {
      return {
        success: false,
        message:
          "An account already exists with this email address.",
      };
    }

    const {
      data: authData,
      error: authError,
    } = await supabaseAdmin.auth.admin.createUser({
      email: ownerEmail,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        full_name: ownerName,
      },
    });

    if (authError || !authData.user) {
      return {
        success: false,
        message:
          authError?.message ??
          "Unable to create the owner account.",
      };
    }

    createdAuthUserId = authData.user.id;

    const {
      data: business,
      error: businessError,
    } = await supabaseAdmin
      .from("businesses")
      .insert({
        name: businessName,
        slug: subdomain,
        owner_id: createdAuthUserId,
        product_mode: productModeValue,
        max_staff: maxStaff,
        subscription_months:
          subscriptionMonths,
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
      throw new Error(
        businessError?.message ??
          "Unable to create the business.",
      );
    }

    createdBusinessId = business.id;

    const { error: historyError } =
      await supabaseAdmin
        .from("subscription_history")
        .insert({
          business_id: createdBusinessId,
          action: "created",
          months: subscriptionMonths,
          previous_expiry: null,
          new_expiry:
            subscriptionExpiresAt.toISOString(),
          reason: "Initial subscription",
          created_by: superAdmin.id,
        });

    if (historyError) {
      throw new Error(
        `Unable to create subscription history: ${historyError.message}`,
      );
    }

    const { error: profileError } =
      await supabaseAdmin
        .from("profiles")
        .upsert(
          {
            id: createdAuthUserId,
            full_name: ownerName,
            email: ownerEmail,
            role: "owner",
          },
          {
            onConflict: "id",
          },
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

    revalidatePath(
      "/super-admin/businesses",
    );

    return {
      success: true,
      message:
        `${businessName} created successfully. Store: ${getSubdomainUrl(
          subdomain,
        )}`,
    };
  } catch (error) {
    // Supabase Auth and Postgres are not one shared transaction,
    // so remove records that were created before a later failure.
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
    }

    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to create customer business.",
    };
  }
}
