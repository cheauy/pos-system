'use server';

import { requirePermission } from '@/lib/auth/require-permission';
import { loadDetailedOrder } from '@/app/(dashboard)/dashboard/orders/[id]/order-detail-data';
import { parseOrderQr } from './order-qr';
import { orderIdFromScan } from './scanned-order';

export async function resolveOrderQr(value: string): Promise<{ id: string } | { error: string }> {
  const business = await requirePermission('orders.view');
  const scanned = typeof value === 'string' ? parseOrderQr(value) : null;
  if (!scanned) return { error: 'Scan a TENH POS order QR code or barcode.' };
  try {
    const id = await orderIdFromScan(business.id, scanned);
    const order = id ? await loadDetailedOrder(business.id, id) : null;
    return order ? { id: order.id } : { error: 'Order not found or unavailable in this branch.' };
  } catch {
    return { error: 'Unable to load this order. Please try again.' };
  }
}
