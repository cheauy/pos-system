import { mobileProductPage } from './product-page';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { compressPhoto } from '@/lib/images/compress-photo';
import { PUBLIC_PHOTO_CACHE_SECONDS } from '@/lib/public-photo-cache';
import { revalidatePath } from 'next/cache';

export const managementAccess = {
  catalog: 'products.view', 'catalog-detail': 'products.view', 'catalog-options': 'products.view',
  'product-create': 'products.create', 'product-edit': 'products.update',
  'bundle-create': 'products.create', 'bundle-edit': 'products.update', 'bundle-pack': 'products.stock_adjust', 'bundle-toggle': 'products.update',
  'bundle-delete': 'products.disable',
  'purchase-create': 'purchases.create', 'transfer-save': 'transfers.manage',
  'draft-options': 'purchases.create', 'purchase-products': 'purchases.create', 'transfer-products': 'transfers.manage',
  storefront: 'storefront.view', 'storefront-save': 'storefront.update', 'category-products':'categories.manage',
} as const;
const id = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function data<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  if(result.data==null) throw new Error('Record not found. Reload before continuing.');
  return result.data;
}
const fields='id,variant_group_id,name,sku,barcode,description,category_id,image_url,variant_image_url,cost_price,selling_price,low_stock_quantity,stock_quantity,product_type,size,color,is_pos,is_online,is_active,updated_at';
const listFields='id,variant_group_id,name,sku,image_url,variant_image_url,cost_price,selling_price,stock_quantity,product_type,size,color,is_pos,is_online,is_active';
export async function managementRead(db: SupabaseClient, feature: string, businessId: string, branchId: string, url: URL) {
  if(feature==='category-products') {
    const category=url.searchParams.get('category');
    if(!id(category))throw new Error('Select a category.');
    data(await db.from('categories').select('id').eq('business_id',businessId).eq('id',category).or(`branch_ids.is.null,branch_ids.cs.{${branchId}}`).single());
    const page=Math.max(1,Math.min(10000,Number(url.searchParams.get('page'))||1));
    return mobileProductPage(db,businessId,'id,variant_group_id,name,sku,size,color,image_url,variant_image_url,stock_quantity',page,{term:'',category,pageSize:15});
  }
  if (feature==='storefront') {
    const result=await db.from('business_storefronts').select('display_name,description,phone,address,is_published,accept_online_orders,updated_at').eq('business_id',businessId).maybeSingle();
    if(result.error)throw new Error(result.error.message);
    return result.data?{...result.data,configured:true}:{configured:false};
  }
  if (feature==='catalog-options') {
    const [categoryResult,businessResult]=await Promise.all([
      db.from('categories').select('id,name').eq('business_id',businessId).or(`branch_ids.is.null,branch_ids.cs.{${branchId}}`).order('name').limit(501),
      db.from('businesses').select('product_mode').eq('id',businessId).single(),
    ]);
    const categories=data(categoryResult);
    if(categories.length>500) throw new Error('Too many categories. Manage categories on the website.');
    const business=data(businessResult);
    return {categories,mode:business.product_mode};
  }
  if (feature==='draft-options') {
    const suppliers=data(await db.from('suppliers').select('id,name').eq('business_id',businessId).eq('location_id',branchId).eq('is_active',true).order('name').limit(501));
    if(suppliers.length>500) throw new Error('Too many suppliers. Create this purchase on the website.');
    return {suppliers};
  }
  if (feature==='catalog-detail') {
    const productId=url.searchParams.get('id'); if(!id(productId)) throw new Error('Choose a product.');
    const product=data(await db.from('branch_products').select(fields).eq('business_id',businessId).eq('id',productId).single());
    const items=product.product_type==='bundle' ? data(await db.from('branch_bundle_items').select('component_product_id,quantity,selected_options').eq('business_id',businessId).eq('bundle_product_id',productId).limit(101)) : [];
    if(items.length>100) throw new Error('Open this large bundle on the website.');
    const groups=product.product_type==='configurable'?data(await db.from('product_option_groups').select('id,name,selection_type,is_required,min_selections,max_selections').eq('business_id',businessId).eq('product_id',productId).order('sort_order').limit(31)):[];
    const options=product.product_type==='configurable'?data(await db.from('product_options').select('id,group_id,name,price_adjustment').eq('business_id',businessId).eq('product_id',productId).eq('is_active',true).order('sort_order').limit(501)):[];
    if(groups.length>30||options.length>500)throw new Error('Open this large product on the website.');
  const components=items.length?data(await db.from('branch_products').select('id,name,size,color').eq('business_id',businessId).in('id',items.map(i=>i.component_product_id))):[];
  return {...product,image_url:product.variant_image_url||product.image_url,items:items.map(item=>({...item,name:components.filter(p=>p.id===item.component_product_id).map(p=>[p.name,p.size,p.color].filter(Boolean).join(' · '))[0]||item.component_product_id})),groups,options};
  }
  if(['catalog','purchase-products','transfer-products'].includes(feature)) {
    const page=Number(url.searchParams.get('page')||1); if(!Number.isInteger(page)||page<1||page>10000) throw new Error('Invalid page.');
    const term=(url.searchParams.get('search')||'').slice(0,100).replace(/[^\p{L}\p{N}\s_-]/gu,'');
    if(url.searchParams.get('grouped')==='true') {
      const category=url.searchParams.get('category')||'';
      if(category&&!id(category)) throw new Error('Choose a valid category.');
      const [result,settingsResult]=await Promise.all([
        mobileProductPage(db,businessId,listFields,page,{term,pageSize:url.searchParams.get('limit')==='10'?10:15,bundles:url.searchParams.get('bundles')==='true',components:url.searchParams.get('components')==='true'||feature==='purchase-products'||feature==='transfer-products',active:url.searchParams.get('components')==='true'||feature==='purchase-products'||feature==='transfer-products',category}),
        db.from('branch_pos_settings').select('currency').eq('business_id',businessId).eq('location_id',branchId).single(),
      ]);
      const settings=data(settingsResult);
      return {...result,rows:result.rows.map(p=>({...p,image_url:p.variant_image_url||p.image_url})),currency:settings.currency};
    }
    let query=db.from('branch_products').select(listFields,{count:'exact'}).eq('business_id',businessId);
    if(term) query=query.or(`name.ilike.%${term}%,sku.ilike.%${term}%,barcode.ilike.%${term}%`);
    if(url.searchParams.get('bundles')==='true') query=query.eq('product_type','bundle');
 if(url.searchParams.get('components')==='true'||feature==='purchase-products'||feature==='transfer-products') query=query.neq('product_type','bundle').eq('is_active',true);
    const result=await query.order('name').order('id').range((page-1)*15,page*15-1);
 const settings=data(await db.from('branch_pos_settings').select('currency').eq('business_id',businessId).eq('location_id',branchId).single());
 return {rows:data(result).map(p=>({...p,image_url:p.variant_image_url||p.image_url})),total:result.count||0,currency:settings.currency};
  }
  throw new Error('Unknown management screen.');
}

