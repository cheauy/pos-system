export const businessTypes = [
  "general",
  "restaurant",
  "cafe",
  "milk_tea",
  "fashion",
  "shoes",
  "accessories",
  "beauty",
  "electronics",
  "grocery",
  "other",
] as const;

export type BusinessType =
  (typeof businessTypes)[number];

export type StorefrontSettings = {
  business_id: string;
  business_type: BusinessType;
  is_published: boolean;
  accept_online_orders: boolean;
  template_key: string;
  display_name: string | null;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  primary_color: string;
  phone: string | null;
  address: string | null;
  currency: string;
  allow_pickup: boolean;
  allow_delivery: boolean;
  allow_dine_in: boolean;
  minimum_order: number;
  delivery_fee: number;
  checkout_message: string | null;
  accept_cod: boolean;
  accept_khqr: boolean;
  khqr_image_url: string | null;
  khqr_account_name: string | null;
  khqr_instructions: string | null;
  allow_scheduled_orders: boolean;
  min_schedule_lead_minutes: number;
  max_schedule_days: number;
  enable_coupons: boolean;
  loyalty_enabled: boolean;
  loyalty_spend_per_point: number;
  loyalty_minimum_order: number;
  estimated_minutes: number | null;
  created_at: string;
  updated_at: string;
};

export function isBusinessType(
  value: string,
): value is BusinessType {
  return businessTypes.includes(
    value as BusinessType,
  );
}

export function formatBusinessType(
  value: BusinessType,
) {
  switch (value) {
    case "milk_tea":
      return "Milk Tea";
    default:
      return value
        .split("_")
        .map(
          (word) =>
            word.charAt(0).toUpperCase() +
            word.slice(1),
        )
        .join(" ");
  }
}
