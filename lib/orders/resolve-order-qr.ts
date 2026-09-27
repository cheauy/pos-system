'use server';

import { requirePermission } from '@/lib/auth/require-permission';
import { loadDetailedOrder } from '@/app/(dashboard)/dashboard/orders/[id]/order-detail-data';
import { parseOrderQr } from './order-qr';

export async function resolveOrderQr(value: string): Promise<{ id: string } | { error: string }> {
  const business = await requirePermission('orders.view');
  const id = typeof value === 'string' ? parseOrderQr(value) : null;
  if (!id) return { error: 'Scan a TENH POS order QR code.' };
  try {
    const order = await loadDetailedOrder(business.id, id);
    return order ? { id: order.id } : { error: 'Order not found or unavailable in this branch.' };
  } catch {
    return { error: 'Unable to load this order. Please try again.' };
  }
}
