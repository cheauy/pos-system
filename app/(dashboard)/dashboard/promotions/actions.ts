"use server";

import { revalidatePath } from "next/cache";

import { createAuditLog } from "@/lib/audit/create-audit-log";
import { requirePermission } from "@/lib/auth/require-permission";
import { supabaseAdmin } from "@/lib/supabase/admin";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalNumber(formData: FormData, key: string) {
  const value = text(formData, key);
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${key} must be a valid number.`);
  }
  return parsed;
}

function optionalInteger(formData: FormData, key: string) {
  const value = optionalNumber(formData, key);
  if (value === null) return null;
  if (!Number.isInteger(value)) {
    throw new Error(`${key} must be a whole number.`);
  }
  return value;
}

function optionalDate(formData: FormData, key: string) {
  const value = text(formData, key);
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${key}.`);
  }
  return date.toISOString();
}

export async function createCoupon(formData: FormData) {
  const business = await requirePermission("storefront.update");

  const code = text(formData, "code").toUpperCase();
  const name = text(formData, "name") || null;
  const discountType = text(formData, "discountType");
  const discountValue = Number(text(formData, "discountValue"));
  const minimumOrder = Number(text(formData, "minimumOrder") || "0");
  const maxDiscount = optionalNumber(formData, "maxDiscount");
  const usageLimit = optionalInteger(formData, "usageLimit");
  const perCustomerLimit = optionalInteger(formData, "perCustomerLimit");
  const startsAt = optionalDate(formData, "startsAt");
  const endsAt = optionalDate(formData, "endsAt");

  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) {
    throw new Error(
      "Coupon code must be 3–30 characters using letters, numbers, _ or -.",
    );
  }

  if (!["percentage", "fixed"].includes(discountType)) {
    throw new Error("Invalid coupon discount type.");
  }

  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    throw new Error("Discount value must be greater than zero.");
  }

  if (discountType === "percentage" && discountValue > 100) {
    throw new Error("Percentage discount cannot exceed 100%.");
  }

  if (!Number.isFinite(minimumOrder) || minimumOrder < 0) {
    throw new Error("Minimum order cannot be negative.");
  }

  if (maxDiscount !== null && maxDiscount <= 0) {
    throw new Error("Maximum discount must be greater than zero.");
  }

  if (usageLimit !== null && usageLimit < 1) {
    throw new Error("Usage limit must be at least 1.");
  }

  if (perCustomerLimit !== null && perCustomerLimit < 1) {
    throw new Error("Per-customer limit must be at least 1.");
  }

  if (
    startsAt &&
    endsAt &&
    new Date(endsAt).getTime() <= new Date(startsAt).getTime()
  ) {
    throw new Error("Coupon end time must be after its start time.");
  }

  const { data, error } = await supabaseAdmin
    .from("business_coupons")
    .insert({
      business_id: business.id,
      code,
      name,
      discount_type: discountType,
      discount_value: discountValue,
      minimum_order: minimumOrder,
      max_discount: maxDiscount,
      usage_limit: usageLimit,
      per_customer_limit: perCustomerLimit,
      starts_at: startsAt,
      ends_at: endsAt,
      is_active: formData.get("isActive") === "on",
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("That coupon code already exists.");
    }
    throw new Error(error.message);
  }

  await createAuditLog({
    action: "create",
    entityType: "coupon",
    entityId: data.id,
    description: `Created coupon ${code}`,
    metadata: {
      discount_type: discountType,
      discount_value: discountValue,
    },
  });

  revalidatePath("/dashboard/promotions");
}

export async function setCouponActive(formData: FormData) {
  const business = await requirePermission("storefront.update");
  const couponId = text(formData, "couponId");
  const active = text(formData, "active") === "true";

  if (!couponId) throw new Error("Invalid coupon.");

  const { data, error } = await supabaseAdmin
    .from("business_coupons")
    .update({
      is_active: active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", couponId)
    .eq("business_id", business.id)
    .select("id, code")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Coupon not found.");

  await createAuditLog({
    action: "update",
    entityType: "coupon",
    entityId: data.id,
    description: `${active ? "Enabled" : "Paused"} coupon ${data.code}`,
  });

  revalidatePath("/dashboard/promotions");
}

export async function deleteCoupon(formData: FormData) {
  const business = await requirePermission("storefront.update");
  const couponId = text(formData, "couponId");

  if (!couponId) throw new Error("Invalid coupon.");

  const { data: coupon, error: loadError } = await supabaseAdmin
    .from("business_coupons")
    .select("id, code, usage_count")
    .eq("id", couponId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (loadError) throw new Error(loadError.message);
  if (!coupon) throw new Error("Coupon not found.");

  if (Number(coupon.usage_count) > 0) {
    const { error } = await supabaseAdmin
      .from("business_coupons")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", couponId)
      .eq("business_id", business.id);

    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabaseAdmin
      .from("business_coupons")
      .delete()
      .eq("id", couponId)
      .eq("business_id", business.id);

    if (error) throw new Error(error.message);
  }

  await createAuditLog({
    action: "delete",
    entityType: "coupon",
    entityId: coupon.id,
    description:
      Number(coupon.usage_count) > 0
        ? `Archived coupon ${coupon.code}`
        : `Deleted coupon ${coupon.code}`,
  });

  revalidatePath("/dashboard/promotions");
}

export async function updateLoyaltySettings(formData: FormData) {
  const business = await requirePermission("storefront.update");

  const loyaltyEnabled = formData.get("loyaltyEnabled") === "on";
  const enableCoupons = formData.get("enableCoupons") === "on";
  const spendPerPoint = Number(text(formData, "spendPerPoint") || "1");
  const loyaltyMinimumOrder = Number(
    text(formData, "loyaltyMinimumOrder") || "0",
  );

  if (!Number.isFinite(spendPerPoint) || spendPerPoint <= 0) {
    throw new Error("Spend per point must be greater than zero.");
  }

  if (
    !Number.isFinite(loyaltyMinimumOrder) ||
    loyaltyMinimumOrder < 0
  ) {
    throw new Error("Loyalty minimum order cannot be negative.");
  }

  const { error } = await supabaseAdmin
    .from("business_storefronts")
    .update({
      enable_coupons: enableCoupons,
      loyalty_enabled: loyaltyEnabled,
      loyalty_spend_per_point: spendPerPoint,
      loyalty_minimum_order: loyaltyMinimumOrder,
      updated_at: new Date().toISOString(),
    })
    .eq("business_id", business.id);

  if (error) throw new Error(error.message);

  await createAuditLog({
    action: "update",
    entityType: "storefront",
    entityId: business.id,
    description: "Updated promotions and loyalty settings",
    metadata: {
      enable_coupons: enableCoupons,
      loyalty_enabled: loyaltyEnabled,
      loyalty_spend_per_point: spendPerPoint,
      loyalty_minimum_order: loyaltyMinimumOrder,
    },
  });

  revalidatePath("/dashboard/promotions");
  revalidatePath("/dashboard/online-store");
}
