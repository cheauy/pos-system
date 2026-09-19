"use server";

import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SELECTED_BUSINESS_COOKIE } from "@/lib/tenancy/domain";

export type ChangePasswordState = {
  success: boolean;
  message: string;
};

export type DeleteAccountState = {
  success: boolean;
  message: string;
};

function hasStrongPassword(value: string) {
  return (
    value.length >= 8 &&
    /[A-Z]/.test(value) &&
    /[a-z]/.test(value) &&
    /\d/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
}

export async function changePassword(
  _previousState: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const currentPassword = String(formData.get("current_password") ?? "");
  const newPassword = String(formData.get("new_password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (!hasStrongPassword(newPassword)) {
    return {
      success: false,
      message:
        "Use at least 8 characters with uppercase, lowercase, a number and a symbol.",
    };
  }

  if (newPassword.length > 72) {
    return {
      success: false,
      message: "New password cannot exceed 72 characters.",
    };
  }

  if (newPassword !== confirmPassword) {
    return {
      success: false,
      message: "New password and confirmation do not match.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user || !user.email) {
    return { success: false, message: "You must be logged in." };
  }

  const hasPasswordIdentity =
    user.identities?.some((identity) => identity.provider === "email") ?? false;

  if (hasPasswordIdentity) {
    if (!currentPassword) {
      return { success: false, message: "Current password is required." };
    }

    if (currentPassword === newPassword) {
      return {
        success: false,
        message: "New password must be different from the current password.",
      };
    }

    const { error: verificationError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (verificationError) {
      return { success: false, message: "Current password is incorrect." };
    }
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateError) {
    return { success: false, message: updateError.message };
  }

  // A password change is a good time to revoke refresh tokens on other devices.
  await supabase.auth.signOut({ scope: "others" });

  return {
    success: true,
    message: hasPasswordIdentity
      ? "Password changed successfully. Other device sessions were signed out."
      : "Password created successfully. You can now sign in with email and password.",
  };
}

const ACCOUNT_STORAGE_BUCKETS = [
  "product-images",
  "storefront-media",
  "tenh-pos-subscription-payment-proofs",
] as const;

function isMissingBucketError(message: string) {
  return /bucket.*not found|not found.*bucket/i.test(message);
}

async function collectStorageFiles(
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const files: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .list(prefix, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

    if (error) {
      if (isMissingBucketError(error.message)) return [];
      throw new Error(`Unable to inspect ${bucket}: ${error.message}`);
    }

    const entries = data ?? [];

    for (const entry of entries) {
      const childPath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.id) {
        files.push(childPath);
      } else {
        files.push(...(await collectStorageFiles(bucket, childPath)));
      }
    }

    if (entries.length < 100) break;
    offset += entries.length;
  }

  return files;
}

async function eraseBusinessStorage(businessId: string) {
  for (const bucket of ACCOUNT_STORAGE_BUCKETS) {
    const files = await collectStorageFiles(bucket, businessId);

    for (let index = 0; index < files.length; index += 100) {
      const batch = files.slice(index, index + 100);
      const { error } = await supabaseAdmin.storage.from(bucket).remove(batch);

      if (error && !isMissingBucketError(error.message)) {
        throw new Error(`Unable to erase ${bucket} files: ${error.message}`);
      }
    }
  }
}

export async function deleteOwnAccount(
  _previousState: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  const confirmation = String(formData.get("confirmation") ?? "").trim();

  if (confirmation !== "DELETE") {
    return {
      success: false,
      message: 'Type "DELETE" to confirm permanent account deletion.',
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { success: false, message: "You must be logged in." };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return { success: false, message: profileError.message };
  }

  if (profile?.role === "super_admin") {
    return {
      success: false,
      message: "A Super Admin account cannot delete itself from this page.",
    };
  }

  // The Auth user ID is the identity being erased. Businesses keep their own
  // UUIDs, so deleting an owner account never turns a store slug into an ID.
  const { data: directlyOwnedBusinesses, error: ownedBusinessError } =
    await supabaseAdmin
      .from("businesses")
      .select("id,name")
      .eq("owner_id", user.id);

  if (ownedBusinessError) {
    return { success: false, message: ownedBusinessError.message };
  }

  const { data: ownerMemberships, error: ownerMembershipError } =
    await supabaseAdmin
      .from("business_members")
      .select("business_id")
      .eq("user_id", user.id)
      .eq("role", "owner");

  if (ownerMembershipError) {
    return { success: false, message: ownerMembershipError.message };
  }

  const ownedBusinessIds = new Set<string>(
    (directlyOwnedBusinesses ?? []).map((business) => business.id),
  );

  for (const membership of ownerMemberships ?? []) {
    ownedBusinessIds.add(membership.business_id);
  }

  try {
    for (const businessId of ownedBusinessIds) {
      await eraseBusinessStorage(businessId);

      // Account deletion is an erase request, not a subscription purge. Remove
      // the business-linked trial safety records too instead of leaving the
      // business UUID behind as a detached anti-abuse record.
      for (const table of [
        "trial_signup_events",
        "trial_claims",
        "business_subscription_purge_log",
      ] as const) {
        const { error } = await supabaseAdmin
          .from(table)
          .delete()
          .eq("business_id", businessId);

        if (error) {
          throw new Error(`Unable to erase ${table}: ${error.message}`);
        }
      }

      const { error: businessDeleteError } = await supabaseAdmin
        .from("businesses")
        .delete()
        .eq("id", businessId);

      if (businessDeleteError) {
        throw new Error(
          businessDeleteError.code === "23503"
            ? "This business still has related data protected by a database constraint. Nothing else should be deleted until that relationship is corrected."
            : `Unable to erase owned business data: ${businessDeleteError.message}`,
        );
      }
    }

    // Remove this person from any other TENH businesses without touching those
    // businesses or their other users.
    const { error: membershipDeleteError } = await supabaseAdmin
      .from("business_members")
      .delete()
      .eq("user_id", user.id);

    if (membershipDeleteError) {
      throw new Error(
        `Unable to remove remaining business access: ${membershipDeleteError.message}`,
      );
    }

    // Hard-delete the Supabase Auth identity. Passing false explicitly avoids
    // the soft-delete/tombstone behavior used by the older implementation.
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(
      user.id,
      false,
    );

    if (authDeleteError) {
      throw new Error(`Unable to permanently delete Auth account: ${authDeleteError.message}`);
    }

    // Normally profiles are removed by the auth-user FK cascade. This cleanup
    // is safe if an older schema left an orphan profile behind.
    await supabaseAdmin.from("profiles").delete().eq("id", user.id);

    const cookieStore = await cookies();
    cookieStore.delete(SELECTED_BUSINESS_COOKIE);

    return {
      success: true,
      message: "Your TENH POS account and owned business data were permanently deleted.",
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to permanently delete the account.",
    };
  }
}

