import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadDetailedOrder } from '@/app/(dashboard)/dashboard/orders/[id]/order-detail-data';
import type { GlobalSearchResult } from '@/app/(dashboard)/dashboard/search/search-types';
import { barcodePreservationEnabled } from '@/lib/barcode/require-contract';

function exactIdentifier(fields: string[], value: string) {
  const quoted = `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  return fields.map(field => `${field}.eq.${quoted}`).join(',');
}

function missingLookup(error: { code?: string } | null) { return error?.code === 'PGRST202' || error?.code === '42883'; }

/** Match exact barcode/SKU/legacy aliases, never a prefix or zero-stripped value. */
export async function exactScanResults(db: SupabaseClient, businessId: string, branchId: string, permissions: Set<string>, value: string, productsOnly = false): Promise<GlobalSearchResult[]> {
  const results: GlobalSearchResult[] = [];
  const preservation = await barcodePreservationEnabled(db);
  if (permissions.has('products.view')) {
    const initialLookup = preservation ? await db.rpc('tenh_scan_product_ids', { p_business: businessId, p_value: value }) : { data: null, error: { code: 'PGRST202' } };
    if (preservation && (!Array.isArray(initialLookup.data) || initialLookup.data.some((row: {product_id?: unknown}) => typeof row?.product_id !== 'string'))) throw new Error('Product barcode alias lookup is unavailable. No partial scan results were returned.');
    let lookup = { data: initialLookup.data, error: initialLookup.error };
    // Current fields remain searchable without installing the optional legacy-alias lookup RPCs.
    if (!preservation && missingLookup(lookup.error)) {
      const current = await db.from('branch_products').select('id').eq('business_id', businessId).or(exactIdentifier(['barcode', 'sku'], value));
      lookup = { error: current.error, data: current.data?.map(row => ({ product_id: row.id })) ?? null };
    }
    if (lookup.error) throw new Error('Exact barcode lookup requires the reviewed barcode-preservation database proposal.');
    const ids: string[] = (lookup.data ?? []).map((row: { product_id: string }) => row.product_id);
    if (ids.length) {
      const { data, error } = await db.from('branch_products').select('id,name,sku,barcode,size,color,image_url,selling_price,stock_quantity,created_at,is_active').eq('business_id', businessId).in('id', ids);
      if (error) throw new Error('Product barcode lookup could not be completed. Please try again.');
      for (const product of data ?? []) results.push({ id: product.id, kind: 'product', title: product.name, subtitle: [product.sku, product.color, product.size, `${Number(product.stock_quantity ?? 0)} in stock`].filter(Boolean).join(' / '), href: permissions.has('products.update') ? `/dashboard/products/${product.id}/edit` : '/dashboard/products', badge: 'Product', branchId, branchName: null, status: product.is_active ? 'active' : 'inactive', createdAt: product.created_at ?? null, amount: Number(product.selling_price), imageUrl: product.image_url, details: [{ label: 'Scanned identifier', value }, { label: 'SKU', value: product.sku ?? '' }, { label: 'Barcode', value: product.barcode ?? '' }] });
    }
  }
  if (!productsOnly && permissions.has('orders.view')) {
    const initialLookup = preservation ? await db.rpc('tenh_scan_order_ids', { p_business: businessId, p_value: value }) : { data: null, error: { code: 'PGRST202' } };
    if (preservation && (!Array.isArray(initialLookup.data) || initialLookup.data.some((row: {order_id?: unknown}) => typeof row?.order_id !== 'string'))) throw new Error('Order barcode alias lookup is unavailable. No partial scan results were returned.');
    let lookup = { data: initialLookup.data, error: initialLookup.error };
    if (!preservation && missingLookup(lookup.error)) {
      const current = await db.from('orders').select('id').eq('business_id', businessId).is('archived_at', null).or(exactIdentifier(['order_code', 'order_number'], value));
      lookup = { error: current.error, data: current.data?.map(row => ({ order_id: row.id })) ?? null };
    }
    if (lookup.error) throw new Error('Order barcode lookup could not be completed. The reviewed barcode-preservation database proposal may be required.');
    for (const { order_id: id } of lookup.data ?? []) {
      // Service-role contents are never read before the loader's business/branch authorization.
      const order = await loadDetailedOrder(businessId, id);
      if (!order) continue;
      results.push({ id: order.id, kind: 'order', title: order.order_number, subtitle: 'Scanned order', href: `/dashboard/orders/${order.id}`, badge: 'Order', branchId: order.location_id, branchName: null, status: order.status, createdAt: order.created_at, amount: Number(order.total), details: [{ label: 'Order barcode', value: order.order_code ?? '' }, { label: 'Order number', value: order.order_number }] });
    }
  }
  return results;
}
