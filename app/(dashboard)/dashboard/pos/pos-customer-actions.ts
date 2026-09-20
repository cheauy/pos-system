'use server';

import { revalidatePath } from 'next/cache';
import { getBranchContext, assertOperatingBranch } from '@/lib/branches/context';
import { isConfirmedRollback } from '@/lib/operations/rpc-outcome';
import { requirePermission } from '@/lib/auth/require-permission';
import { hasPermission } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/branch-server';
import { customerInputIssue } from './pos-customer-helpers';
import type { CustomerInput, CustomerPage, PickerCustomer } from './pos-customer-helpers';
import type { ActionResult } from './pos-workspace-types';

function failure(error: unknown): { message: string; uncertain: boolean } {
  const e=error as {code?: string; message?:string} | null;
  if (['42883','42P01','42703','PGRST202','PGRST204'].includes(e?.code || '')) return {
    message:'Customer database functions are unavailable. Verify the migration history and keep any pending customer request ID.', uncertain:true
  };
  // Constraint/validation rollbacks are definite. Schema/auth/transport failures
  // keep pending request IDs because an earlier attempt may already have committed.
  const knownRollback = isConfirmedRollback(error);
  return { message:knownRollback ? e?.message || 'Customer could not be saved.' : 'The result could not be confirmed. Retry the same customer request; do not add another copy.', uncertain:!knownRollback };
}

async function customerFields(businessId:string) {
  const db=await createClient();
  const {data,error}=await db.from('business_customer_settings').select('email_enabled,birthday_enabled').eq('business_id',businessId).maybeSingle();
  if(error) throw new Error('Customer field settings could not be loaded. Please retry.');
  return {emailEnabled:data?.email_enabled ?? true,birthdayEnabled:data?.birthday_enabled ?? true};
}

export async function fetchPosCustomers(businessId: string, search: string, offset=0, expectedBranchId?: string): Promise<ActionResult<CustomerPage>> {
  const business=await requirePermission('pos.access');
  if(business.id!==businessId) return {success:false,message:'Your active business changed. Reload POS.'};
  if(typeof search!=='string' || search.length>120 || !Number.isSafeInteger(offset) || offset<0 || offset>1000000) return {success:false,message:'Invalid customer search.'};
  try {
    const context = await getBranchContext();
    if (context.business.id !== business.id || (expectedBranchId !== undefined && expectedBranchId !== context.branchId)) {
      return {success:false,message:'The operating branch changed. Reload POS before selecting a customer.'};
    }
    const db=await createClient();
    let query=db.from('customers').select('id,name,phone,address,loyalty_points,created_at').eq('business_id',business.id).eq('location_id',context.branchId).order('created_at',{ascending:false,nullsFirst:false}).order('id',{ascending:false}).range(offset,offset+30);
    const term=search.trim().replace(/[,%_()\\"]/g,' ').trim();
    if(term) query=query.or(`name.ilike.%${term}%,phone.ilike.%${term}%`);
    const {data,error}=await query;
    if(error) return {success:false,message:failure(error).message};
    const fieldSettings=await customerFields(business.id);
    return {success:true,data:{items:(data ?? []).slice(0,30),hasMore:(data?.length ?? 0)>30,nextOffset:offset+30,canCreate:hasPermission(business.role,'customers.create'),fieldSettings} as CustomerPage};
  } catch(error) {return {success:false,message:failure(error).message};}
}

export async function createPosCustomer(businessId: string, input: CustomerInput): Promise<ActionResult<PickerCustomer>> {
  const business=await requirePermission('pos.access');
  if(business.id!==businessId) return {success:false,uncertain:true,message:'Your active business changed. Keep this customer request and reopen the original business.'};
  if(!hasPermission(business.role,'customers.create')) return {success:false,uncertain:true,message:'You do not have permission to create customers. Keep the pending request and ask an owner to verify its outcome.'};
  try {
    if (!input?.branchId) return {success:false,uncertain:true,message:'A confirmed branch is required for this customer request. Check the original customer save before starting another.'};
    try { await assertOperatingBranch(input.branchId); }
    catch { return {success:false,uncertain:true,message:'The operating branch changed. Check this customer request in its original branch before retrying.'}; }
    const fields=await customerFields(business.id);
    const invalid=customerInputIssue(input,fields);
    if(invalid)return {success:false,message:invalid};
    const db=await createClient();
    const {data,error}=await db.rpc('tenh_pos_customer_create',{
      p_business_id:business.id,p_id:input.id,
      p_input:{name:input.name.trim(),phone:input.phone.trim(),address:input.address.trim(),email:fields.emailEnabled?(input.email || '').trim():'',birthday:fields.birthdayEnabled?(input.birthday || ''):''}
    });
    if(error)return {success:false,...failure(error)};
    if(!data || data.id!==input.id || typeof data.name!=='string') return {success:false,uncertain:true,message:'The customer result could not be confirmed. Retry this same request.'};
    const saved=await db.from('customers').select('id').eq('business_id',business.id).eq('id',data.id).single();
    if(saved.error || !saved.data) return {success:false,uncertain:true,message:'The customer save succeeded but its branch view could not be confirmed. Keep this request ID and check Customers before creating another.'};
    // Customer is already committed; cache-refresh failure must not invite duplication.
    try {revalidatePath('/dashboard/customers');revalidatePath('/dashboard/pos');} catch { /* Next directory fetch reads the committed row. */ }
    return {success:true,data:data as PickerCustomer};
  } catch(error){return {success:false,...failure(error)};}
}
