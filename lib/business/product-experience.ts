import type { BusinessType } from "@/lib/storefront/types";

export type ProductExperience = {
  modeLabel: string;
  formTitle: string;
  formDescription: string;
  standard?: {
    nameLabel: string;
    namePlaceholder: string;
    skuPlaceholder: string;
    descriptionPlaceholder: string;
    stockLabel: string;
    buttonLabel: string;
    helper: string;
  };
};

const experiences: Record<BusinessType, ProductExperience> = {
  shoes: {
    modeLabel: "Shoes mode",
    formTitle: "Add Shoe",
    formDescription: "Create one shoe model with size, colour, SKU and stock for every variation.",
  },
  fashion: {
    modeLabel: "Fashion mode",
    formTitle: "Add Clothing Style",
    formDescription: "Create a clothing style with size, colour, SKU, price and stock for each variation.",
  },
  milk_tea: {
    modeLabel: "Milk Tea mode",
    formTitle: "Add Drink",
    formDescription: "Create a drink with cup size, sugar, ice, milk and toppings.",
  },
  cafe: {
    modeLabel: "Cafe mode",
    formTitle: "Add Cafe Item",
    formDescription: "Create coffee or food items with size, temperature, milk and add-on choices.",
  },
  restaurant: {
    modeLabel: "Restaurant mode",
    formTitle: "Add Menu Item",
    formDescription: "Create menu items with portions, preparation choices, extras and add-ons.",
  },
  accessories: {
    modeLabel: "Accessories mode",
    formTitle: "Add Accessory",
    formDescription: "Create retail accessories with SKU, price and inventory tracking.",
    standard: {
      nameLabel: "Accessory name",
      namePlaceholder: "Classic Leather Handbag",
      skuPlaceholder: "ACC-001",
      descriptionPlaceholder: "Brand, material, colour, collection or accessory details",
      stockLabel: "Stock quantity",
      buttonLabel: "Add Accessory",
      helper: "Designed for bags, jewellery, phone accessories and other retail items.",
    },
  },
  beauty: {
    modeLabel: "Beauty mode",
    formTitle: "Add Beauty Product",
    formDescription: "Create cosmetics and skincare items with SKU, pricing and stock control.",
    standard: {
      nameLabel: "Beauty product name",
      namePlaceholder: "Hydrating Lip Tint",
      skuPlaceholder: "BEAUTY-001",
      descriptionPlaceholder: "Brand, shade, skin type, size or beauty product details",
      stockLabel: "Units in stock",
      buttonLabel: "Add Beauty Product",
      helper: "Designed for cosmetics, skincare, personal-care and beauty inventory.",
    },
  },
  electronics: {
    modeLabel: "Electronics mode",
    formTitle: "Add Electronic Product",
    formDescription: "Create electronics and accessories with model/SKU, pricing and inventory.",
    standard: {
      nameLabel: "Product / model name",
      namePlaceholder: "Wireless Earbuds Pro",
      skuPlaceholder: "ELEC-001",
      descriptionPlaceholder: "Brand, model, warranty, specifications or device notes",
      stockLabel: "Units in stock",
      buttonLabel: "Add Electronic Product",
      helper: "Designed for electronics, devices and accessories. Use SKU/barcode for fast lookup.",
    },
  },
  grocery: {
    modeLabel: "Grocery mode",
    formTitle: "Add Grocery Item",
    formDescription: "Create fast-moving grocery items with barcode/SKU, price and stock alerts.",
    standard: {
      nameLabel: "Item name",
      namePlaceholder: "Fresh Milk 1L",
      skuPlaceholder: "GROC-001",
      descriptionPlaceholder: "Brand, pack size, storage, expiry or grocery item details",
      stockLabel: "Units in stock",
      buttonLabel: "Add Grocery Item",
      helper: "Designed for grocery and mini-mart checkout with quick barcode/SKU lookup.",
    },
  },
  general: {
    modeLabel: "General Shop mode",
    formTitle: "Add Product",
    formDescription: "Create regular retail products with pricing and inventory tracking.",
    standard: {
      nameLabel: "Product name",
      namePlaceholder: "Product name",
      skuPlaceholder: "ITEM-001",
      descriptionPlaceholder: "Optional product description",
      stockLabel: "Stock quantity",
      buttonLabel: "Add Product",
      helper: "Flexible setup for general retail products and inventory.",
    },
  },
  other: {
    modeLabel: "Other Business mode",
    formTitle: "Add Product",
    formDescription: "Start with a flexible standard product setup and customize it as you grow.",
    standard: {
      nameLabel: "Product name",
      namePlaceholder: "Product name",
      skuPlaceholder: "ITEM-001",
      descriptionPlaceholder: "Optional product description",
      stockLabel: "Stock quantity",
      buttonLabel: "Add Product",
      helper: "Flexible standard product setup for businesses that do not fit another preset.",
    },
  },
};

export function getProductExperience(type: string): ProductExperience {
  return experiences[(type in experiences ? type : "general") as BusinessType];
}
