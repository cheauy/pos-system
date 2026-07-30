"use server";

import { revalidatePath } from "next/cache";

import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import type { ProductMode } from "@/lib/business/types";
import { supabaseAdmin } from "@/lib/supabase/admin";

import type { CreateBusinessState } from "./state";

const validProductModes: ProductMode[] = [
  "standard",
  "variant",
  "configurable",
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

function createSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

    const ownerName = getRequiredText(
      formData,
      "ownerName",
    );

    

    const subscriptionMonths =
  getRequiredInteger(
    formData,
    "subscriptionMonths",
  );

  const validSubscriptionMonths = [
  1,
  3,
  5,
  12,
];

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

    const baseSlug = createSlug(businessName);

    if (!baseSlug) {
      return {
        success: false,
        message: "Enter a valid business name.",
      };
    }

    const uniqueSlug =
      `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;

    const {
      data: existingProfile,
    } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", ownerEmail)
      .maybeSingle();

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
        slug: uniqueSlug,
        owner_id: createdAuthUserId,
        product_mode: productModeValue,
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
const {
  data: { user },
} = await supabaseAdmin.auth.getUser();

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
    const {
      error: profileError,
    } = await supabaseAdmin
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

    

    const {
      error: membershipError,
    } = await supabaseAdmin
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

    revalidatePath("/super-admin/businesses");

    return {
      success: true,
      message:
        `${businessName} and its owner account were created successfully.`,
    };
  } catch (error) {
    /*
     * Supabase Auth and Postgres inserts are not one shared
     * transaction here, so remove partially created records.
     */

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