"use server";

import { revalidatePath } from "next/cache";

import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ProductMode } from "@/lib/business/types";
import { createBusinessHistory } from
  "@/lib/business/create-business-history";

export async function reactivateExpiredBusiness(
  formData: FormData,
) {
  const superAdmin =
    await requireSuperAdmin();

  const businessId = getRequiredText(
    formData,
    "businessId",
  );

  const confirmation =
    getRequiredText(
      formData,
      "confirmation",
    ).toLowerCase();

  const months = Number(
    formData.get("months"),
  );

  const maxStaff = Number(
    formData.get("maxStaff"),
  );

  const allowedMonths = [
    1,
    3,
    5,
    12,
  ];

  const allowedStaffLimits = [
    3,
    5,
    10,
    15,
    20,
    25,
    30,
    50,
  ];

  if (confirmation !== "reactivate") {
    throw new Error(
      'Type "reactivate" to confirm.',
    );
  }

  if (
    !Number.isInteger(months) ||
    !allowedMonths.includes(months)
  ) {
    throw new Error(
      "Select a valid subscription period.",
    );
  }

  if (
    !Number.isInteger(maxStaff) ||
    !allowedStaffLimits.includes(
      maxStaff,
    )
  ) {
    throw new Error(
      "Select a valid staff limit.",
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
    is_active,
    disabled_at,
    disabled_reason,
    subscription_months,
    subscription_expires_at,
    max_staff
    `)
    .eq("id", businessId)
    .maybeSingle();

  if (businessError) {
    throw new Error(
      businessError.message,
    );
  }

  if (!business) {
    throw new Error(
      "Business was not found.",
    );
  }

  const now = new Date();

  const previousExpiry =
    business.subscription_expires_at;


  const isExpired =
    !previousExpiry ||
    new Date(previousExpiry).getTime() <=
      now.getTime();

  if (!isExpired) {
    throw new Error(
      "This business subscription has not expired.",
    );
  }

  const newExpiry = new Date(now);

  newExpiry.setMonth(
    newExpiry.getMonth() + months,
  );

  const {
    data: updatedBusiness,
    error: updateError,
  } = await supabaseAdmin
    .from("businesses")
    .update({
      is_active: true,
      disabled_at: null,
      disabled_reason: null,
      scheduled_deletion_at: null,

      subscription_months: months,
      subscription_started_at:
        now.toISOString(),
      subscription_expires_at:
        newExpiry.toISOString(),

      max_staff: maxStaff,
      updated_at:
        now.toISOString(),
    })
    .eq("id", businessId)
    .select(`
      id,
      name,
      max_staff,
      subscription_expires_at
    `)
    .maybeSingle();

  if (updateError) {
    throw new Error(
      `Unable to reactivate business: ${updateError.message}`,
    );
  }

  if (!updatedBusiness) {
    throw new Error(
      "Business was not reactivated.",
    );
  }

  const {
    error: historyError,
  } = await supabaseAdmin
    .from("subscription_history")
    .insert({
      business_id: businessId,
      action: "reactivated",
      months,
      previous_expiry: previousExpiry,
      new_expiry:
        newExpiry.toISOString(),
      reason:
        `Business reactivated with ${maxStaff} staff seats`,
      created_by: superAdmin.id,
    });

  if (historyError) {
    console.error(
      "Reactivation history error:",
      historyError,
    );
  }

  await createBusinessHistory({
  businessId,
  action: "subscription_reactivated",
  title: "Subscription reactivated",
  description: `${business.name} was reactivated for ${months} ${
    months === 1 ? "month" : "months"
  }.`,
  previousValues: {
    is_active: business.is_active,
    disabled_at: business.disabled_at,
    disabled_reason: business.disabled_reason,
    subscription_months:
      business.subscription_months,
    subscription_expires_at:
      business.subscription_expires_at,
    max_staff: business.max_staff,
  },
  newValues: {
    is_active: true,
    disabled_at: null,
    disabled_reason: null,
    subscription_months: months,
    subscription_expires_at:
      newExpiry.toISOString(),
    max_staff: maxStaff,
  },
  metadata: {
    months_added: months,
    previous_expiry:
      business.subscription_expires_at,
    new_expiry:
      newExpiry.toISOString(),
  },
  createdBy: superAdmin.id,
});

  revalidatePath(
    "/super-admin/businesses",
  );

  revalidatePath(
    `/super-admin/businesses/${businessId}`,
  );

  revalidatePath(
    "/dashboard/settings/users",
  );

  return {
    success: true,
    businessName:
      updatedBusiness.name,
    months,
    maxStaff,
    newExpiry:
      updatedBusiness.subscription_expires_at,
  };
}
const validModes: ProductMode[] = [
  "standard",
  "variant",
  "configurable",
];


type BusinessMember = {
  user_id: string;
};

export type UpdateStaffLimitState = {
  success: boolean;
  message: string;
};

export async function updateBusinessStaffLimit(
  _previousState: UpdateStaffLimitState,
  formData: FormData,
): Promise<UpdateStaffLimitState> {
  try {
    const superAdmin =
      await requireSuperAdmin();

    const businessIdValue =
      formData.get("businessId");

    const maxStaffValue =
      formData.get("maxStaff");

    const businessId =
      typeof businessIdValue === "string"
        ? businessIdValue.trim()
        : "";

    const maxStaff =
      Number(maxStaffValue);

    if (!businessId) {
      throw new Error(
        "Business ID is required.",
      );
    }

    if (
      !Number.isInteger(maxStaff) ||
      maxStaff < 3 ||
      maxStaff > 100
    ) {
      throw new Error(
        "Maximum staff must be between 3 and 100.",
      );
    }

    /*
     * Load the business and its current limit
     * before making any changes.
     */
    const {
      data: business,
      error: businessError,
    } = await supabaseAdmin
      .from("businesses")
      .select(`
        id,
        name,
        max_staff,
        is_active,
        disabled_reason
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

    if (
      business.disabled_reason ===
      "manually_suspended"
    ) {
      throw new Error(
        "Restore this business before changing its staff limit.",
      );
    }

    if (
      business.disabled_reason ===
      "subscription_expired"
    ) {
      throw new Error(
        "Reactivate this business before changing its staff limit.",
      );
    }

    if (!business.is_active) {
      throw new Error(
        "Only active businesses can change their staff limit.",
      );
    }

    const previousStaffLimit =
      Number(business.max_staff ?? 3);

    if (
      previousStaffLimit === maxStaff
    ) {
      throw new Error(
        `The staff limit is already ${maxStaff}.`,
      );
    }

    /*
     * Owner accounts are excluded because
     * max_staff controls non-owner staff.
     *
     * Oldest staff remain active.
     * Newest staff are disabled first.
     */
    const {
      data: activeStaff,
      error: staffError,
    } = await supabaseAdmin
      .from("business_members")
      .select(`
        id,
        user_id,
        role,
        created_at
      `)
      .eq("business_id", businessId)
      .eq("is_active", true)
      .neq("role", "owner")
      .order("created_at", {
        ascending: true,
      });

    if (staffError) {
      throw new Error(
        `Unable to load staff: ${staffError.message}`,
      );
    }

    const activeStaffList =
      activeStaff ?? [];

    const currentStaffCount =
      activeStaffList.length;

    const disableCount = Math.max(
      currentStaffCount - maxStaff,
      0,
    );

    let disabledMemberIds: string[] =
      [];

    let disabledUserIds: string[] =
      [];

    if (disableCount > 0) {
      const membersToDisable =
        activeStaffList.slice(
          -disableCount,
        );

      disabledMemberIds =
        membersToDisable.map(
          (member) => member.id,
        );

      disabledUserIds =
        membersToDisable
          .map(
            (member) =>
              member.user_id,
          )
          .filter(
            (
              userId,
            ): userId is string =>
              typeof userId ===
                "string" &&
              userId.length > 0,
          );
    }

    const updatedAt =
      new Date().toISOString();

    /*
     * Update the business limit.
     */
    const {
      error: updateError,
    } = await supabaseAdmin
      .from("businesses")
      .update({
        max_staff: maxStaff,
        updated_at: updatedAt,
      })
      .eq("id", businessId);

    if (updateError) {
      throw new Error(
        `Unable to update staff limit: ${updateError.message}`,
      );
    }

    /*
     * Disable the newest staff when the new
     * limit is below the active staff count.
     */
    if (
      disabledMemberIds.length > 0
    ) {
      const {
        error: disableError,
      } = await supabaseAdmin
        .from("business_members")
        .update({
          is_active: false,
          disabled_at: updatedAt,
          disabled_reason:
            "staff_limit_reduced",
        })
        .in(
          "id",
          disabledMemberIds,
        );

      if (disableError) {
        /*
         * Restore the old limit so that the
         * business is not left in an invalid
         * partial state.
         */
        await supabaseAdmin
          .from("businesses")
          .update({
            max_staff:
              previousStaffLimit,
            updated_at:
              new Date().toISOString(),
          })
          .eq("id", businessId);

        throw new Error(
          `Unable to disable excess staff: ${disableError.message}`,
        );
      }
    }

    await createBusinessHistory({
  businessId,
  action: "staff_limit_changed",
  title: "Staff limit changed",
  description: `Staff limit changed from ${previousStaffLimit} to ${maxStaff}.`,
  previousValues: {
    max_staff: previousStaffLimit,
    active_staff_count: currentStaffCount,
  },
  newValues: {
    max_staff: maxStaff,
    active_staff_count:
      currentStaffCount - disableCount,
  },
  metadata: {
    disabled_staff_count: disableCount,
    disabled_member_ids:
      disabledMemberIds,
    disabled_user_ids:
      disabledUserIds,
  },
  createdBy: superAdmin.id,
});

  revalidatePath(
      "/super-admin/businesses",
    );

    revalidatePath(
      `/super-admin/businesses/${businessId}`,
    );


    return {
      success: true,
      message:
        disableCount > 0
          ? `Staff limit updated from ${previousStaffLimit} to ${maxStaff}. ${disableCount} newest staff account${
              disableCount === 1
                ? " was"
                : "s were"
            } disabled automatically.`
          : `Staff limit updated from ${previousStaffLimit} to ${maxStaff}.`,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to update staff limit.",
    };
  }
}

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

export async function updateBusiness(
  formData: FormData,
) {
  const superAdmin =
  await requireSuperAdmin();

  const businessId = getRequiredText(
    formData,
    "businessId",
  );

  const businessName = getRequiredText(
    formData,
    "businessName",
  );

  const productMode = getRequiredText(
    formData,
    "productMode",
  ) as ProductMode;

  const maxStaffValue =
    formData.get("maxStaff");

  const maxStaff = Number(
    maxStaffValue,
  );

  if (!validModes.includes(productMode)) {
    throw new Error(
      "Invalid product mode.",
    );
  }

  if (
    !Number.isInteger(maxStaff) ||
    maxStaff < 3 ||
    maxStaff > 100
  ) {
    throw new Error(
      "Maximum staff must be between 3 and 100.",
    );
  }
  const {
  data: existingBusiness,
  error: existingBusinessError,
} = await supabaseAdmin
  .from("businesses")
  .select(`
    id,
    name,
    product_mode,
    max_staff
  `)
  .eq("id", businessId)
  .maybeSingle();

if (existingBusinessError) {
  throw new Error(
    `Unable to load business: ${existingBusinessError.message}`,
  );
}

if (!existingBusiness) {
  throw new Error(
    "Business was not found.",
  );
}

const previousName =
  existingBusiness.name;

const previousProductMode =
  existingBusiness.product_mode;

const previousStaffLimit =
  Number(
    existingBusiness.max_staff ?? 3,
  );

  /*
   * Load active staff from oldest to newest.
   * The owner is not counted.
   */
  const {
    data: activeStaff,
    error: staffError,
  } = await supabaseAdmin
    .from("business_members")
    .select(`
      id,
      created_at
    `)
    .eq("business_id", businessId)
    .eq("is_active", true)
    .neq("role", "owner")
    .order("created_at", {
      ascending: true,
    });

  if (staffError) {
    throw new Error(
      `Unable to load staff: ${staffError.message}`,
    );
  }

  const currentStaffCount =
    activeStaff?.length ?? 0;

  const disableCount = Math.max(
    currentStaffCount - maxStaff,
    0,
  );
let disabledMemberIds: string[] = [];
  /*
   * When downgrading, disable the newest
   * active staff first.
   */
  if (disableCount > 0) {
    const membersToDisable =
      activeStaff!.slice(-disableCount);

    disabledMemberIds =
  membersToDisable.map(
    (member) => member.id,
  );

    const {
      error: disableError,
    } = await supabaseAdmin
      .from("business_members")
      .update({
        is_active: false,
        disabled_at:
          new Date().toISOString(),
        disabled_reason:
          "staff_limit_reduced",
        updated_at:
          new Date().toISOString(),
      })
      .in("id", disabledMemberIds)
      .eq(
        "business_id",
        businessId,
      );

    if (disableError) {
      throw new Error(
        `Unable to disable excess staff: ${disableError.message}`,
      );
    }
  }

  const {
    data: updatedBusiness,
    error: updateError,
  } = await supabaseAdmin
    .from("businesses")
    .update({
      name: businessName,
      product_mode: productMode,
      max_staff: maxStaff,
      updated_at:
        new Date().toISOString(),
    })
    .eq("id", businessId)
    .select(`
      id,
      name,
      max_staff
    `)
    .maybeSingle();

  

  if (updateError) {
    throw new Error(
      `Unable to update business: ${updateError.message}`,
    );
  }

  if (!updatedBusiness) {
    throw new Error(
      "Business was not updated.",
    );
  }

  if (previousName !== businessName) {
  await createBusinessHistory({
    businessId,
    action: "business_updated",
    title: "Business name changed",
    description: `Business name changed from "${previousName}" to "${businessName}".`,
    previousValues: {
      name: previousName,
    },
    newValues: {
      name: businessName,
    },
    createdBy: superAdmin.id,
  });
}

// Product mode changed
if (previousProductMode !== productMode) {
  await createBusinessHistory({
    businessId,
    action: "product_mode_changed",
    title: "Product mode changed",
    description: `Product mode changed from ${previousProductMode} to ${productMode}.`,
    previousValues: {
      product_mode: previousProductMode,
    },
    newValues: {
      product_mode: productMode,
    },
    createdBy: superAdmin.id,
  });
}

// Staff limit changed
if (previousStaffLimit !== maxStaff) {
  await createBusinessHistory({
    businessId,
    action: "staff_limit_changed",
    title: "Staff limit changed",
    description: `Staff limit changed from ${previousStaffLimit} to ${maxStaff}.`,
    previousValues: {
      max_staff: previousStaffLimit,
      active_staff_count: currentStaffCount,
    },
    newValues: {
      max_staff: maxStaff,
      active_staff_count:
        currentStaffCount - disableCount,
    },
    metadata: {
      disabled_staff_count: disableCount,
      disabled_member_ids: disabledMemberIds,
    },
    createdBy: superAdmin.id,
  });
}

  revalidatePath(
    "/super-admin/businesses",
  );

  revalidatePath(
    `/super-admin/businesses/${businessId}`,
  );

  revalidatePath(
    "/dashboard/settings/users",
  );

  return {
    success: true,
    businessName:
      updatedBusiness.name,
    maxStaff:
      updatedBusiness.max_staff,
    disabledStaff: disableCount,
  };
}

export async function toggleBusinessStatus(
  formData: FormData,
) {
 const superAdmin =
  await requireSuperAdmin();

  const businessId = getRequiredText(
    formData,
    "businessId",
  );
  const {
  data: business,
  error: businessError,
} = await supabaseAdmin
  .from("businesses")
  .select(`
    id,
    name,
    is_active,
    scheduled_deletion_at
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
    "Business not found.",
  );
}

  const currentStatus =
    getRequiredText(
      formData,
      "currentStatus",
    ) === "true";

  if (currentStatus) {
    const disabledAt = new Date();
    const scheduledDeletionAt = new Date();

    scheduledDeletionAt.setDate(
      scheduledDeletionAt.getDate() + 60,
    );

    const { error } = await supabaseAdmin
      .from("businesses")
      .update({
        is_active: false,
        disabled_at: disabledAt.toISOString(),
        scheduled_deletion_at:
          scheduledDeletionAt.toISOString(),
      })
      .eq("id", businessId);

    if (error) {
      throw new Error(
        `Unable to disable business: ${error.message}`,
      );
    }
    await createBusinessHistory({
  businessId,
  action: "business_suspended",
  title: "Business suspended",
  description:
    "Business was suspended by Super Admin.",
  previousValues: {
    is_active: true,
  },
  newValues: {
    is_active: false,
    scheduled_deletion_at:
      scheduledDeletionAt.toISOString(),
  },
  createdBy: superAdmin.id,
});
  } else {
    const { error } = await supabaseAdmin
      .from("businesses")
      .update({
        is_active: true,
        disabled_at: null,
        scheduled_deletion_at: null,
      })
      .eq("id", businessId);

    if (error) {
      throw new Error(
        `Unable to activate business: ${error.message}`,
      );
    }
    await createBusinessHistory({
  businessId,
  action: "business_restored",
  title: "Business restored",
  description:
    "Business was restored by Super Admin.",
  previousValues: {
    is_active: false,
    scheduled_deletion_at:
      business.scheduled_deletion_at,
  },
  newValues: {
    is_active: true,
    scheduled_deletion_at: null,
  },
  createdBy: superAdmin.id,
});
  }

  if (business.scheduled_deletion_at) {
  await createBusinessHistory({
    businessId,
    action: "business_deletion_cancelled",
    title: "Scheduled deletion cancelled",
    description:
      "Automatic business deletion was cancelled.",
    previousValues: {
      scheduled_deletion_at:
        business.scheduled_deletion_at,
    },
    newValues: {
      scheduled_deletion_at: null,
    },
    createdBy: superAdmin.id,
  });
}

  revalidatePath("/super-admin/businesses");
}

export async function deleteBusiness(
  formData: FormData,
) {
  const currentSuperAdmin =
    await requireSuperAdmin();

  const businessId = getRequiredText(
    formData,
    "businessId",
  );

  const confirmationName = getRequiredText(
    formData,
    "confirmationName",
  );

  /*
   * 1. Load and verify the business.
   */
  const {
    data: business,
    error: businessError,
  } = await supabaseAdmin
    .from("businesses")
    .select("id, name")
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

  if (
    confirmationName !== business.name
  ) {
    throw new Error(
      "The business name does not match.",
    );
  }

  /*
   * 2. Get Auth user IDs before cascade deletion
   * removes business_members.
   */
  const {
    data: memberData,
    error: membersError,
  } = await supabaseAdmin
    .from("business_members")
    .select("user_id")
    .eq("business_id", businessId);

  if (membersError) {
    throw new Error(
      `Unable to load business users: ${membersError.message}`,
    );
  }

  const members =
    (memberData ?? []) as BusinessMember[];

  const memberUserIds = [
    ...new Set(
      members
        .map((member) => member.user_id)
        .filter(Boolean),
    ),
  ];

  /*
   * Never delete the currently logged-in Super Admin,
   * even if bad data accidentally links the account
   * to this business.
   */
  const authUserIdsToDelete =
    memberUserIds.filter(
      (userId) =>
        userId !== currentSuperAdmin.id,
    );

  /*
   * 3. Delete the business.
   *
   * Related tenant data should be removed through
   * ON DELETE CASCADE foreign keys.
   */
  const {
    data: deletedBusiness,
    error: deleteError,
  } = await supabaseAdmin
    .from("businesses")
    .delete()
    .eq("id", businessId)
    .select("id, name")
    .maybeSingle();

  if (deleteError) {
    if (deleteError.code === "23503") {
      throw new Error(
        "The business still has related records protected by a foreign-key constraint. Configure ON DELETE CASCADE for its tenant tables.",
      );
    }

    throw new Error(
      `Unable to delete business: ${deleteError.message}`,
    );
  }

  if (!deletedBusiness) {
    throw new Error(
      "The business could not be deleted.",
    );
  }

  /*
   * 4. Remove corresponding Supabase Auth users.
   */
  const failedAuthDeletions: Array<{
    userId: string;
    message: string;
  }> = [];

  for (const userId of authUserIdsToDelete) {
    const {
      error: authDeleteError,
    } =
      await supabaseAdmin.auth.admin.deleteUser(
        userId,
      );

    if (authDeleteError) {
      failedAuthDeletions.push({
        userId,
        message:
          authDeleteError.message,
      });
    }
  }

  revalidatePath(
    "/super-admin/businesses",
  );

  if (
    failedAuthDeletions.length > 0
  ) {
    console.error(
      "Business deleted, but some Auth users could not be removed:",
      failedAuthDeletions,
    );

    throw new Error(
      `The business and its tenant data were deleted, but ${failedAuthDeletions.length} Auth account${
        failedAuthDeletions.length === 1
          ? ""
          : "s"
      } could not be removed. Check the server logs and delete the remaining account manually in Supabase Authentication.`,
    );
  }

  return {
    success: true,
    businessName:
      deletedBusiness.name,
    deletedAuthUsers:
      authUserIdsToDelete.length,
  };
}

export async function suspendBusiness(
  formData: FormData,
) {
  const superAdmin =
    await requireSuperAdmin();

  const businessId = getRequiredText(
    formData,
    "businessId",
  );

  const reason = getRequiredText(
    formData,
    "reason",
  );

  const {
    data: business,
    error: businessError,
  } = await supabaseAdmin
    .from("businesses")
    .select(`
      id,
      name,
      is_active,
      disabled_at,
      disabled_reason,
      scheduled_deletion_at
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

  if (
    !business.is_active &&
    business.disabled_reason ===
      "manually_suspended"
  ) {
    throw new Error(
      "This business is already suspended.",
    );
  }

  const disabledAt = new Date();

  const scheduledDeletionAt =
    new Date(disabledAt);

  scheduledDeletionAt.setDate(
    scheduledDeletionAt.getDate() + 60,
  );

  const { error: updateError } =
    await supabaseAdmin
      .from("businesses")
      .update({
        is_active: false,
        disabled_at:
          disabledAt.toISOString(),
        disabled_reason:
          "manually_suspended",
        scheduled_deletion_at:
          scheduledDeletionAt.toISOString(),
        updated_at:
          disabledAt.toISOString(),
      })
      .eq("id", businessId);

  if (updateError) {
    throw new Error(
      `Unable to suspend business: ${updateError.message}`,
    );
  }

  await createBusinessHistory({
    businessId,
    action: "business_suspended",
    title: "Business suspended",
    description: `${business.name} was manually suspended.`,
    reason,
    previousValues: {
      is_active:
        business.is_active,
      disabled_at:
        business.disabled_at,
      disabled_reason:
        business.disabled_reason,
      scheduled_deletion_at:
        business.scheduled_deletion_at,
    },
    newValues: {
      is_active: false,
      disabled_at:
        disabledAt.toISOString(),
      disabled_reason:
        "manually_suspended",
      scheduled_deletion_at:
        scheduledDeletionAt.toISOString(),
    },
    metadata: {
      deletion_after_days: 60,
    },
    createdBy: superAdmin.id,
  });

  const { error: auditError } =
    await supabaseAdmin
      .from("audit_logs")
      .insert({
        business_id: businessId,
        action: "business_suspended",
        entity_type: "business",
        entity_id: businessId,
        description: `${business.name} was manually suspended.`,
        metadata: {
          reason,
          business_name:
            business.name,
          disabled_at:
            disabledAt.toISOString(),
          scheduled_deletion_at:
            scheduledDeletionAt.toISOString(),
        },
      });

  if (auditError) {
    console.error(
      "Unable to create suspension audit log:",
      auditError.message,
    );
  }

  revalidatePath(
    `/super-admin/businesses/${businessId}`,
  );

  revalidatePath(
    "/super-admin/businesses",
  );
}

export async function unsuspendBusiness(
  formData: FormData,
) {
  const superAdmin =
    await requireSuperAdmin();

  const businessId = getRequiredText(
    formData,
    "businessId",
  );

  const {
    data: business,
    error: businessError,
  } = await supabaseAdmin
    .from("businesses")
    .select(`
      id,
      name,
      is_active,
      subscription_expires_at,
      disabled_at,
      disabled_reason,
      scheduled_deletion_at
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

  if (
    business.disabled_reason !==
    "manually_suspended"
  ) {
    throw new Error(
      "This business is not manually suspended.",
    );
  }

  if (
    !business.subscription_expires_at
  ) {
    throw new Error(
      "This business does not have a subscription expiry date.",
    );
  }

  const expiry = new Date(
    business.subscription_expires_at,
  );

  if (
    Number.isNaN(expiry.getTime()) ||
    expiry.getTime() <= Date.now()
  ) {
    throw new Error(
      "This business cannot be restored because its subscription has expired. Reactivate or extend the subscription first.",
    );
  }

  const previousDeletionDate =
    business.scheduled_deletion_at;

  const restoredAt = new Date();

  const { error: updateError } =
    await supabaseAdmin
      .from("businesses")
      .update({
        is_active: true,
        disabled_at: null,
        disabled_reason: null,
        scheduled_deletion_at: null,
        updated_at:
          restoredAt.toISOString(),
      })
      .eq("id", businessId);

  if (updateError) {
    throw new Error(
      `Unable to restore business: ${updateError.message}`,
    );
  }

  await createBusinessHistory({
    businessId,
    action: "business_restored",
    title: "Business restored",
    description: `${business.name} was restored.`,
    previousValues: {
      is_active:
        business.is_active,
      disabled_at:
        business.disabled_at,
      disabled_reason:
        business.disabled_reason,
      scheduled_deletion_at:
        previousDeletionDate,
    },
    newValues: {
      is_active: true,
      disabled_at: null,
      disabled_reason: null,
      scheduled_deletion_at: null,
    },
    metadata: {
      restored_at:
        restoredAt.toISOString(),
    },
    createdBy: superAdmin.id,
  });

  if (previousDeletionDate) {
    await createBusinessHistory({
      businessId,
      action:
        "business_deletion_cancelled",
      title:
        "Scheduled deletion cancelled",
      description:
        "Automatic deletion was cancelled when the business was restored.",
      previousValues: {
        scheduled_deletion_at:
          previousDeletionDate,
      },
      newValues: {
        scheduled_deletion_at: null,
      },
      createdBy: superAdmin.id,
    });
  }

  const { error: auditError } =
    await supabaseAdmin
      .from("audit_logs")
      .insert({
        business_id: businessId,
        action: "business_unsuspended",
        entity_type: "business",
        entity_id: businessId,
        description: `${business.name} was restored.`,
        metadata: {
          business_name:
            business.name,
          previous_scheduled_deletion_at:
            previousDeletionDate,
          restored_at:
            restoredAt.toISOString(),
        },
      });

  if (auditError) {
    console.error(
      "Unable to create restoration audit log:",
      auditError.message,
    );
  }

  revalidatePath(
    `/super-admin/businesses/${businessId}`,
  );

  revalidatePath(
    "/super-admin/businesses",
  );
}