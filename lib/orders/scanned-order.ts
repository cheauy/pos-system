import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { ScannedOrder } from './order-qr';

/** Resolves a scanned code to an order id in this business; branch access is checked by the caller's loader. */
export async function orderIdFromScan(businessId: string, scanned: ScannedOrder): Promise<string | null> {
  if (scanned.kind === 'id') return scanned.id;
  const { data, error } = await supabaseAdmin.from('orders').select('id')
    .eq('business_id', businessId).eq('order_code', scanned.code).is('archived_at', null).maybeSingle();
  if (error) throw new Error('Unable to look up this order code. Please try again.');
  return data?.id ?? null;
}
