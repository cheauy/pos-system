"use server";
import { passwordIssue } from "@/lib/auth/password-policy";

import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PAYMENT_PROOF_BUCKET, proofPath } from "@/lib/storefront/checkout-validation";
import { SELECTED_BUSINESS_COOKIE } from "@/lib/tenancy/domain";

export type ChangePasswordState = {
  success: boolean;
  message: string;
};

export type DeleteAccountState = {
  success: boolean;
  message: string;
};

export async function changePassword(
  _previousState: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const currentPassword = String(formData.get("current_password") ?? "");
  const newPassword = String(formData.get("new_password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (passwordIssue(newPassword)) {
    return {
      success: false,
      message:
        passwordIssue(newPassword)!,
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
  let revocationFailed = false;
  try {
    const { error } = await supabase.auth.signOut({ scope: "others" });
    revocationFailed = Boolean(error);
  } catch {
    revocationFailed = true;
  }
  if (revocationFailed) {
    return {
      success: true,
      message: "Your password was saved, but other device sessions could not be signed out. Use Sign out other devices in Security settings to retry.",
    };
  }

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
  "tenh-expense-receipts",
  "tenh-receipt-logos",
  "tenh-printer-designs",
  "support-report-images",
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

async function removeStorageFiles(bucket: string, files: string[]) {
  for (let index = 0; index < files.length; index += 100) {
    const { error } = await supabaseAdmin.storage
      .from(bucket)
      .remove(files.slice(index, index + 100));

    if (error && !isMissingBucketError(error.message)) {
      throw new Error(`Unable to erase ${bucket} files: ${error.message}`);
    }
  }
}

async function businessStorageFiles(businessId: string) {
  return Promise.all(ACCOUNT_STORAGE_BUCKETS.map(async (bucket) => ({
    bucket,
    files: await collectStorageFiles(bucket, businessId),
  })));
}

async function eraseBusinessStorage(
  storageFiles: Awaited<ReturnType<typeof businessStorageFiles>>,
  paymentProofs: string[],
) {
  for (const { bucket, files } of storageFiles) await removeStorageFiles(bucket, files);
  await removeStorageFiles(PAYMENT_PROOF_BUCKET, paymentProofs);
}

async function businessPaymentProofs(businessId: string) {
  const paths: string[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("id,payment_reference")
      .eq("business_id", businessId)
      .like("payment_reference", "proof:%")
      .order("id")
      .range(start, start + 499);
    if (error) throw new Error(`Unable to inspect order payment proofs: ${error.message}`);
    for (const order of data ?? []) {
      const path = proofPath(order.payment_reference);
      if (path?.startsWith(`${order.id}/`)) paths.push(path);
    }
    if (!data || data.length < 500) return paths;
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

  // Only the immutable business owner may erase the business. A stale or
  // incorrectly assigned "owner" membership never grants deletion rights.
  const ownedBusinessIds = (directlyOwnedBusinesses ?? []).map((business) => business.id);

  let erasedBusinesses = 0;
  try {
    const createdTeamUserIds = new Set<string>();
    for (const businessId of ownedBusinessIds) {
      const [members, paymentProofs, storageFiles] = await Promise.all([
        supabaseAdmin.from("business_members").select("user_id,team_owner_id").eq("business_id", businessId),
        businessPaymentProofs(businessId),
        businessStorageFiles(businessId),
      ]);
      if (members.error) throw new Error(`Unable to inspect business users: ${members.error.message}`);
      for (const member of members.data ?? []) {
        if (member.user_id !== user.id && member.team_owner_id === user.id) {
          createdTeamUserIds.add(member.user_id);
        }
      }

      const { data: deletedBusiness, error: businessDeleteError } = await supabaseAdmin
        .from("businesses")
        .delete()
        .eq("id", businessId)
        .eq("owner_id", user.id)
        .select("id")
        .maybeSingle();

      if (businessDeleteError) {
        throw new Error(
          businessDeleteError.code === "23503"
            ? "This business still has related data protected by a database constraint. Nothing else should be deleted until that relationship is corrected."
            : `Unable to erase owned business data: ${businessDeleteError.message}`,
        );
      }
      if (!deletedBusiness) throw new Error("Business ownership changed. No business data was erased.");
      erasedBusinesses++;

      // The database cascade is atomic. Storage is removed only after it
      // succeeds, so a blocked deletion cannot leave a working store image-less.
      await eraseBusinessStorage(storageFiles, paymentProofs);
      const { error: purgeLogError } = await supabaseAdmin
        .from("business_subscription_purge_log")
        .delete()
        .eq("business_id", businessId);
      if (purgeLogError) throw new Error(`Unable to erase subscription purge history: ${purgeLogError.message}`);
    }

    for (const teamUserId of createdTeamUserIds) {
      const [memberships, owned] = await Promise.all([
        supabaseAdmin.from("business_members").select("id").eq("user_id", teamUserId).limit(1),
        supabaseAdmin.from("businesses").select("id").eq("owner_id", teamUserId).limit(1),
      ]);
      if (memberships.error || owned.error) throw new Error("Unable to verify a team user's other workspaces.");
      if (memberships.data?.length || owned.data?.length) continue;
      const { error } = await supabaseAdmin.auth.admin.deleteUser(teamUserId, false);
      if (error) throw new Error(`A team account could not be deleted: ${error.message}`);
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
      message: `${erasedBusinesses ? "Business data was erased, but cleanup is incomplete. Contact support before trying again. " : ""}${
        error instanceof Error ? error.message : "Unable to permanently delete the account."
      }`,
    };
  }
}
