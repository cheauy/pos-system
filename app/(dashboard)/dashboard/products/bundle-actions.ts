"use server";

import { compressPhoto } from "@/lib/images/compress-photo";
import { PUBLIC_PHOTO_CACHE_SECONDS } from "@/lib/public-photo-cache";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/require-permission";
import { assertOperatingBranch } from "@/lib/branches/context";
import { createClient } from "@/lib/supabase/branch-server";
import { createHash } from 'node:crypto';

export type CreateBundleState = { success: boolean; message: string };
const read = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
function refreshBundles() {
  for (const path of ['/dashboard/bundles', '/dashboard/products', '/dashboard/inventory', '/dashboard/pos']) revalidatePath(path);
}

export async function manageBundle(input: { branchId: string; bundleId: string; action: 'edit' | 'pos' | 'online' | 'delete'; expected: string | null; values: Record<string, string | boolean> }): Promise<CreateBundleState> {
  const business = await requirePermission(input.action === 'delete' ? 'products.disable' : 'products.update');
  try { await assertOperatingBranch(input.branchId); } catch { return { success: false, message: 'Your branch changed. Reload before continuing.' }; }
  const db = await createClient();
  const { error } = await db.rpc('tenh_manage_bundle', { p_business_id: business.id, p_branch_id: input.branchId, p_bundle_id: input.bundleId, p_action: input.action, p_input: input.values, p_expected: input.expected });
  if (error && input.action === 'delete' && error.message === 'This bundle has transaction history. Turn off POS and Online visibility to keep the history safe.') {
    // Keep referenced records; retire only this branch's bundle with the same version guard.
    let query = db.from('branch_products').update({ is_active: false, is_pos: false, is_online: false, updated_at: new Date().toISOString() })
      .eq('business_id', business.id).eq('id', input.bundleId).eq('product_type', 'bundle');
    query = input.expected ? query.eq('updated_at', input.expected) : query.is('updated_at', null);
    const retired = await query.select('id').maybeSingle();
    if (retired.error || !retired.data) return { success: false, message: retired.error?.message || 'This bundle changed. Refresh and try again.' };
    refreshBundles(); revalidatePath(`/_sites/${business.slug}`);
    return { success: true, message: 'Bundle removed from the active list. POS and Online are off; transaction history is preserved.' };
  }
  if (error) return { success: false, message: error.code === '23503' ? 'This bundle is used by other records. Hide it instead to keep your history safe.' : error.code === '23505' ? 'This SKU is already in use.' : error.message };
  refreshBundles(); revalidatePath(`/_sites/${business.slug}`);
  return { success: true, message: input.action === 'delete' ? 'Bundle deleted.' : 'Bundle updated.' };
}

export async function createBundleProduct(_state: CreateBundleState, form: FormData): Promise<CreateBundleState> {
  const started = performance.now(); let previous = started; const timings: Record<string, number> = {};
  const mark = (stage: string) => { const now = performance.now(); timings[stage] = Math.round(now - previous); previous = now; };
  try {
  const branchId = read(form, 'branchId');
  const [business, branchResult] = await Promise.all([
    requirePermission('products.create'),
    assertOperatingBranch(branchId).then(context => ({ context, valid: true }), () => ({ context: undefined, valid: false })),
  ]);
  mark('permissionAndBranch');
  if (!branchResult.valid) return { success: false, message: 'Your branch changed. Reload before creating the bundle.' };
  let items: unknown;
  try { items = JSON.parse(read(form, 'items')); } catch { return { success: false, message: 'Choose the included products again.' }; }
  const db = await createClient();
  mark('databaseClient');
  const upload = await uploadBundleImage(db, business.id, form, [], branchResult.context?.userId);
  mark('photos');
  if (upload.error) return { success: false, message: upload.error };
  const imageData = upload.imageData;
  const { data: bundleId, error } = await db.rpc(imageData ? 'tenh_create_packed_bundle_with_image' : 'tenh_create_packed_bundle', {
    p_business_id: business.id, p_branch_id: branchId, p_request_id: read(form, 'requestId'),
    p_input: { name: read(form, 'name'), sku: read(form, 'sku'), sellingPrice: read(form, 'sellingPrice'), categoryId: read(form, 'categoryId'), description: read(form, 'description'), isPos: form.get('showPos') === 'on', isOnline: form.get('showOnline') === 'on', items, ...imageData },
  });
  mark('databaseCreate');
  if (error) return { success: false, message: error.code === '23505' ? 'This SKU is already in use.' : error.message };
  if (upload.galleryUrls && (!bundleId || !await saveBundleGallery(db, business.id, bundleId, upload.galleryUrls))) { refreshBundles(); return { success: true, message: 'Bundle created, but some photos could not be saved. Open Edit to add them again.' }; }
  refreshBundles();
  return { success: true, message: 'Bundle created. Pack sets to make them available for sale.' };
  } finally {
    mark('galleryAndRefresh');
    console.info('[bundle-create timing]', { ...timings, totalMs: Math.round(performance.now() - started) });
  }
}

