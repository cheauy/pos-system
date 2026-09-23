import type { BusinessRole } from "@/lib/business/types";

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
  "register.manage",
  "locations.manage",
  "transfers.manage",
  "credit.manage",
  "exports.manage",
] as const;

export type Permission = (typeof permissions)[number];

const ownerPermissions: Permission[] = [...permissions];

const adminPermissions: Permission[] = [
  "users.delete",
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
  "register.manage",
  "locations.manage",
  "transfers.manage",
  "credit.manage",
];

const managerPermissions: Permission[] = [
  "users.view",
  "users.create_limited",
  "users.update_role",
  "users.delete",
  "customers.view",
  "customers.create",
  "customers.update",
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
  "register.manage",
  "transfers.manage",
  "credit.manage",
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
  "register.manage",
];

export const rolePermissions: Record<BusinessRole, Permission[]> = {
  owner: ownerPermissions,
  admin: adminPermissions,
  manager: managerPermissions,
  cashier: cashierPermissions,
  staff: [
    "business.view",
    "products.view",
    "orders.view",
    "customers.view",
    "inventory.view",
  ],
};

export const editablePermissionRoles = ["manager", "staff", "cashier"] as const;
export type EditablePermissionRole = (typeof editablePermissionRoles)[number];

/** Friendly labels shown to merchants. Internal permission keys stay server-side. */
export const permissionLabels: Record<Permission, string> = {
  "business.view": "View settings",
  "business.update": "Edit settings",
  "business.product_mode.update": "Business mode",
  "storefront.view": "View store",
  "storefront.update": "Edit store",
  "users.view": "View users",
  "users.create": "Add users",
  "users.create_limited": "Add staff / cashier",
  "users.delete": "Manage access",
  "users.update_role": "Assign role / branch",
  "products.view": "View products",
  "products.create": "Add products",
  "products.update": "Edit products",
  "products.disable": "Disable products",
  "products.stock_adjust": "Adjust stock",
  "pos.access": "Use POS",
  "orders.view": "View orders",
  "orders.create": "Create orders",
  "orders.update": "Update orders",
  "orders.cancel": "Cancel orders",
  "orders.return": "Returns / refunds",
  "customers.view": "View customers",
  "customers.create": "Add customers",
  "customers.update": "Edit customers",
  "reports.view": "View reports",
  "categories.manage": "Manage categories",
  "expenses.manage": "Manage expenses",
  "suppliers.manage": "Manage suppliers",
  "purchases.view": "View purchases",
  "purchases.create": "Add purchases",
  "purchases.update": "Edit purchases",
  "purchases.cancel": "Cancel purchases",
  "inventory.view": "View inventory",
  "audit_logs.view": "View activity",
  "register.manage": "Cash register",
  "locations.manage": "Manage branches",
  "transfers.manage": "Manage stock transfers",
  "credit.manage": "Manage customer credit",
  "exports.manage": "Export data",
};

export const permissionDescriptions: Record<Permission, string> = {
  "business.view": "Open the business information and general settings area.",
  "business.update": "Edit business information and settings that affect the workspace.",
  "business.product_mode.update": "Change the business product mode used by the workspace.",
  "storefront.view": "Open the online store settings and storefront information.",
  "storefront.update": "Change online store settings, branding and storefront configuration.",
  "users.view": "Open User & Manage User and see members of this workspace.",
  "users.create": "Create new Manager, Staff or Cashier accounts when the actor is allowed to assign that role.",
  "users.create_limited": "Create Staff or Cashier accounts only.",
  "users.delete": "Disable a member or remove their access to this workspace.",
  "users.update_role": "Change an existing member's role or the branch assigned by the Owner.",
  "products.view": "Open the product catalog and product details.",
  "products.create": "Create new products and variants.",
  "products.update": "Edit product information, prices and variants.",
  "products.disable": "Hide or disable products without deleting history.",
  "products.stock_adjust": "Increase, decrease or correct stock through inventory adjustments.",
  "pos.access": "Open and use the Point of Sale workspace.",
  "orders.view": "Open orders and order details.",
  "orders.create": "Create new sales orders, including POS checkout when POS access is also enabled.",
  "orders.update": "Move orders through their allowed workflow statuses.",
  "orders.cancel": "Cancel or reject eligible orders.",
  "orders.return": "Create returns and refunds for eligible orders.",
  "customers.view": "Open the customer list and customer details.",
  "customers.create": "Create new customer records.",
  "customers.update": "Edit customer information.",
  "reports.view": "Open business reports and reporting dashboards.",
  "categories.manage": "Create, edit and organize product categories.",
  "expenses.manage": "Create and manage business expenses.",
  "suppliers.manage": "Create and manage suppliers.",
  "purchases.view": "Open purchase orders and purchase details.",
  "purchases.create": "Create new purchase orders.",
  "purchases.update": "Edit, send or receive purchase orders when allowed by their status.",
  "purchases.cancel": "Cancel eligible purchase orders.",
  "inventory.view": "Open inventory pages and stock information.",
  "audit_logs.view": "Open the activity and audit history.",
  "register.manage": "Open, operate and close the assigned branch cash register.",
  "locations.manage": "Create, edit and manage business branches.",
  "transfers.manage": "Create and manage stock transfers between allowed branches.",
  "credit.manage": "Create and manage customer credit transactions.",
  "exports.manage": "Use supported export and backup features.",
};

