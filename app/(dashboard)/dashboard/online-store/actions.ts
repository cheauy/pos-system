"use server";

import { getImageFile, uploadStorefrontImage } from "@/lib/storefront/images";

import { revalidatePath } from "next/cache";

import { createAuditLog } from "@/lib/audit/create-audit-log";
import { requirePermission } from "@/lib/auth/require-permission";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { mergeOnlineStoreProfile } from "@/lib/business/business-info";
import { parseStoreProfile, supportsDineIn } from "@/lib/storefront/profile";
import {
  isBusinessType,
} from "@/lib/storefront/types";

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

export async function updateStorefrontSettings(
  _previousState: UpdateStorefrontState,
  formData: FormData,
): Promise<UpdateStorefrontState> {
  try {
    const business = await requirePermission(
      "storefront.update",
    );

    if (formData.has("businessId") && formData.get("businessId") !== business.id) throw new Error("The selected business changed. Reload Online Store Settings before saving.");

    const {
      data: existing,
      error: existingError,
    } = await supabaseAdmin
      .from("business_storefronts")
      .select("display_name, description, logo_url, banner_url, primary_color, currency, khqr_image_url, khqr_account_name, khqr_instructions, accept_cod, accept_khqr, business_type, social_links, minimum_order, delivery_fee, checkout_message, estimated_minutes, updated_at")
      .eq("business_id", business.id)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    // Business Settings owns the mode; never accept it from storefront form data.
    const businessType = existing?.business_type ?? "general";
    if (!isBusinessType(businessType)) throw new Error("Unable to load the business mode from Business Settings.");

    const displayName = formData.has("displayName")
      ? getOptionalText(formData, "displayName")
      : existing?.display_name ?? null;

    if (
      displayName &&
      (displayName.length < 2 ||
        displayName.length > 80)
    ) {
      throw new Error(
        "Store display name must contain 2–80 characters.",
      );
    }

    // Business Information owns the description and store images.
    const description = existing?.description ?? null;

    const primaryColor = formData.has("primaryColor")
      ? getText(formData, "primaryColor") || "#2563EB"
      : existing?.primary_color ?? "#2563EB";

    if (!/^#[0-9A-Fa-f]{6}$/.test(primaryColor)) {
      throw new Error(
        "Please select a valid store color.",
      );
    }

    const currency = (formData.has("currency")
      ? getText(formData, "currency") || "USD"
      : existing?.currency ?? "USD").toUpperCase();

    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new Error(
        "Currency must use a 3-letter code such as USD.",
      );
    }

    // Order rules are no longer shown in Branding. Missing fields must keep
    // the current database values, not reset charges or checkout instructions.
    const minimumOrderRaw = Number(
      formData.has("minimumOrder") ? getText(formData, "minimumOrder") || "0" : existing?.minimum_order ?? 0,
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
      formData.has("deliveryFee") ? getText(formData, "deliveryFee") || "0" : existing?.delivery_fee ?? 0,
    );

    if (!Number.isFinite(deliveryFee) || deliveryFee < 0) {
      throw new Error(
        "Delivery fee must be zero or greater.",
      );
    }

    const checkoutMessage = formData.has("checkoutMessage")
      ? getOptionalText(formData, "checkoutMessage")
      : existing?.checkout_message ?? null;

    if (checkoutMessage && checkoutMessage.length > 300) {
      throw new Error(
        "Checkout message must be 300 characters or fewer.",
      );
    }

    // Online Payment now lives in Business Settings. Missing fields from the
    // Online Store form must preserve the current payment configuration.
    const acceptCod = formData.has("acceptCod")
      ? getBoolean(formData, "acceptCod")
      : existing?.accept_cod ?? false;
    const acceptKhqr = formData.has("acceptKhqr")
      ? getBoolean(formData, "acceptKhqr")
      : existing?.accept_khqr ?? false;
    const khqrAccountName = formData.has("khqrAccountName")
      ? getOptionalText(formData, "khqrAccountName")
      : existing?.khqr_account_name ?? null;
    const khqrInstructions = formData.has("khqrInstructions")
      ? getOptionalText(formData, "khqrInstructions")
      : existing?.khqr_instructions ?? null;

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
      profile: mergeOnlineStoreProfile(existing?.social_links?.profile, parseStoreProfile(formData)),
      facebook: getOptionalUrl(formData, "facebookUrl", "Facebook"),
      instagram: getOptionalUrl(formData, "instagramUrl", "Instagram"),
      tiktok: getOptionalUrl(formData, "tiktokUrl", "TikTok"),
      youtube: getOptionalUrl(formData, "youtubeUrl", "YouTube"),
      telegram: getOptionalUrl(formData, "telegramUrl", "Telegram"),
      whatsapp: getOptionalUrl(formData, "whatsappUrl", "WhatsApp"),
      messenger: getOptionalUrl(formData, "messengerUrl", "Messenger"),
      x: getOptionalUrl(formData, "xUrl", "X"),
    };

    const estimatedMinutesText = formData.has("estimatedMinutes")
      ? getText(formData, "estimatedMinutes")
      : String(existing?.estimated_minutes ?? "");

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

    const khqrFile = getImageFile(
      formData,
      "khqr",
    );

    const logoUrl = existing?.logo_url ?? null;
    const bannerUrl = existing?.banner_url ?? null;
    let khqrImageUrl = getBoolean(formData, "remove-khqr") ? null : existing?.khqr_image_url ?? null;

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

    const values = {
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
    };
    // Keep concurrent Business Settings contact/hour changes and do not upsert
    // an old copy of the shared JSON over a row that changed during this save.
    let result;
    if (existing) {
      let update = supabaseAdmin.from("business_storefronts").update(values).eq("business_id", business.id);
      update = existing.updated_at == null ? update.is("updated_at", null) : update.eq("updated_at", existing.updated_at);
      result = await update.select("business_id").maybeSingle();
    } else {
      result = await supabaseAdmin.from("business_storefronts").insert(values).select("business_id").single();
    }
    const { data: saved, error } = result;
    if (!error && saved?.business_id !== business.id) throw new Error("Settings changed while saving. Reload and review before retrying.");

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

    revalidatePath("/dashboard/settings/online-store");
    revalidatePath("/dashboard/settings/online-store/ordering");
    revalidatePath("/dashboard/products");
    revalidatePath("/dashboard/settings/business");
    revalidatePath("/dashboard/settings/printers");
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