export async function packBundle(input: { branchId: string; bundleId: string; quantity: number; requestId: string }): Promise<CreateBundleState> {
  const business = await requirePermission('products.stock_adjust');
  try { await assertOperatingBranch(input.branchId); } catch { return { success: false, message: 'Your branch changed. Reload before packing.' }; }
  const db = await createClient();
  const { error } = await db.rpc('tenh_pack_bundle', { p_business_id: business.id, p_branch_id: input.branchId, p_bundle_id: input.bundleId, p_quantity: input.quantity, p_request_id: input.requestId });
  if (error) return { success: false, message: error.message };
  refreshBundles();
  return { success: true, message: input.quantity > 0 ? 'Sets packed. Component stock has been deducted.' : 'Sets unpacked. Component stock has been restored.' };
}

async function uploadBundleImage(db: Awaited<ReturnType<typeof createClient>>, businessId: string, form: FormData, allowedUrls: string[] = [], authenticatedUserId?: string): Promise<{ imageData?: { imageUrl: string; imagePath: string }; galleryUrls?: string[]; error?: string }> {
  if (!form.has('productGallery')) return uploadSingleBundleImage(db, businessId, form, authenticatedUserId);
  let entries: { url?: string; slot?: string }[];
  try { entries = JSON.parse(read(form, 'productGallery')); } catch { return { error: 'Choose bundle photos again.' }; }
  if (!Array.isArray(entries) || entries.length > 8) return { error: 'Use up to 8 bundle photos.' };
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || (entry.url ? !allowedUrls.includes(entry.url) || Boolean(entry.slot) : !entry.slot || !/^[a-zA-Z0-9_-]{1,80}$/.test(entry.slot))) return { error: 'Choose bundle photos again.' };
    if (entry.slot) { const file = form.get(`gallery_${entry.slot}`); if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024 || !['image/jpeg','image/png','image/webp'].includes(file.type)) return { error: 'Choose JPG, PNG or WebP photos up to 5 MB each.' }; }
  }
  const totalBytes = entries.reduce((total, entry) => total + (entry.slot ? (form.get(`gallery_${entry.slot}`) as File).size : 0), 0);
  if (totalBytes > 12 * 1024 * 1024) return { error: 'Keep gallery uploads below 12 MB.' };
  const user = authenticatedUserId ? { id: authenticatedUserId } : entries.some(entry => entry.slot) ? (await db.auth.getUser()).data.user : null;
  if (entries.some(entry => entry.slot) && !user) return { error: 'Please sign in again.' };
  const urls: string[] = []; let cover: { imageUrl: string; imagePath: string } | undefined;
  // Three at a time bounds image decoding memory while overlapping storage round trips.
  for (let offset = 0; offset < entries.length; offset += 3) {
    const results = await Promise.all(entries.slice(offset, offset + 3).map(async entry => {
      if (entry.url) return { url: entry.url };
      const single = new FormData(); single.set('requestId', read(form, 'requestId')); single.set('image', form.get(`gallery_${entry.slot}`)!);
      const result = await uploadSingleBundleImage(db, businessId, single, user!.id);
      return { url: result.imageData?.imageUrl, imageData: result.imageData, error: result.error };
    }));
    for (const result of results) {
      if (result.error || !result.url) return { error: result.error || 'Could not upload bundle photo.' };
      if (!urls.length) cover = result.imageData;
      urls.push(result.url);
    }
  }
  return { imageData: cover, galleryUrls: urls };
}

async function saveBundleGallery(db: Awaited<ReturnType<typeof createClient>>, businessId: string, id: string, urls: string[]) {
  const media = { image_url: urls[0] ?? null, image_urls: urls };
  const branch = await db.from('branch_products').update(media).eq('business_id', businessId).eq('id', id);
  if (branch.error) return false;
  const shared = await db.from('products').update(media).eq('business_id', businessId).eq('id', id);
  return !shared.error;
}

