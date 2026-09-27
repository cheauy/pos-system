import type { SupabaseClient } from '@supabase/supabase-js';

type Photo = { image_url: string | null; variant_image_url: string | null };
type Item = { id: string; product_id: string | null; product_name: string | null; products: Photo | Photo[] | null };
export type OrderPhoto = { id: string; name: string; imageUrl: string | null; fallbackImageUrl: string | null };

// Only enrich the already-authorized page. Never query all orders or use the admin client.
export async function loadMobileOrderPhotos(db: SupabaseClient, businessId: string, branchId: string, orderIds: string[]) {
  const photos = new Map<string, OrderPhoto[]>();
  if (!orderIds.length) return photos;
  const result = await db.from('orders')
    .select('id,order_items(id,product_id,product_name,products(image_url,variant_image_url))')
    .eq('business_id', businessId).eq('location_id', branchId).in('id', orderIds)
    .order('id', { referencedTable: 'order_items' }).limit(3, { referencedTable: 'order_items' });
  if (result.error) throw new Error('Order photos could not be loaded.');
  const orders = (result.data || []) as unknown as { id: string; order_items: Item[] }[];
  const productIds = [...new Set(orders.flatMap(order => order.order_items.map(item => item.product_id).filter((id): id is string => !!id)))];
  const branch = productIds.length ? await db.from('branch_products').select('id,image_url,variant_image_url').eq('business_id', businessId).in('id', productIds) : { data: [], error: null };
  if (branch.error) throw new Error('Branch product photos could not be loaded.');
  const products = new Map((branch.data || []).map(product => [product.id, product as Photo]));
  for (const order of orders) photos.set(order.id, order.order_items.map(item => {
    const saved = Array.isArray(item.products) ? item.products[0] : item.products;
    const product = item.product_id ? products.get(item.product_id) || saved : saved;
    return { id: item.id, name: item.product_name || 'Product', imageUrl: product?.variant_image_url || product?.image_url || null, fallbackImageUrl: product?.image_url || null };
  }));
  return photos;
}
