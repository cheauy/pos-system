import { requirePermission } from '@/lib/auth/require-permission';
import { businessHasPermission } from '@/lib/auth/effective-permissions';
import { getBranchContext } from '@/lib/branches/context';
import { createClient } from '@/lib/supabase/server';
import BundleItemsClient from './bundle-items-client';

// Supabase caps each response. Read every page so the component picker is complete.
async function rows<T>(query: { range(from: number, to: number): PromiseLike<{ data: T[] | null; error: { message: string } | null }> }): Promise<T[]> {
  const output: T[] = [];
  for (let start = 0; start < 50000; start += 1000) {
    const result = await query.range(start, start + 999);
    if (result.error) throw new Error('Unable to load bundle items. ' + result.error.message);
    output.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 1000) return output;
  }
  throw new Error('This catalogue is too large to load. Contact support.');
}

export default async function BundleItemsPage() {
  const business = await requirePermission('products.view');
  const { branchId, branches } = await getBranchContext();
  const db = await createClient();
  const [products, stock, items, categories, groups, options, canCreate, canPack, canEdit, canDelete] = await Promise.all([
    rows(db.from('products').select('id,name,sku,description,category_id,image_url,variant_image_url,size,color,product_type,bundle_stock_mode,cost_price,selling_price,is_active,is_online,is_pos,updated_at').eq('business_id', business.id).order('id')),
    rows(db.from('product_location_stock').select('product_id,quantity').eq('business_id', business.id).eq('location_id', branchId).order('product_id')),
    rows(db.from('bundle_items').select('id,bundle_product_id,component_product_id,quantity,selected_options').eq('business_id', business.id).order('id')),
    rows(db.from('categories').select('id,name,branch_ids').eq('business_id', business.id).order('id')),
    rows(db.from('product_option_groups').select('id,product_id,name,selection_type,is_required,min_selections,max_selections').eq('business_id', business.id).order('id')),
    rows(db.from('product_options').select('id,product_id,group_id,name,is_default,price_adjustment').eq('business_id', business.id).eq('is_active', true).order('id')),
    businessHasPermission(business, 'products.create'),
    businessHasPermission(business, 'products.stock_adjust'),
    businessHasPermission(business, 'products.update'),
    businessHasPermission(business, 'products.disable'),
  ]);
  const quantities = new Map(stock.map(row => [row.product_id, Number(row.quantity)]));
  const byId = new Map(products.map(product => [product.id, product]));
  const componentProducts = products.filter(product => product.product_type !== 'bundle' && product.is_active && quantities.has(product.id)).map(product => ({
    ...product, cost_price: Number(product.cost_price), selling_price: Number(product.selling_price), stock_quantity: quantities.get(product.id) ?? 0,
    imageUrl: product.variant_image_url || product.image_url, categoryId: product.category_id, categoryName: categories.find(category => category.id === product.category_id)?.name ?? 'Uncategorized', businessStock: quantities.get(product.id) ?? 0,
    groups: product.product_type === 'configurable' ? groups.filter(group => group.product_id === product.id) : [],
    options: product.product_type === 'configurable' ? options.filter(option => option.product_id === product.id) : [],
  })).sort((a, b) => a.name.localeCompare(b.name));
  const bundles = products.filter(product => product.product_type === 'bundle').map(product => {
    const components = items.filter(item => item.bundle_product_id === product.id).map(item => {
      const component = byId.get(item.component_product_id);
      const selected = Array.isArray(item.selected_options) ? item.selected_options as { name: string }[] : [];
      return { id: item.component_product_id, name: component ? [component.name, component.color, component.size].filter(Boolean).join(' / ') : 'Unavailable product', imageUrl: component?.variant_image_url || component?.image_url || null, sku: component?.sku ?? null, quantity: item.quantity, options: selected.map(option => option.name).join(', '), available: component?.is_active ? quantities.get(item.component_product_id) ?? 0 : 0 };
    });
    return { id: product.id, name: product.name, sku: product.sku, description: product.description, categoryId: product.category_id, imageUrl: product.image_url, updatedAt: product.updated_at, online: product.is_online, pos: product.is_pos, price: Number(product.selling_price), cost: Number(product.cost_price), active: product.is_active, packed: product.bundle_stock_mode === 'packed', stock: quantities.get(product.id) ?? 0, capacity: components.length >= 2 ? Math.max(0, Math.min(...components.map(item => Math.floor(item.available / item.quantity)))) : 0, components };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return <BundleItemsClient key={branchId} branchId={branchId} branchName={branches.find(branch => branch.id === branchId)?.name ?? 'Choose a branch'} bundles={bundles} products={componentProducts} categories={categories.filter(category => !category.branch_ids || category.branch_ids.includes(branchId))} canCreate={canCreate} canPack={canPack} canEdit={canEdit} canDelete={canDelete} />;
}
