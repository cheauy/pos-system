"use server";

import { revalidatePath } from "next/cache";

import { createAuditLog } from "@/lib/audit/create-audit-log";
import { requirePermission } from "@/lib/auth/require-permission";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { parseStoreProfile, supportsDineIn } from "@/lib/storefront/profile";
import {
  isBusinessType,
} from "@/lib/storefront/types";

const STOREFRONT_MEDIA_BUCKET = "storefront-media";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type UpdateStorefrontState = {
  success: boolean;
  message: string;
  submittedAt: number;
};

function getText(
  formData: FormData,
  key: string,
) {
  const value = formData.get(key);
  return typeof value === "string"
    ? value.trim()
    : "";
}

function getOptionalText(
  formData: FormData,
  key: string,
) {
  const value = getText(formData, key);
  return value || null;
}

function getBoolean(
  formData: FormData,
  key: string,
) {
  return formData.get(key) === "on";
}


function getOptionalUrl(
  formData: FormData,
  key: string,
  label: string,
) {
  const value = getOptionalText(formData, key);
  if (!value) return null;

  if (value.length > 500) {
    throw new Error(`${label} link must be 500 characters or fewer.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} link must be a complete URL starting with http:// or https://.`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} link must use http:// or https://.`);
  }

  return parsed.toString();
}

function getImageFile(
  formData: FormData,
  key: string,
) {
  const value = formData.get(key);

  if (!(value instanceof File) || value.size === 0) {
    return null;
  }

  if (!ALLOWED_IMAGE_TYPES.has(value.type)) {
    throw new Error(
      "Store images must be JPG, PNG or WebP.",
    );
  }

  if (value.size > MAX_IMAGE_BYTES) {
    throw new Error(
      "Store images must not exceed 5 MB.",
    );
  }

  return value;
}

function getExtension(file: File) {
  switch (file.type) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}

async function uploadStorefrontImage({
  businessId,
  kind,
  file,
}: {
  businessId: string;
  kind: "logo" | "banner" | "khqr";
  file: File;
}) {
  const path = `${businessId}/${kind}/${crypto.randomUUID()}.${getExtension(
    file,
  )}`;

  const { error } = await supabaseAdmin.storage
    .from(STOREFRONT_MEDIA_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });

  if (error) {
    throw new Error(
      `Unable to upload ${kind}: ${error.message}`,
    );
  }

  const { data } = supabaseAdmin.storage
    .from(STOREFRONT_MEDIA_BUCKET)
    .getPublicUrl(path);

  return data.publicUrl;
}

