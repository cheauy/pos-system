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
  if (error) return { success: false, message: error.code === '23503' ? 'This bundle is used by other records. Hide it instead to keep your history safe.' : error.code === '23505' ? 'This SKU is already in use.' : error.message };
  refreshBundles(); revalidatePath(`/_sites/${business.slug}`);
  return { success: true, message: input.action === 'delete' ? 'Bundle deleted.' : 'Bundle updated.' };
}

export async function createBundleProduct(_state: CreateBundleState, form: FormData): Promise<CreateBundleState> {
  const business = await requirePermission('products.create');
  const branchId = read(form, 'branchId');
  try { await assertOperatingBranch(branchId); } catch { return { success: false, message: 'Your branch changed. Reload before creating the bundle.' }; }
  let items: unknown;
  try { items = JSON.parse(read(form, 'items')); } catch { return { success: false, message: 'Choose the included products again.' }; }
  const db = await createClient();
  const upload = await uploadBundleImage(db, business.id, form);
  if (upload.error) return { success: false, message: upload.error };
  const imageData = upload.imageData;
  const { error } = await db.rpc(imageData ? 'tenh_create_packed_bundle_with_image' : 'tenh_create_packed_bundle', {
    p_business_id: business.id, p_branch_id: branchId, p_request_id: read(form, 'requestId'),
    p_input: { name: read(form, 'name'), sku: read(form, 'sku'), sellingPrice: read(form, 'sellingPrice'), categoryId: read(form, 'categoryId'), description: read(form, 'description'), items, ...imageData },
  });
  if (error) return { success: false, message: error.code === '23505' ? 'This SKU is already in use.' : error.message };
  refreshBundles();
  return { success: true, message: 'Bundle created. Pack sets to make them available for sale.' };
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

async function uploadBundleImage(db: Awaited<ReturnType<typeof createClient>>, businessId: string, form: FormData): Promise<{ imageData?: { imageUrl: string; imagePath: string }; error?: string }> {
  let image = form.get('image');
  let imageData: { imageUrl: string; imagePath: string } | undefined;
  if (image instanceof File && image.size > 0) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(image.type) || image.size > 5 * 1024 * 1024) return { error: 'Choose a JPG, PNG or WebP image up to 5 MB.' };
    try { image = await compressPhoto(image); } catch { return { error: 'Could not read this photo. Choose another JPG, PNG or WebP image.' }; }
    const bytes = Buffer.from(await image.arrayBuffer());
    const valid = image.type === 'image/jpeg' ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) : image.type === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!valid) return { error: 'This file is not a valid JPG, PNG or WebP image.' };
    const { data: { user } } = await db.auth.getUser();
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
  const { data: bundle, error: lookupError } = await db.from('branch_products').select('id,updated_at').eq('business_id', business.id).eq('id', read(form, 'bundleId')).eq('product_type', 'bundle').maybeSingle();
  if (lookupError || !bundle) return { success: false, message: 'Bundle not found. Refresh and try again.' };
  if (bundle.updated_at !== (read(form, 'expected') || null)) return { success: false, message: 'This bundle changed. Close and reopen Edit before saving.' };
  const upload = await uploadBundleImage(db, business.id, form);
  if (upload.error) return { success: false, message: upload.error };
  const { error } = await db.rpc('tenh_manage_bundle', {
    p_business_id: business.id, p_branch_id: branchId, p_bundle_id: bundle.id, p_action: 'edit', p_expected: bundle.updated_at,
    p_input: { name: read(form, 'name'), sku: read(form, 'sku'), price: read(form, 'sellingPrice'), categoryId: read(form, 'categoryId'), description: read(form, 'description'), items, removeImage: read(form, 'removeImage') === 'true', ...upload.imageData },
  });
  if (error) return { success: false, message: error.code === '23505' ? 'This SKU is already in use.' : error.message };
  refreshBundles(); revalidatePath(`/_sites/${business.slug}`);
  return { success: true, message: 'Bundle updated.' };
}
