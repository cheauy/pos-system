import type {
  BusinessRole,
} from "@/lib/business/types";

export const permissions = [
  // Business
  "business.view",
  "business.update",
  "business.product_mode.update",

  // Online Store
  "storefront.view",
  "storefront.update",

  // Users
  "users.view",
  "users.create",
  "users.create_limited",
  "users.delete",
  "users.update_role",

  // Products
  "products.view",
  "products.create",
  "products.update",
  "products.disable",
  "products.stock_adjust",

  // POS
  "pos.access",

  // Orders
  "orders.view",
  "orders.create",
  "orders.update",
  "orders.cancel",
  "orders.return",

  // Customers
  "customers.view",
  "customers.create",
  "customers.update",

  // Reports
  "reports.view",

  // Other modules
  "categories.manage",
  "expenses.manage",
  "suppliers.manage",
  "purchases.view",
    "purchases.create",
    "purchases.update",
    "purchases.cancel",
  "inventory.view",
  "audit_logs.view",
] as const;

export type Permission =
  (typeof permissions)[number];

const ownerPermissions: Permission[] = [
  ...permissions,
];

const adminPermissions: Permission[] = [
  "business.view",
  "storefront.view",
  "storefront.update",

  "users.view",
  "users.create_limited",
  "users.update_role",

  "products.view",
  "products.create",
  "products.update",
  "products.disable",
  "products.stock_adjust",

  "orders.view",
  "orders.create",
  "orders.update",
  "orders.cancel",
  "orders.return",

  "customers.view",
  "customers.create",
  "customers.update",

  "reports.view",
  "categories.manage",
  "inventory.view",
];

const managerPermissions: Permission[] = [
  "business.view",
  "storefront.view",

  "products.view",
  "products.create",
  "products.update",
  "products.disable",
  "products.stock_adjust",

  "orders.view",
  "orders.create",
  "orders.update",
  "orders.cancel",
  "orders.return",

  "reports.view",
  "categories.manage",
  "inventory.view",
];

const cashierPermissions: Permission[] = [
  "business.view",

  "pos.access",

  "products.view",

  "orders.view",
  "orders.create",
  "orders.update",

  "customers.view",
  "customers.create",
  "customers.update",
];

const editorPermissions: Permission[] = [
  "business.view",

  "products.view",
  "products.create",
  "products.update",
  "products.stock_adjust",

  "orders.view",
  "orders.update",

  "customers.view",
  "customers.create",
  "customers.update",

  "reports.view",
  "inventory.view",
];

const viewerPermissions: Permission[] = [
  "business.view",
  "products.view",
  "orders.view",
  "customers.view",
  "reports.view",
  "inventory.view",
];

export const rolePermissions: Record<
  BusinessRole,
  Permission[]
> = {
  owner: ownerPermissions,
  admin: adminPermissions,
  manager: managerPermissions,
  cashier: cashierPermissions,
 
};

export function hasPermission(
  role: BusinessRole,
  permission: Permission,
) {
  return rolePermissions[role].includes(permission);
}