export async function updateStorefrontSettings(
  _previousState: UpdateStorefrontState,
  formData: FormData,
): Promise<UpdateStorefrontState> {
  try {
    const business = await requirePermission(
      "storefront.update",
    );

    const {
      data: existing,
      error: existingError,
    } = await supabaseAdmin
      .from("business_storefronts")
      .select("logo_url, banner_url, khqr_image_url, business_type, social_links")
      .eq("business_id", business.id)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    // Business Settings owns the mode; never accept it from storefront form data.
    const businessType = existing?.business_type ?? "general";
    if (!isBusinessType(businessType)) throw new Error("Unable to load the business mode from Business Settings.");

    const displayName = getOptionalText(
      formData,
      "displayName",
    );

    if (
      displayName &&
      (displayName.length < 2 ||
        displayName.length > 80)
    ) {
      throw new Error(
        "Store display name must contain 2–80 characters.",
      );
    }

    const description = getOptionalText(
      formData,
      "description",
    );

    if (description && description.length > 500) {
      throw new Error(
        "Store description must be 500 characters or fewer.",
      );
    }

    const primaryColor =
      getText(formData, "primaryColor") ||
      "#2563EB";

    if (!/^#[0-9A-Fa-f]{6}$/.test(primaryColor)) {
      throw new Error(
        "Please select a valid store color.",
      );
    }

    const currency = (
      getText(formData, "currency") || "USD"
    ).toUpperCase();

    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new Error(
        "Currency must use a 3-letter code such as USD.",
      );
    }

    const minimumOrderRaw = Number(
      getText(formData, "minimumOrder") || "0",
    );

    if (
      !Number.isFinite(minimumOrderRaw) ||
      minimumOrderRaw < 0
    ) {
      throw new Error(
        "Minimum order must be zero or greater.",
      );
    }

    const deliveryFee = Number(
      getText(formData, "deliveryFee") || "0",
    );

    if (!Number.isFinite(deliveryFee) || deliveryFee < 0) {
      throw new Error(
        "Delivery fee must be zero or greater.",
      );
    }

    const checkoutMessage = getOptionalText(
      formData,
      "checkoutMessage",
    );

    if (checkoutMessage && checkoutMessage.length > 300) {
      throw new Error(
        "Checkout message must be 300 characters or fewer.",
      );
    }

    const acceptCod = getBoolean(formData, "acceptCod");
    const acceptKhqr = getBoolean(formData, "acceptKhqr");
    const khqrAccountName = getOptionalText(formData, "khqrAccountName");
    const khqrInstructions = getOptionalText(formData, "khqrInstructions");

    if (khqrAccountName && khqrAccountName.length > 120) {
      throw new Error("KHQR account name must be 120 characters or fewer.");
    }

    if (khqrInstructions && khqrInstructions.length > 300) {
      throw new Error("KHQR instructions must be 300 characters or fewer.");
    }

    const allowScheduledOrders = getBoolean(formData, "allowScheduledOrders");
    const minScheduleLeadMinutes = Number(
      getText(formData, "minScheduleLeadMinutes") || "30",
    );
    const maxScheduleDays = Number(
      getText(formData, "maxScheduleDays") || "7",
    );

    if (
      !Number.isInteger(minScheduleLeadMinutes) ||
      minScheduleLeadMinutes < 0 ||
      minScheduleLeadMinutes > 10080
    ) {
      throw new Error("Schedule lead time must be between 0 and 10080 minutes.");
    }

    if (
      !Number.isInteger(maxScheduleDays) ||
      maxScheduleDays < 1 ||
      maxScheduleDays > 90
    ) {
      throw new Error("Maximum scheduling window must be between 1 and 90 days.");
    }


    const socialLinks = {
      profile: parseStoreProfile(formData),
      facebook: getOptionalUrl(formData, "facebookUrl", "Facebook"),
      instagram: getOptionalUrl(formData, "instagramUrl", "Instagram"),
      tiktok: getOptionalUrl(formData, "tiktokUrl", "TikTok"),
      youtube: getOptionalUrl(formData, "youtubeUrl", "YouTube"),
      telegram: getOptionalUrl(formData, "telegramUrl", "Telegram"),
      whatsapp: getOptionalUrl(formData, "whatsappUrl", "WhatsApp"),
      messenger: getOptionalUrl(formData, "messengerUrl", "Messenger"),
      x: getOptionalUrl(formData, "xUrl", "X"),
    };

    const estimatedMinutesText = getText(
      formData,
      "estimatedMinutes",
    );

    const estimatedMinutes = estimatedMinutesText
      ? Number(estimatedMinutesText)
      : null;

    if (
      estimatedMinutes !== null &&
      (!Number.isInteger(estimatedMinutes) ||
        estimatedMinutes < 1 ||
        estimatedMinutes > 1440)
    ) {
      throw new Error(
        "Estimated preparation time must be between 1 and 1440 minutes.",
      );
    }

    const isPublished = getBoolean(
      formData,
      "isPublished",
    );

    const acceptOnlineOrders = getBoolean(
      formData,
      "acceptOnlineOrders",
    );

    const allowPickup = getBoolean(
      formData,
      "allowPickup",
    );
    const allowDelivery = getBoolean(
      formData,
      "allowDelivery",
    );
    const allowDineIn = supportsDineIn(businessType) && getBoolean(
      formData,
      "allowDineIn",
    );

    if (
      acceptOnlineOrders &&
      !allowPickup &&
      !allowDelivery &&
      !allowDineIn
    ) {
      throw new Error(
        "Enable at least one fulfillment option before accepting online orders.",
      );
    }

    if (acceptOnlineOrders && !acceptCod && !acceptKhqr) {
      throw new Error(
        "Enable Pay Later or KHQR before accepting online orders.",
      );
    }

    const logoFile = getImageFile(
      formData,
      "logo",
    );
    const bannerFile = getImageFile(
      formData,
      "banner",
    );
    const khqrFile = getImageFile(
      formData,
      "khqr",
    );

    let logoUrl = getBoolean(formData, "remove-logo") ? null : existing?.logo_url ?? null;
    let bannerUrl = getBoolean(formData, "remove-banner") ? null : existing?.banner_url ?? null;
    let khqrImageUrl = getBoolean(formData, "remove-khqr") ? null : existing?.khqr_image_url ?? null;

    if (logoFile) {
      logoUrl = await uploadStorefrontImage({
        businessId: business.id,
        kind: "logo",
        file: logoFile,
      });
    }

    if (bannerFile) {
      bannerUrl = await uploadStorefrontImage({
        businessId: business.id,
        kind: "banner",
        file: bannerFile,
      });
    }

    if (khqrFile) {
      khqrImageUrl = await uploadStorefrontImage({
        businessId: business.id,
        kind: "khqr",
        file: khqrFile,
      });
    }

    if (acceptKhqr && !khqrImageUrl) {
      throw new Error(
        "Upload the shop KHQR image before enabling KHQR checkout.",
      );
    }

    const now = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from("business_storefronts")
      .upsert(
        {
          business_id: business.id,
          is_published: isPublished,
          accept_online_orders:
            acceptOnlineOrders,
          template_key: "modern",
          display_name: displayName,
          description,
          logo_url: logoUrl,
          banner_url: bannerUrl,
          primary_color: primaryColor,
          phone: getOptionalText(
            formData,
            "phone",
          ),
          address: getOptionalText(
            formData,
            "address",
          ),
          currency,
          social_links: { ...(existing?.social_links ?? {}), ...socialLinks, profile: { ...(existing?.social_links?.profile ?? {}), ...socialLinks.profile } },
          allow_pickup: allowPickup,
          allow_delivery: allowDelivery,
          allow_dine_in: allowDineIn,
          minimum_order: minimumOrderRaw,
          delivery_fee: deliveryFee,
          checkout_message: checkoutMessage,
          accept_cod: acceptCod,
          accept_khqr: acceptKhqr,
          khqr_image_url: khqrImageUrl,
          khqr_account_name: khqrAccountName,
          khqr_instructions: khqrInstructions,
          allow_scheduled_orders: allowScheduledOrders,
          min_schedule_lead_minutes: minScheduleLeadMinutes,
          max_schedule_days: maxScheduleDays,
          estimated_minutes: estimatedMinutes,
          updated_at: now,
        },
        {
          onConflict: "business_id",
        },
      );

    if (error) {
      throw new Error(
        `Unable to save online store: ${error.message}`,
      );
    }

    await createAuditLog({
      action: "update",
      entityType: "business",
      entityId: business.id,
      description: "Updated online store settings",
      metadata: {
        old_business_type: existing?.business_type ?? null,
        business_type: businessType,
        old_product_mode: business.product_mode,
        product_mode: business.product_mode,
        is_published: isPublished,
        accept_online_orders:
          acceptOnlineOrders,
        allow_pickup: allowPickup,
        allow_delivery: allowDelivery,
        allow_dine_in: allowDineIn,
        delivery_fee: deliveryFee,
        accept_cod: acceptCod,
        accept_khqr: acceptKhqr,
        allow_scheduled_orders: allowScheduledOrders,
      },
    });

    revalidatePath("/dashboard/online-store");
    revalidatePath("/dashboard/online-store/ordering");
    revalidatePath("/dashboard/products");
    revalidatePath("/dashboard/settings/business");
    revalidatePath(`/_sites/${business.slug}`);
    revalidatePath(`/storefront/${business.slug}`);

    return {
      success: true,
      message: "Online store settings saved.",
      submittedAt: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to save online store settings.",
      submittedAt: Date.now(),
    };
  }
}


