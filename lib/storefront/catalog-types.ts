export type StorefrontCatalogOption = {
  id: string;
  name: string;
  priceAdjustment: number;
  isDefault: boolean;
};

export type StorefrontCatalogOptionGroup = {
  id: string;
  name: string;
  selectionType: "single" | "multiple";
  isRequired: boolean;
  minSelections: number;
  maxSelections: number;
  options: StorefrontCatalogOption[];
};

export type StorefrontCatalogVariant = {
  id: string;
  sku: string | null;
  size: string | null;
  color: string | null;
  imageUrl: string | null;
  sellingPrice: number;
  stockQuantity: number;
};

export type StorefrontCatalogProduct = {
  key: string;
  categoryId: string | null;
  name: string;
  imageUrl: string | null;
  description: string | null;
  productType: "standard" | "variant" | "configurable" | "bundle";
  priceFrom: number;
  totalStock: number;
  variants: StorefrontCatalogVariant[];
  optionGroups: StorefrontCatalogOptionGroup[];
};

export type StorefrontCatalogCategory = {
  id: string;
  name: string;
};