export const permissionGroups: Array<{ label: string; description: string; permissions: Permission[] }> = [
  {
    label: "Business & Workspace",
    description: "Control access to business settings and workspace-level configuration.",
    permissions: ["business.view", "business.update", "business.product_mode.update"],
  },
  {
    label: "Online Store",
    description: "Control who can open or edit the customer-facing online store.",
    permissions: ["storefront.view", "storefront.update"],
  },
  {
    label: "User & Manage User",
    description: "Control access to team members, role changes and account management.",
    permissions: ["users.view", "users.create", "users.create_limited", "users.delete", "users.update_role"],
  },
  {
    label: "Products & Stock",
    description: "Control product catalog, inventory visibility and stock changes.",
    permissions: ["products.view", "products.create", "products.update", "products.disable", "products.stock_adjust", "categories.manage", "inventory.view", "transfers.manage"],
  },
  {
    label: "Point of Sale & Orders",
    description: "Control checkout, order workflow, returns and cash-register access.",
    permissions: ["pos.access", "orders.view", "orders.create", "orders.update", "orders.cancel", "orders.return", "register.manage"],
  },
  {
    label: "Customers",
    description: "Control customer records and customer-credit features.",
    permissions: ["customers.view", "customers.create", "customers.update", "credit.manage"],
  },
  {
    label: "Suppliers & Purchasing",
    description: "Control suppliers and purchase-order workflows.",
    permissions: ["suppliers.manage", "purchases.view", "purchases.create", "purchases.update", "purchases.cancel"],
  },
  {
    label: "Reports & Administration",
    description: "Control reports, expenses, activity history, branches and export tools.",
    permissions: ["reports.view", "expenses.manage", "audit_logs.view", "locations.manage", "exports.manage"],
  },
];


export const permissionDependencies: Partial<Record<Permission, Permission[]>> = {
  "pos.access": ["products.view", "orders.create", "register.manage", "customers.view"],
  "business.update": ["business.view"],
  "business.product_mode.update": ["business.view"],
  "storefront.update": ["storefront.view"],
  "users.create": ["users.view"],
  "users.create_limited": ["users.view"],
  "users.delete": ["users.view"],
  "users.update_role": ["users.view"],
  "products.create": ["products.view"],
  "products.update": ["products.view"],
  "products.disable": ["products.view"],
  "products.stock_adjust": ["products.view", "inventory.view"],
  "orders.create": ["orders.view"],
  "orders.update": ["orders.view"],
  "orders.cancel": ["orders.view"],
  "orders.return": ["orders.view"],
  "customers.create": ["customers.view"],
  "customers.update": ["customers.view"],
  "purchases.create": ["purchases.view"],
  "purchases.update": ["purchases.view"],
  "purchases.cancel": ["purchases.view"],
  "transfers.manage": ["inventory.view"],
  "credit.manage": ["customers.view"],
};

export function normalizePermissionSelection(values: Permission[]): Permission[] {
  const selected = new Set<Permission>(values);
  let changed = true;
  while (changed) {
    changed = false;
    for (const permission of [...selected]) {
      for (const dependency of permissionDependencies[permission] ?? []) {
        if (!selected.has(dependency)) {
          selected.add(dependency);
          changed = true;
        }
      }
    }
  }
  return permissions.filter((permission) => selected.has(permission));
}

export function removePermissionWithDependents(values: Permission[], removed: Permission): Permission[] {
  const selected = new Set<Permission>(values);
  selected.delete(removed);
  let changed = true;
  while (changed) {
    changed = false;
    for (const permission of [...selected]) {
      if ((permissionDependencies[permission] ?? []).some((dependency) => !selected.has(dependency))) {
        selected.delete(permission);
        changed = true;
      }
    }
  }
  return permissions.filter((permission) => selected.has(permission));
}

export function hasPermission(role: BusinessRole, permission: Permission) {
  return rolePermissions[role]?.includes(permission) ?? false;
}