export async function updateFulfillmentSettings(
  _previousState: UpdateStorefrontState,
  formData: FormData,
): Promise<UpdateStorefrontState> {
  try {
    const business = await requirePermission("storefront.update");

    const allowPickup = getBoolean(formData, "allowPickup");
    const allowDelivery = getBoolean(formData, "allowDelivery");
    const { data: mode, error: modeError } = await supabaseAdmin.from("business_storefronts")
      .select("business_type").eq("business_id", business.id).single();
    if (modeError) throw new Error("Unable to load the store business type.");
    const allowDineIn = supportsDineIn(mode.business_type) && getBoolean(formData, "allowDineIn");

    const minimumOrder = Number(getText(formData, "minimumOrder") || "0");
    const deliveryFee = Number(getText(formData, "deliveryFee") || "0");
    const checkoutMessage = getOptionalText(formData, "checkoutMessage");
    const estimatedMinutesText = getText(formData, "estimatedMinutes");
    const estimatedMinutes = estimatedMinutesText ? Number(estimatedMinutesText) : null;
    const allowScheduledOrders = getBoolean(formData, "allowScheduledOrders");
    const minScheduleLeadMinutes = Number(
      getText(formData, "minScheduleLeadMinutes") || "30",
    );
    const maxScheduleDays = Number(
      getText(formData, "maxScheduleDays") || "7",
    );

    if (!Number.isFinite(minimumOrder) || minimumOrder < 0) {
      throw new Error("Minimum order must be zero or greater.");
    }

    if (!Number.isFinite(deliveryFee) || deliveryFee < 0) {
      throw new Error("Delivery fee must be zero or greater.");
    }

    if (checkoutMessage && checkoutMessage.length > 300) {
      throw new Error("Checkout message must be 300 characters or fewer.");
    }

    if (
      estimatedMinutes !== null &&
      (!Number.isInteger(estimatedMinutes) ||
        estimatedMinutes < 1 ||
        estimatedMinutes > 1440)
    ) {
      throw new Error(
        "Estimated preparation time must be between 1 and 1440 minutes.",
      );
    }

    if (
      !Number.isInteger(minScheduleLeadMinutes) ||
      minScheduleLeadMinutes < 0 ||
      minScheduleLeadMinutes > 10080
    ) {
      throw new Error("Schedule lead time must be between 0 and 10080 minutes.");
    }

    if (
      !Number.isInteger(maxScheduleDays) ||
      maxScheduleDays < 1 ||
      maxScheduleDays > 90
    ) {
      throw new Error("Maximum scheduling window must be between 1 and 90 days.");
    }

    const { data: current, error: currentError } = await supabaseAdmin
      .from("business_storefronts")
      .select("accept_online_orders")
      .eq("business_id", business.id)
      .maybeSingle();

    if (currentError) {
      throw new Error(currentError.message);
    }

    if (
      current?.accept_online_orders &&
      !allowPickup &&
      !allowDelivery &&
      !allowDineIn
    ) {
      throw new Error(
        "Enable at least one fulfillment option while online orders are active.",
      );
    }

    const { error } = await supabaseAdmin
      .from("business_storefronts")
      .update({
        allow_pickup: allowPickup,
        allow_delivery: allowDelivery,
        allow_dine_in: allowDineIn,
        minimum_order: minimumOrder,
        delivery_fee: deliveryFee,
        checkout_message: checkoutMessage,
        allow_scheduled_orders: allowScheduledOrders,
        min_schedule_lead_minutes: minScheduleLeadMinutes,
        max_schedule_days: maxScheduleDays,
        estimated_minutes: estimatedMinutes,
        updated_at: new Date().toISOString(),
      })
      .eq("business_id", business.id);

    if (error) {
      throw new Error(`Unable to save fulfillment settings: ${error.message}`);
    }

    await createAuditLog({
      action: "update",
      entityType: "business",
      entityId: business.id,
      description: "Updated online store fulfillment settings",
      metadata: {
        allow_pickup: allowPickup,
        allow_delivery: allowDelivery,
        allow_dine_in: allowDineIn,
        minimum_order: minimumOrder,
        delivery_fee: deliveryFee,
        allow_scheduled_orders: allowScheduledOrders,
      },
    });

    revalidatePath("/dashboard/online-store");
    revalidatePath("/dashboard/online-store/ordering");
    revalidatePath(`/_sites/${business.slug}`);
    revalidatePath(`/storefront/${business.slug}`);

    return {
      success: true,
      message: "Ordering & fulfillment settings saved.",
      submittedAt: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to save ordering & fulfillment settings.",
      submittedAt: Date.now(),
    };
  }
}
