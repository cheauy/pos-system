import type { ProductMode } from "@/lib/business/types";
import type { BusinessType } from "@/lib/storefront/types";

export type BusinessModePreset = {
  value: BusinessType;
  label: string;
  shortLabel: string;
  description: string;
  productMode: ProductMode;
  productHint: string;
};

export const businessModePresets: BusinessModePreset[] = [
  {
    value: "shoes",
    label: "Shoes Store",
    shortLabel: "Shoes",
    description: "Sell shoes with size, colour, SKU and stock for each variation.",
    productMode: "variant",
    productHint: "Variant products",
  },
  {
    value: "milk_tea",
    label: "Milk Tea",
    shortLabel: "Milk Tea",
    description: "Build drinks with size, sugar, ice, milk and topping choices.",
    productMode: "configurable",
    productHint: "Configurable products",
  },
  {
    value: "restaurant",
    label: "Restaurant",
    shortLabel: "Restaurant",
    description: "Menu ordering with extras, options, dine-in, pickup and delivery.",
    productMode: "configurable",
    productHint: "Configurable menu items",
  },
  {
    value: "cafe",
    label: "Cafe / Coffee",
    shortLabel: "Cafe",
    description: "Coffee and food ordering with sizes, add-ons and preparation options.",
    productMode: "configurable",
    productHint: "Configurable menu items",
  },
  {
    value: "fashion",
    label: "Fashion / Clothing",
    shortLabel: "Fashion",
    description: "Sell clothing with size, colour and stock per variation.",
    productMode: "variant",
    productHint: "Variant products",
  },
  {
    value: "accessories",
    label: "Accessories",
    shortLabel: "Accessories",
    description: "Simple retail inventory for bags, jewellery, phone accessories and more.",
    productMode: "standard",
    productHint: "Standard products",
  },
  {
    value: "beauty",
    label: "Beauty",
    shortLabel: "Beauty",
    description: "Manage cosmetics, skincare and beauty products in one catalogue.",
    productMode: "standard",
    productHint: "Standard products",
  },
  {
    value: "electronics",
    label: "Electronics",
    shortLabel: "Electronics",
    description: "Track electronics, accessories, pricing and inventory.",
    productMode: "standard",
    productHint: "Standard products",
  },
  {
    value: "grocery",
    label: "Grocery / Mini Mart",
    shortLabel: "Grocery",
    description: "Fast retail checkout for grocery and convenience products.",
    productMode: "standard",
    productHint: "Standard products",
  },
  {
    value: "general",
    label: "General Shop",
    shortLabel: "General",
    description: "A flexible POS for stores that sell regular products and inventory.",
    productMode: "standard",
    productHint: "Standard products",
  },
  {
    value: "other",
    label: "Other Business",
    shortLabel: "Other",
    description: "Start with the standard product setup and customize it later.",
    productMode: "standard",
    productHint: "Standard products",
  },
];

export function getBusinessModePreset(
  value: string,
): BusinessModePreset | null {
  return (
    businessModePresets.find(
      (preset) => preset.value === value,
    ) ?? null
  );
}

export function getBusinessModeDefaults(
  value: BusinessType,
) {
  const foodBusiness =
    value === "restaurant" ||
    value === "cafe" ||
    value === "milk_tea";

  return {
    allowPickup: true,
    allowDelivery: true,
    allowDineIn: foodBusiness,
  };
}