async function uploadSingleBundleImage(db: Awaited<ReturnType<typeof createClient>>, businessId: string, form: FormData, authenticatedUserId?: string): Promise<{ imageData?: { imageUrl: string; imagePath: string }; error?: string }> {
  let image = form.get('image');
  let imageData: { imageUrl: string; imagePath: string } | undefined;
  if (image instanceof File && image.size > 0) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(image.type) || image.size > 5 * 1024 * 1024) return { error: 'Choose a JPG, PNG or WebP image up to 5 MB.' };
    try { image = await compressPhoto(image); } catch { return { error: 'Could not read this photo. Choose another JPG, PNG or WebP image.' }; }
    const bytes = Buffer.from(await image.arrayBuffer());
    const valid = image.type === 'image/jpeg' ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) : image.type === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!valid) return { error: 'This file is not a valid JPG, PNG or WebP image.' };
    const user = authenticatedUserId ? { id: authenticatedUserId } : (await db.auth.getUser()).data.user;
    if (!user) return { error: 'Please sign in again.' };
    const requestId = read(form, 'requestId');
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) return { error: 'Reopen New bundle and try again.' };
    const extension = image.type === 'image/jpeg' ? 'jpg' : image.type === 'image/png' ? 'png' : 'webp';
    const path = `${businessId}/${user.id}/${requestId}-${createHash('sha256').update(bytes).digest('hex')}.${extension}`;
    const bucket = db.storage.from('product-images');
    const { error: uploadError } = await bucket.upload(path, bytes, { contentType: image.type, upsert: false, cacheControl: PUBLIC_PHOTO_CACHE_SECONDS });
    if (uploadError && String((uploadError as { statusCode?: string }).statusCode) !== '409') return { error: 'Could not upload the image. Your bundle has not been created; please retry.' };
    // Keep the immutable upload on failure: a timed-out creation may have committed,
    // and an identical retry must continue using the same image.
    imageData = { imageUrl: bucket.getPublicUrl(path).data.publicUrl, imagePath: path };
  }
  return { imageData };
}

export async function editBundleProduct(form: FormData): Promise<CreateBundleState> {
  const business = await requirePermission('products.update');
  const branchId = read(form, 'branchId');
  try { await assertOperatingBranch(branchId); } catch { return { success: false, message: 'Your branch changed. Reload before editing the bundle.' }; }
  let items: unknown;
  try { items = JSON.parse(read(form, 'items')); } catch { return { success: false, message: 'Choose the included products again.' }; }
  const db = await createClient();
  const { data: bundle, error: lookupError } = await db.from('branch_products').select('id,updated_at,image_url,image_urls').eq('business_id', business.id).eq('id', read(form, 'bundleId')).eq('product_type', 'bundle').maybeSingle();
  if (lookupError || !bundle) return { success: false, message: 'Bundle not found. Refresh and try again.' };
  if (bundle.updated_at !== (read(form, 'expected') || null)) return { success: false, message: 'This bundle changed. Close and reopen Edit before saving.' };
  const upload = await uploadBundleImage(db, business.id, form, [bundle.image_url, ...(bundle.image_urls ?? [])].filter((url): url is string => Boolean(url)));
  if (upload.error) return { success: false, message: upload.error };
  const { error } = await db.rpc('tenh_manage_bundle', {
    p_business_id: business.id, p_branch_id: branchId, p_bundle_id: bundle.id, p_action: 'edit', p_expected: bundle.updated_at,
    p_input: { name: read(form, 'name'), sku: read(form, 'sku'), price: read(form, 'sellingPrice'), categoryId: read(form, 'categoryId'), description: read(form, 'description'), items, removeImage: read(form, 'removeImage') === 'true', ...upload.imageData },
  });
  if (error) return { success: false, message: error.code === '23505' ? 'This SKU is already in use.' : error.message };
  if (upload.galleryUrls && !await saveBundleGallery(db, business.id, bundle.id, upload.galleryUrls)) { refreshBundles(); return { success: true, message: 'Bundle updated, but some photos could not be saved. Reopen Edit to try again.' }; }
  refreshBundles(); revalidatePath(`/_sites/${business.slug}`);
  return { success: true, message: 'Bundle updated.' };
}
