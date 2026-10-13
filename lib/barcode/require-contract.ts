import type { SupabaseClient } from '@supabase/supabase-js';

export type BarcodeCapability = 'legacy' | 'ready' | 'unavailable';
export const BARCODE_UNAVAILABLE = 'Barcode verification is unavailable. Barcode scans, labels and identifier changes are disabled; choose products manually and retry after verification is restored.';

// Enabled deployments never downgrade to legacy reads/writes after replacements.
export async function barcodeCapability(db: Pick<SupabaseClient, 'rpc'>): Promise<BarcodeCapability> {
  if (process.env.TENH_BARCODE_PRESERVATION !== '1') return 'legacy';
  try {
    const { data, error } = await db.rpc('tenh_barcode_contract_v2_ready');
    return !error && data === true ? 'ready' : 'unavailable';
  } catch { return 'unavailable'; }
}
export async function barcodePreservationEnabled(db: Pick<SupabaseClient, 'rpc'>): Promise<boolean> {
  const capability = await barcodeCapability(db);
  if (capability === 'unavailable') throw new Error(BARCODE_UNAVAILABLE);
  return capability === 'ready';
}
