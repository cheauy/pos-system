import type { SupabaseClient } from '@supabase/supabase-js';
import { validateNewProductBarcode } from './code128';

/** Only enabled imports need new-code policy; exact unchanged legacy text is valid. */
export async function importedBarcodeIssue(db: SupabaseClient, businessId: string, rows: Record<string, unknown>[], table = 'branch_products', bySku = true): Promise<string | null> {
  const provided = rows.filter(row => typeof row.barcode === 'string' && row.barcode !== '');
  for (let offset = 0; offset < provided.length; offset += 40) {
    const chunk = provided.slice(offset, offset + 40);
    let query = db.from(table).select(bySku ? 'id,sku,barcode' : table === 'branch_product_details' ? 'id,barcode,location_id' : 'id,barcode').eq('business_id', businessId);
    if (bySku) {
      const literal = (value: unknown) => {
        const pattern = String(value ?? '').replace(/[\\%_]/g, '\\$&');
        return `"${pattern.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
      };
      query = query.or(chunk.map(row => `sku.ilike.${literal(row.sku)}`).join(','));
    } else query = query.in('id', chunk.map(row => row.id));
    const { data, error } = await query;
    if (error) return 'Existing barcode identities could not be verified. No import was submitted.';
    const existing = (data ?? []) as unknown as Array<{ id: string; sku?: string; barcode?: string | null; location_id?: string }>;
    for (const row of chunk) {
      const matches = existing.filter(saved => bySku ? String(saved.sku).toLowerCase() === String(row.sku).toLowerCase() : saved.id === row.id && (!row.location_id || saved.location_id === row.location_id));
      if (matches.length === 1 && matches[0].barcode === row.barcode) continue;
      const issue = validateNewProductBarcode(row.barcode);
      if (issue) return issue;
    }
  }
  return null;
}
