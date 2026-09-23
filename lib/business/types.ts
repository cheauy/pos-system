export const businessRoles = [
  "owner",
  "admin",
  "manager",
  "cashier",
  "staff",
] as const;

export type BusinessRole =
  (typeof businessRoles)[number];

export const productModes = [
  "standard",
  "variant",
  "configurable",
] as const;

export type ProductMode =
  (typeof productModes)[number];

export type CurrentBusiness = {
  id: string;
  name: string;
  slug: string;
  productMode: ProductMode;
  // Compatibility alias for newer server actions that use the DB-style name.
  product_mode: ProductMode;
  role: BusinessRole;
};
