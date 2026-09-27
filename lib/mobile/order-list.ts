export function mobileOrderPageSize(value: string | null) {
  const size = Number(value);
  return [8, 10, 15].includes(size) ? size : 8;
}

export function incomingOrderStatus(order: { payment_status: string | null; online_status: string | null }) {
  return order.payment_status === 'refunded' ? 'refunded' : order.online_status === 'rejected' ? 'cancelled' : order.online_status === 'completed' ? 'completed' : 'pending';
}

export async function loadMobileOrderPage(load: (filters: WorkspaceFilters) => Promise<WorkspaceData>, filters: WorkspaceFilters, page: number, size: number) {
  // The shared SQL accepts at least ten rows. Forty is divisible by eight,
  // so mobile grid pages keep exact boundaries without changing web pagination.
  const batch = size === 8 ? 40 : size;
  const offset = (page - 1) * size;
  const sourcePage = Math.floor(offset / batch) + 1;
  const result = await load({ ...filters, page: sourcePage, limit: batch });
  return { ...result, rows: result.page === sourcePage ? result.rows.slice(offset % batch, offset % batch + size) : [], page, pages: Math.max(1, Math.ceil(result.total / size)) };
}
import type { WorkspaceData, WorkspaceFilters } from '@/app/(dashboard)/dashboard/orders/order-workspace-types';
