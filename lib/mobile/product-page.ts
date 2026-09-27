import type { SupabaseClient } from '@supabase/supabase-js';

// The caller supplies its authenticated, branch-scoped client. Page product
// families first so a family is never split across multiple mobile pages.
export async function mobileProductPage(db: SupabaseClient, businessId: string, fields: string, page: number, filters: { term: string; active?: boolean; bundles?: boolean; components?: boolean; category?: string; pageSize?: number }) {
  const base = (select: string) => {
    let query = db.from('branch_products').select(select).eq('business_id', businessId);
    if (filters.active) query = query.eq('is_active', true);
    if (filters.bundles) query = query.eq('product_type', 'bundle');
    if (filters.components) query = query.neq('product_type', 'bundle');
    if (filters.category) query = query.eq('category_id', filters.category);
    return query;
  };
  const families = new Map<string, { id: string; variant_group_id: string | null }>();
  // Read only identity columns for counting; load photos/details for this page.
  // ponytail: counting is O(catalog size); use a database grouping view if large catalogs make this slow.
  for (let offset = 0; ; offset += 1000) {
    let query = base('id,name,variant_group_id');
    if (filters.term) query = query.or(`name.ilike.%${filters.term}%,sku.ilike.%${filters.term}%,barcode.ilike.%${filters.term}%,size.ilike.%${filters.term}%,color.ilike.%${filters.term}%`);
    const result = await query.order('name').order('id').range(offset, offset + 999);
    if (result.error) throw new Error(result.error.message);
    const rows = result.data as unknown as { id: string; variant_group_id: string | null }[];
    for (const row of rows) families.set(row.variant_group_id ? `variant:${row.variant_group_id}` : row.id, row);
    if (rows.length < 1000) break;
  }
  const pageSize = [4,8,9,10,25].includes(filters.pageSize??25) ? filters.pageSize??25 : 25;
  const selected = [...families.entries()].slice((page - 1) * pageSize, page * pageSize);
  if (!selected.length) return { rows: [], total: families.size };
  const groupIds = selected.map(([, row]) => row.variant_group_id).filter(Boolean);
  const ids = selected.filter(([, row]) => !row.variant_group_id).map(([, row]) => row.id);
  const conditions = [groupIds.length ? `variant_group_id.in.(${groupIds.join(',')})` : '', ids.length ? `id.in.(${ids.join(',')})` : ''].filter(Boolean).join(',');
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await base(fields).or(conditions).order('name').order('id').range(offset, offset + 999);
    if (result.error) throw new Error(result.error.message);
    const batch = result.data as unknown as Record<string, unknown>[];
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  const positions = new Map(selected.map(([key], index) => [key, index]));
  rows.sort((a, b) => (positions.get(a.variant_group_id ? `variant:${a.variant_group_id}` : String(a.id)) ?? 0) - (positions.get(b.variant_group_id ? `variant:${b.variant_group_id}` : String(b.id)) ?? 0));
  return { rows, total: families.size };
}
