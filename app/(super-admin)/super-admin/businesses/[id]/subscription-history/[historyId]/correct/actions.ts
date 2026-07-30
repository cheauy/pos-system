"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createBusinessHistory } from "@/lib/business/create-business-history";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { supabaseAdmin } from "@/lib/supabase/admin";

const validMonths = [1, 3, 5, 12] as const;

function getRequiredText(
  formData: FormData,
  key: string,
): string {
  const value = formData.get(key);

  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${key} is required.`,
    );
  }

  return value.trim();
}

export async function correctSubscriptionExtension(
  formData: FormData,
) {
  const superAdmin =
    await requireSuperAdmin();

  const businessId = getRequiredText(
    formData,
    "businessId",
  );

  const historyId = getRequiredText(
    formData,
    "historyId",
  );

  const reason = getRequiredText(
    formData,
    "reason",
  );

  const months = Number(
    formData.get("months"),
  );

  if (
    !Number.isInteger(months) ||
    !validMonths.includes(
      months as (typeof validMonths)[number],
    )
  ) {
    throw new Error(
      "Select 1, 3, 5, or 12 months.",
    );
  }

  const {
    data: business,
    error: businessError,
  } = await supabaseAdmin
    .from("businesses")
    .select(`
      id,
      name,
      subscription_months,
      subscription_expires_at
    `)
    .eq("id", businessId)
    .maybeSingle();

  if (businessError) {
    throw new Error(
      `Unable to load business: ${businessError.message}`,
    );
  }

  if (!business) {
    throw new Error(
      "Business was not found.",
    );
  }

  const {
    data: history,
    error: historyError,
  } = await supabaseAdmin
    .from("subscription_history")
    .select(`
      id,
      months,
      previous_expiry,
      new_expiry
    `)
    .eq("id", historyId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (historyError) {
    throw new Error(
      `Unable to load subscription history: ${historyError.message}`,
    );
  }

  if (!history) {
    throw new Error(
      "Subscription history record was not found.",
    );
  }

  const {
    data: correctedExpiry,
    error,
  } = await supabaseAdmin.rpc(
    "correct_subscription_extension",
    {
      p_business_id: businessId,
      p_history_id: historyId,
      p_months: months,
      p_reason: reason,
      p_created_by: superAdmin.id,
    },
  );

  if (error) {
    throw new Error(
      `Unable to correct subscription: ${error.message}`,
    );
  }

  if (!correctedExpiry) {
    throw new Error(
      "The corrected expiry date was not returned.",
    );
  }

  await createBusinessHistory({
    businessId,
    action:
      "subscription_extension_corrected",
    title:
      "Subscription extension corrected",
    description:
      `Subscription extension changed from ${history.months} ${
        history.months === 1
          ? "month"
          : "months"
      } to ${months} ${
        months === 1
          ? "month"
          : "months"
      }.`,
    reason,
    previousValues: {
      extension_months:
        history.months,
      subscription_expires_at:
        history.new_expiry,
    },
    newValues: {
      extension_months: months,
      subscription_expires_at:
        correctedExpiry,
    },
    metadata: {
      subscription_history_id:
        historyId,
      original_previous_expiry:
        history.previous_expiry,
    },
    createdBy: superAdmin.id,
  });

  revalidatePath(
    `/super-admin/businesses/${businessId}`,
  );

  revalidatePath(
    `/super-admin/businesses/${businessId}/subscription-history`,
  );

  redirect(
    `/super-admin/businesses/${businessId}`,
  );
}
