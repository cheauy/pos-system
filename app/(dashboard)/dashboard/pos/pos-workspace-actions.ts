'use server';
import { getBranchContext, assertOperatingBranch } from '@/lib/branches/context';
import { assertBranchOperation } from '@/lib/subscriptions/branch-limits';

import { revalidatePath } from 'next/cache';
import { isConfirmedRollback } from '@/lib/operations/rpc-outcome';
import { requirePermission } from '@/lib/auth/require-permission';
import { createClient } from '@/lib/supabase/branch-server';
import { uuid, validateCheckout } from './pos-workspace-helpers';
import { loadReceiptContext } from '@/lib/receipts/load-receipt-context';
import type { ActionResult, CartDraft, CheckoutInput, SaleReceipt, Workspace } from './pos-workspace-types';

function errorMessage(error: unknown): string {
  if (/tenh_pos_checkout_registered/.test(String((error as {message?:string})?.message))) return "Apply 20260921090000_register_pos_accounting.sql before checkout. Register accounting is not ready.";
  const e = error as { code?: string; message?: string } | null;
  if (e?.code === '23502' && /owner_id/.test(e.message || '') && /order_items/.test(e.message || '')) {
    return 'Checkout needs the order-item ownership repair. Apply 20260919_pos_order_item_owner_repair.sql, then refresh POS and review the sale again.';
  }
  if (['42883', '42703', 'PGRST202', 'PGRST204', '42P01'].includes(e?.code ?? '')) {
    return 'The POS workspace migration is missing. Run the original POS migration, then 20260919_pos_stock_variants_continue_checkout.sql, and refresh this page.';
  }
  return e?.message || 'The request could not be completed. Please refresh and try again.';
}
function activeBusinessError(): ActionResult<never> {
  return { success: false, uncertain: true, message: 'The active business changed in another tab. Reload POS before continuing.' };
}
function refreshRoutes(): void {
  // The transaction is already committed. Cache revalidation must never turn a
  // successful sale into an apparent failure and invite a duplicate payment.
  try { for (const path of ['/dashboard/pos', '/dashboard/orders', '/dashboard/products', '/dashboard/register', '/dashboard/customers']) revalidatePath(path); }
  catch (error) { console.error('POS post-commit refresh failed', error); }
}
export async function loadPosWorkspace(expectedBusinessId?: string, expectedBranchId?: string): Promise<ActionResult<Workspace>> {
  const business = await requirePermission('pos.access');
  if (expectedBusinessId && expectedBusinessId !== business.id) return activeBusinessError();
  try {
    const { branchId, business: operatingBusiness } = await getBranchContext();
    if (operatingBusiness.id !== business.id) return activeBusinessError();
    if (expectedBranchId !== undefined && (!uuid(expectedBranchId) || expectedBranchId !== branchId)) {
      return { success: false, message: 'The operating branch changed in another tab. Copy your unsaved cart details before reloading; no sale has been submitted.' };
    }
    const db = await createClient();
    const { data, error } = await db.rpc('tenh_pos_catalog', { p_business_id: business.id });
    if (error) return { success: false, message: errorMessage(error) };
    if (!data || data.businessId !== business.id || !Array.isArray(data.products)) return { success: false, message: 'The POS catalog returned incomplete data. Please refresh.' };
    if (data.inventoryVersion !== 2) return { success:false,message:'Apply 20260919_pos_stock_variants_continue_checkout.sql in Supabase before using this POS update.' };
    const ready = await db.rpc('tenh_pos_receipt_update_ready', { p_business_id: business.id });
    if (ready.error || ready.data !== true) return { success: false, message: 'Apply 20260919_pos_receipt_customer_delivery_update.sql, then refresh POS. This prevents using the old delivery status logic.' };
    const [customers, categories, openShifts] = await Promise.all([
      db.from('customers').select('id,name,phone,address,loyalty_points').eq('business_id',business.id).order('name'),
      db.from('categories').select('id,name,branch_ids').eq('business_id',business.id),
      // The drawer belongs to the operating branch, not whichever branch this
      // cashier last opened. Another authorized cashier may have opened it.
      db.from('cash_register_shifts').select('id,location_id').eq('business_id',business.id)
        .eq('location_id',branchId).eq('status','open').limit(2),
    ]);
    if(customers.error || categories.error || openShifts.error) throw new Error('Unable to load branch customers, categories or register.');
    if ((openShifts.data?.length ?? 0) > 1) throw new Error('This branch has multiple open registers. Review them before checkout; do not delete cash history.');
    data.shift = openShifts.data?.[0] ?? null;
    data.defaultBranchId = branchId;
    data.customers = customers.data;
    data.holds = (data.holds ?? []).filter((h: {draft: CartDraft}) => h.draft.branchId === branchId);
    data.categories = (categories.data ?? []).filter(c => c.branch_ids === null || c.branch_ids.includes(branchId));
    const visibleCategories = new Set(data.categories.map((c: {id:string}) => c.id));
    const assigned = new Set((data.stock ?? []).filter((s: {location_id:string}) => s.location_id === branchId).map((s: {product_id:string}) => s.product_id));
    data.products = data.products.filter((p: {id:string;category_id:string|null}) => assigned.has(p.id) && (!p.category_id || visibleCategories.has(p.category_id)));
    const receiptContext = await loadReceiptContext(business.id, business.name);
    return { success: true, data: { ...data, receiptContext } as Workspace };
  } catch (error) { return { success: false, message: errorMessage(error) }; }
}
export async function completePosSale(businessId: string, input: CheckoutInput): Promise<ActionResult<SaleReceipt>> {
  const business = await requirePermission('pos.access');
  if (business.id !== businessId) return activeBusinessError();
  const invalid = validateCheckout(input);
  if (invalid) return { success: false, uncertain: true, message: invalid };
  try { await assertOperatingBranch(input.branchId); await assertBranchOperation(business.id, input.branchId); } catch (error) { return { success: false, uncertain: true, message: `${errorMessage(error)} Keep this sale request and use Check sale before starting another.` }; }
  const db = await createClient();
  // Deliberately do not catch transport failures here. The client keeps the exact
  // idempotent request in recovery mode until the server confirms its outcome.
  const { data, error } = await db.rpc('tenh_pos_checkout_registered', { p_business_id: business.id, p_input: input });
  if (error) {
    // Never label a gateway/connection failure as a rollback. Preserve the exact
    // pending request so Check sale / Retry same sale cannot create a second sale.
    return { success: false, uncertain: !isConfirmedRollback(error) || /already used with different data/i.test(error.message), message: errorMessage(error) };
  }
  if (!data?.orderId) throw new Error('Checkout result not confirmed. Check the sale before retrying.');
  refreshRoutes();
  return { success: true, data: data as SaleReceipt };
}
export async function checkPosSale(businessId: string, requestId: string): Promise<ActionResult<SaleReceipt | null>> {
  const business = await requirePermission('pos.access');
  if (business.id !== businessId) return activeBusinessError();
  if (!uuid(requestId)) return { success: false, message: 'Invalid sale request.' };
  try {
    const db = await createClient();
    const { data, error } = await db.rpc('tenh_pos_checkout_status', { p_business_id: business.id, p_request_id: requestId });
    return error ? { success: false, message: errorMessage(error) } : { success: true, data: data as SaleReceipt | null };
  } catch (error) { return { success: false, message: errorMessage(error) }; }
}
export async function savePosHold(businessId: string, id: string, version: number | null, label: string, draft: CartDraft): Promise<ActionResult<{ id: string }>> {
  const business = await requirePermission('pos.access');
  if (business.id !== businessId) return activeBusinessError();
  if (!uuid(id) || !draft || !uuid(draft.branchId) || !Array.isArray(draft.lines) || draft.lines.length < 1 || draft.lines.length > 100 || typeof label !== 'string' || !label.trim() || label.trim().length > 80 || (version !== null && (!Number.isInteger(version) || version < 1))) {
    return { success: false, message: 'Enter a hold label and add 1–100 items.' };
  }
  try {
    const db = await createClient();
    await assertOperatingBranch(draft.branchId);
    await assertBranchOperation(business.id, draft.branchId);
    const { data, error } = await db.rpc('tenh_pos_hold', { p_business_id: business.id, p_action: 'save', p_id: id, p_version: version, p_label: label.trim(), p_draft: draft });
    return error ? { success: false, message: errorMessage(error) } : { success: true, data };
  } catch (error) { return { success: false, message: errorMessage(error) }; }
}
export async function deletePosHold(businessId: string, id: string, version: number): Promise<ActionResult<{ id: string }>> {
  const business = await requirePermission('pos.access');
  if (business.id !== businessId) return activeBusinessError();
  if (!uuid(id) || !Number.isInteger(version) || version < 1) return { success: false, message: 'Invalid held order.' };
  try {
    const db = await createClient();
    const { data, error } = await db.rpc('tenh_pos_hold', { p_business_id: business.id, p_action: 'delete', p_id: id, p_version: version, p_label: '', p_draft: {} });
    return error ? { success: false, message: errorMessage(error) } : { success: true, data };
  } catch (error) { return { success: false, message: errorMessage(error) }; }
}
export async function savePosSettings(businessId: string, taxRate: number, pointValue: number): Promise<ActionResult<null>> {
  const business = await requirePermission('pos.access');
  if (business.id !== businessId) return activeBusinessError();
  if (business.role !== 'owner') return { success: false, message: 'Only the owner can change POS rates.' };
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100 || !Number.isFinite(pointValue) || pointValue < 0 || pointValue > 1000000) return { success: false, message: 'Enter a tax rate from 0 to 100 and a valid point value.' };
  try {
    const db = await createClient();
    const { error } = await db.rpc('tenh_pos_settings', { p_business_id: business.id, p_tax_rate: taxRate, p_point_value: pointValue });
    if (error) return { success: false, message: errorMessage(error) };
    refreshRoutes();
    return { success: true, data: null };
  } catch (error) { return { success: false, message: errorMessage(error) }; }
}