export async function updateOnlinePaymentSettings(
  _previousState: UpdateStorefrontState,
  formData: FormData,
): Promise<UpdateStorefrontState> {
  try {
    const business = await requirePermission("storefront.update");
    if (formData.get("businessId") !== business.id) {
      throw new Error("The selected business changed. Reload Business Settings before saving payment settings.");
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("business_storefronts")
      .select("accept_cod, accept_khqr, khqr_image_url, khqr_account_name, khqr_instructions, accept_online_orders, updated_at")
      .eq("business_id", business.id)
      .maybeSingle();
    if (existingError || !existing) throw new Error("Unable to load online payment settings. Reload Business Settings and try again.");

    const acceptCod = getBoolean(formData, "acceptCod");
    const acceptKhqr = getBoolean(formData, "acceptKhqr");
    const khqrAccountName = getOptionalText(formData, "khqrAccountName");
    const khqrInstructions = getOptionalText(formData, "khqrInstructions");
    if (khqrAccountName && khqrAccountName.length > 120) throw new Error("KHQR account name must be 120 characters or fewer.");
    if (khqrInstructions && khqrInstructions.length > 300) throw new Error("KHQR instructions must be 300 characters or fewer.");
    if (existing.accept_online_orders && !acceptCod && !acceptKhqr) {
      throw new Error("Enable Pay Later or KHQR before accepting online orders.");
    }

    const khqrFile = getImageFile(formData, "khqr");
    let khqrImageUrl = getBoolean(formData, "remove-khqr") ? null : existing.khqr_image_url ?? null;
    if (khqrFile) {
      khqrImageUrl = await uploadStorefrontImage({ businessId: business.id, kind: "khqr", file: khqrFile });
    }
    if (acceptKhqr && !khqrImageUrl) throw new Error("Upload the shop KHQR image before enabling KHQR checkout.");

    let update = supabaseAdmin.from("business_storefronts").update({
      accept_cod: acceptCod,
      accept_khqr: acceptKhqr,
      khqr_image_url: khqrImageUrl,
      khqr_account_name: khqrAccountName,
      khqr_instructions: khqrInstructions,
      updated_at: new Date().toISOString(),
    }).eq("business_id", business.id);
    update = existing.updated_at == null ? update.is("updated_at", null) : update.eq("updated_at", existing.updated_at);
    const { data: saved, error } = await update.select("business_id").maybeSingle();
    if (error) throw new Error(`Unable to save online payment settings: ${error.message}`);
    if (saved?.business_id !== business.id) throw new Error("Payment settings changed in another tab. Reload and review before retrying.");

    await createAuditLog({
      action: "update",
      entityType: "business",
      entityId: business.id,
      description: "Updated online payment settings",
      metadata: { accept_cod: acceptCod, accept_khqr: acceptKhqr },
    });
    revalidatePath("/dashboard/settings/business");
    revalidatePath("/dashboard/settings/online-store");
    revalidatePath(`/_sites/${business.slug}`);
    revalidatePath(`/storefront/${business.slug}`);

    return { success: true, message: "Online payment settings saved.", submittedAt: Date.now() };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unable to save online payment settings.",
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

    revalidatePath("/dashboard/settings/online-store");
    revalidatePath("/dashboard/settings/online-store/ordering");
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

export async function saveFulfillmentBranch(branchId: string) {
  try {
    const business=await requirePermission("storefront.update");
    const {assertBranchOperation}=await import("@/lib/subscriptions/branch-limits");
    await assertBranchOperation(business.id,branchId);
    const {error}=await supabaseAdmin.from("business_storefronts").update({fulfillment_location_id:branchId}).eq("business_id",business.id).select("business_id").single();
    if(error)throw new Error(error.message);
    revalidatePath("/dashboard/settings/online-store");revalidatePath(`/_sites/${business.slug}`);
    return {success:true,message:"Online fulfilment branch saved."};
  }catch(error){return {success:false,message:error instanceof Error?error.message:"Unable to save fulfilment branch."};}
}
