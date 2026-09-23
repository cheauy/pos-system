"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/require-permission";
import { assertOperatingBranch } from "@/lib/branches/context";
import { createClient } from "@/lib/supabase/server";

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
  const { error } = await db.rpc('tenh_create_packed_bundle', {
    p_business_id: business.id, p_branch_id: branchId, p_request_id: read(form, 'requestId'),
    p_input: { name: read(form, 'name'), sku: read(form, 'sku'), sellingPrice: read(form, 'sellingPrice'), categoryId: read(form, 'categoryId'), description: read(form, 'description'), items },
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
