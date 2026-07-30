export const businessRoles = [
  "owner",
  "admin",
  "manager",
  "cashier",
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
  role: BusinessRole;
};