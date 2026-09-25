import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getBranchContext } from '@/lib/branches/context';
import { authorizedOrderBranch } from '@/lib/branches/order-access';
import { receiptAppearance, type ReceiptContext } from './receipt-model';
// Call only after the caller has resolved/authorized its business server-side.
export async function loadReceiptContext(businessId:string, name:string, orderId?:string): Promise<ReceiptContext> {
 const context=await getBranchContext();
 if(context.business.id!==businessId)throw new Error('Business changed. Reload this page.');
 const branchId=orderId?await authorizedOrderBranch(businessId,orderId):context.branchId;
 if(!branchId)throw new Error('Order is unavailable in this branch.');
 const [settings,store,branch]=await Promise.all([
  supabaseAdmin.from('branch_receipt_settings').select('*').eq('business_id',businessId).eq('location_id',branchId).maybeSingle(),
  supabaseAdmin.from('business_storefronts').select('display_name,logo_url,phone,address').eq('business_id',businessId).maybeSingle(),
  supabaseAdmin.from('business_locations').select('address,phone').eq('business_id',businessId).eq('id',branchId).maybeSingle(),
 ]);
 if(settings.error || store.error || branch.error) throw new Error('Receipt settings could not be loaded. Please retry.');
 return {branchId,appearance:receiptAppearance(settings.data,store.data?.logo_url),store:{name:store.data?.display_name || name,phone:branch.data?.phone || store.data?.phone || '',address:branch.data?.address || store.data?.address || ''}};
}
