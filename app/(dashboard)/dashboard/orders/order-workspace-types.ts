export type OrderStatus = "new" | "pending" | "completed" | "cancelled" | "refunded";
export type PaymentState = "paid" | "unpaid" | "partial" | "pending_verification" | "refunded";
export type WorkspaceFilters = {
  search: string; status: string; branch: string; source: string;
  fulfillment: string; payment: string; from: string; to: string;
  sort: string; page: number; limit: number;
};
export type OrderRow = {
  id: string; orderNumber: string; customerId: string | null;
  customerName: string; customerPhone: string | null;
  source: string; fulfillment: string | null; status: OrderStatus;
  onlineStatus: string | null; paymentState: PaymentState; paymentMethod: string;
  total: number; amountPaid: number; createdAt: string; updatedAt: string | null;
  branchId: string | null; branchName: string; itemCount: number;
  deleteBlocked: boolean;
};
export type OrderItem = {
  id: string; name: string; imageUrl: string | null; variant: string | null;
  returnedQuantity: number; quantity: number; unitPrice: number; subtotal: number; options: string[];
};
export type OrderDetail = OrderRow & {
  customerEmail: string | null; customerAddress: string | null; note: string | null;
  guestName: string | null; guestPhone: string | null; guestAddress: string | null;
  subtotal: number; discount: number; deliveryFee: number; changeAmount: number;
  remainingBalance: number; couponCode: string | null; couponDiscount: number;
  paymentReference: string | null; tableName: string | null; requestedFor: string | null;
  items: OrderItem[]; returnsUnavailable: boolean;
  activity: { id: string; description: string; createdAt: string }[];
  activityUnavailable: boolean;
};
export type WorkspaceData = {
  rows: OrderRow[]; total: number; page: number; pages: number;
  counts: Record<string, number>;
  metrics: { today: number; yesterday: number; completed: number; pending: number; pendingValue: number; refunds: number; refundedAmount: number };
  currency: string; timezone: string;
  branches: { id: string; name: string }[];
};
export type WorkspacePermissions = { edit: boolean; cancel: boolean; delete: boolean; refund: boolean; create: boolean };
export type ActionResult<T = undefined> =
  | { success: true; data: T; message?: string }
  | { success: false; message: string };
export type EditOrderInput = {
  note: string; guestName?: string; guestPhone?: string; guestAddress?: string;
};

export const statusLabels: Record<string, string> = {
  all: "All", new: "New", pending: "Pending", completed: "Completed", cancelled: "Cancelled", refunded: "Returned",
  accepted: "Accepted", preparing: "Preparing", ready: "Ready", rejected: "Rejected",
};
export const paymentLabels: Record<string, string> = {
  paid: "Paid", unpaid: "Unpaid", partial: "Part-paid", pending_verification: "Verification", refunded: "Refunded",
};
export const sourceLabels: Record<string, string> = { pos: "In-store", online: "Online", qr: "Table QR" };
export const fulfillmentLabels: Record<string, string> = { walk_in: "Walk-in", pickup: "Pickup", delivery: "Delivery" };
export function methodLabel(value: string) {
  if (value === "cod") return "Pay later / Cash";
  if (value === "khqr") return "KHQR";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
export function money(value: number, currency = "USD") {
  const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
}
export function dateText(value: string, timezone: string, timeOnly = false) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, ...(timeOnly ? { hour: "numeric", minute: "2-digit" } as const : { month: "short", day: "numeric", year: "numeric" } as const) }).format(date);
}
export function nextStatuses(order: OrderRow, canCancel: boolean): { value: string; label: string }[] {
  if (["completed", "cancelled", "refunded"].includes(order.status)) return [];
  const options: { value: string; label: string }[] = [];
  if (["online", "qr"].includes(order.source)) {
    const next: Record<string, { value: string; label: string }> = {
      new: { value: "accepted", label: "Accept order" },
      accepted: { value: "preparing", label: "Start preparing" },
      preparing: { value: "ready", label: "Mark ready" },
      ready: { value: "completed", label: "Complete order" },
    };
    const choice = next[order.onlineStatus || "new"];
    if (choice) options.push(choice);
  } else {
    if (order.status === "new") options.push({ value: "pending", label: "Mark pending" });
    options.push({ value: "completed", label: "Mark completed" });
  }
  if (canCancel && !order.deleteBlocked) options.push({ value: "cancelled", label: "Cancel order (restore stock)" });
  return options;
}
export function deleteReason(order: OrderRow) {
  if (!["new", "pending", "cancelled"].includes(order.status)) return "Completed and refunded records cannot be deleted. Use the return/refund workflow.";
  if (order.deleteBlocked) return "This order has payment, credit, loyalty, or return history. Use the return/refund workflow instead.";
  return "";
}
const validStatuses = ["all", "new", "pending", "completed", "cancelled", "refunded"];
function choose(value: unknown, options: string[], fallback: string) { return typeof value === "string" && options.includes(value) ? value : fallback; }
function dateParam(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : "";
}
export function parseFilters(params: Record<string, string | string[] | undefined>): WorkspaceFilters {
  const requestedPage = Number(params.page);
  const rawBranch = typeof params.branch === "string" ? params.branch : "";
  const from = dateParam(params.from), to = dateParam(params.to);
  return {
    search: typeof params.search === "string" ? params.search.trim().slice(0, 120) : "",
    status: choose(params.status, validStatuses, "all"),
    branch: /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(rawBranch) ? rawBranch : "all",
    source: choose(params.source, ["all", "pos", "online", "qr"], "all"),
    fulfillment: params.fulfillment === 'dine_in' ? 'walk_in' : choose(params.fulfillment, ["all", "pickup", "delivery", "walk_in"], "all"),
    payment: choose(params.payment, ["all", "paid", "unpaid", "partial", "pending_verification", "refunded"], "all"),
    from: from && to && from > to ? to : from,
    to: from && to && from > to ? from : to,
    sort: choose(params.sort, ["newest", "oldest"], "newest"),
    page: Number.isSafeInteger(requestedPage) ? Math.min(1000000, Math.max(1, requestedPage)) : 1,
    limit: [10, 20, 50].includes(Number(params.limit)) ? Number(params.limit) : 10,
  };
}
