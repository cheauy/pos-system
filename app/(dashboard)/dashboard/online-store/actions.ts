"use server";

import { revalidatePath } from "next/cache";

import { createAuditLog } from "@/lib/audit/create-audit-log";
import { requirePermission } from "@/lib/auth/require-permission";
import { supabaseAdmin } from "@/lib/supabase/admin";
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
  kind: "logo" | "banner";
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

    const businessType = getText(
      formData,
      "businessType",
    );

    if (!isBusinessType(businessType)) {
      throw new Error(
        "Please select a valid business type.",
      );
    }

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
    const allowDineIn = getBoolean(
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

    const logoFile = getImageFile(
      formData,
      "logo",
    );
    const bannerFile = getImageFile(
      formData,
      "banner",
    );

    const {
      data: existing,
      error: existingError,
    } = await supabaseAdmin
      .from("business_storefronts")
      .select("logo_url, banner_url")
      .eq("business_id", business.id)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    let logoUrl = existing?.logo_url ?? null;
    let bannerUrl = existing?.banner_url ?? null;

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

    const now = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from("business_storefronts")
      .upsert(
        {
          business_id: business.id,
          business_type: businessType,
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
          allow_pickup: allowPickup,
          allow_delivery: allowDelivery,
          allow_dine_in: allowDineIn,
          minimum_order: minimumOrderRaw,
          delivery_fee: deliveryFee,
          checkout_message: checkoutMessage,
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
        business_type: businessType,
        is_published: isPublished,
        accept_online_orders:
          acceptOnlineOrders,
        allow_pickup: allowPickup,
        allow_delivery: allowDelivery,
        allow_dine_in: allowDineIn,
        delivery_fee: deliveryFee,
      },
    });

    revalidatePath("/dashboard/online-store");
    revalidatePath("/dashboard/products");
    revalidatePath(`/_sites/${business.slug}`);

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