// Owner-confirmed allocation of existing unassigned inventory only. Never raises
// global stock or silently borrows stock from a different branch.
export async function allocatePosStock(businessId: string, branchId: string, allocations: Array<{ productId: string; quantity: number }>): Promise<ActionResult<null>> {
  const business = await requirePermission('pos.access');
  if (business.id !== businessId) return activeBusinessError();
  if (business.role !== 'owner') return {success:false,message:'Only the owner can assign unallocated stock.'};
  if (!uuid(branchId) || !Array.isArray(allocations) || !allocations.length || allocations.length > 100 || allocations.some(row => !row || !uuid(row.productId) || !Number.isSafeInteger(row.quantity) || row.quantity <= 0) || new Set(allocations.map(row => row.productId)).size !== allocations.length) return {success:false,message:'Review the branch and stock quantities again.'};
  try {
    const db = await createClient();
    await assertOperatingBranch(branchId);
    await assertBranchOperation(business.id, branchId);
    const {error} = await db.rpc('tenh_pos_allocate_stock', {p_business_id:business.id,p_location_id:branchId,p_allocations:allocations});
    if (error) return {success:false,message:errorMessage(error)};
    refreshRoutes(); return {success:true,data:null};
  } catch (error) {return {success:false,message:errorMessage(error)};}
}

export async function savePosCurrencySettings(businessId: string, enabled: boolean, rate: number): Promise<ActionResult<null>> {
  const business = await requirePermission('pos.access');
  if (business.id !== businessId) return activeBusinessError();
  if (business.role !== 'owner') return {success:false,message:'Only the owner can change POS currency settings.'};
  if (typeof enabled !== 'boolean' || !Number.isFinite(rate) || rate < 1 || rate > 1000000 || Math.abs(rate*10000-Math.round(rate*10000)) > 0.00001) return {success:false,message:'Enter a rate from 1 to 1,000,000 with up to 4 decimal places.'};
  try {
    const db=await createClient();
    const {error}=await db.rpc('tenh_pos_currency_settings',{p_business_id:business.id,p_enabled:enabled,p_rate:rate});
    if(error)return {success:false,message:['42883','42703','PGRST202','PGRST204'].includes(error.code)?'Run 20260919_pos_customer_delivery_currency.sql first.':errorMessage(error)};
    refreshRoutes();
    try {revalidatePath('/dashboard/settings/pos-currency');} catch { /* Saved already. */ }
    return {success:true,data:null};
  } catch(error){return {success:false,message:errorMessage(error)};}
}