export async function managementWrite(db: SupabaseClient, feature: string, businessId: string, branchId: string, userId: string, form: FormData) {
  const requestId=String(form.get('requestId')||''); if(!id(requestId)) throw new Error('Reopen the form.');
  const raw=form.get('input'); if(typeof raw!=='string'||raw.length>65536) throw new Error('Invalid form.');
  const input=JSON.parse(raw); if(!input||typeof input!=='object'||Array.isArray(input)) throw new Error('Invalid form.');
  // Uploaded image URLs are server-owned; never accept a client-supplied remote URL.
  delete input.imageUrl;
  delete input.imagePath;
  const image=form.get('image');
  if(image instanceof File && image.size) {
    if(!['product-create','product-edit','bundle-create','bundle-edit'].includes(feature)||image.size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(image.type)) throw new Error('Choose a JPG, PNG or WebP image up to 5 MB.');
    const compressed=await compressPhoto(image);
    const bytes=Buffer.from(await compressed.arrayBuffer());
    const extension=compressed.type==='image/png'?'png':compressed.type==='image/webp'?'webp':'jpg';
    const path=`${businessId}/${userId}/${requestId}-${createHash('sha256').update(bytes).digest('hex')}.${extension}`;
    const bucket=db.storage.from('product-images');
    const upload=await bucket.upload(path,bytes,{contentType:compressed.type,cacheControl:PUBLIC_PHOTO_CACHE_SECONDS,upsert:false});
    if(upload.error && String((upload.error as {statusCode?:string}).statusCode)!=='409') throw new Error('Image upload failed. Retry the same request.');
    input.imageUrl=bucket.getPublicUrl(path).data.publicUrl;
    input.imagePath=path;
  } else if(input.removeImage===true) input.imageUrl='';
  const result=await db.rpc('tenh_mobile_management',{p_business_id:businessId,p_branch_id:branchId,p_request_id:requestId,p_operation:feature,p_input:input});
  if(result.error) return {success:false,message:result.error.message,uncertain:true};
  if(!result.data) return {success:false,message:'Save not confirmed. Retry the same request.',uncertain:true};
  if(result.data.success) {
    // A committed save stays successful even if refreshing the website cache fails.
    try { for(const path of ['/dashboard/products','/dashboard/bundles','/dashboard/stock-transfers','/dashboard/purchase-orders','/dashboard/online-store','/dashboard/pos']) revalidatePath(path); }
    catch (error) { console.error('Mobile post-save refresh failed', error); }
  }
  return {...result.data,uncertain:!result.data.rolledBack&&!result.data.success};
}
