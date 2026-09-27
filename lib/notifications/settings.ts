export const notificationRoles = ["owner", "admin", "manager", "cashier"] as const;
export const businessAlerts = [
  { type: "new_order", label: "New online / QR order", roles: ["owner", "admin", "manager", "cashier"] },
  { type: "khqr_pending", label: "Payment proof awaiting verification", roles: ["owner", "admin", "manager", "cashier"] },
  { type: "low_stock", label: "Low stock", roles: ["owner", "admin", "manager"] },
  { type: "purchase_order", label: "Purchase order awaiting receipt", roles: ["owner", "admin", "manager"] },
  { type: "stock_transfer", label: "Stock transfer in transit", roles: ["owner", "admin", "manager"] },
  { type: "register_variance", label: "Register over / short", roles: ["owner", "admin", "manager"] },
  { type: "scheduled_order", label: "Scheduled order reminder", roles: ["owner", "admin", "manager", "cashier"] },
] satisfies { type: string; label: string; roles: string[] }[];
