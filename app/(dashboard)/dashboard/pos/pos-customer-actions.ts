'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/require-permission';
import { hasPermission } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';
import { customerInputIssue } from './pos-customer-helpers';
import type { CustomerInput, CustomerPage, PickerCustomer } from './pos-customer-helpers';
import type { ActionResult } from './pos-workspace-types';

function failure(error: unknown): { message: string; uncertain: boolean } {
  const e=error as {code?: string; message?:string} | null;
  if (['42883','42P01','42703','PGRST202','PGRST204'].includes(e?.code || '')) return {
    message:'Apply 20260919_pos_customer_picker.sql, then reopen Select Customer.', uncertain:false
  };
  // PostgreSQL errors confirm a rollback; a gateway/network failure does not.
  const knownRollback = typeof e?.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code) && !e.code.startsWith('PGRST') && !e.code.startsWith('08');
  return { message:knownRollback ? e?.message || 'Customer could not be saved.' : 'The result could not be confirmed. Retry the same customer request; do not add another copy.', uncertain:!knownRollback };
}

async function customerFields(businessId:string) {
  const db=await createClient();
  const {data,error}=await db.from('business_customer_settings').select('email_enabled,birthday_enabled').eq('business_id',businessId).maybeSingle();
  if(error) throw new Error('Customer field settings could not be loaded. Please retry.');
  return {emailEnabled:data?.email_enabled ?? true,birthdayEnabled:data?.birthday_enabled ?? true};
}

export async function fetchPosCustomers(businessId: string, search: string, offset=0): Promise<ActionResult<CustomerPage>> {
  const business=await requirePermission('pos.access');
  if(business.id!==businessId) return {success:false,message:'Your active business changed. Reload POS.'};
  if(typeof search!=='string' || search.length>120 || !Number.isSafeInteger(offset) || offset<0 || offset>1000000) return {success:false,message:'Invalid customer search.'};
  try {
    const db=await createClient();
    const {data,error}=await db.rpc('tenh_pos_customer_list',{p_business_id:business.id,p_search:search.trim(),p_offset:offset});
    if(error) return {success:false,message:failure(error).message};
    if(!data || !Array.isArray(data.items) || typeof data.hasMore!=='boolean' || !Number.isInteger(data.nextOffset)) return {success:false,message:'The customer list returned incomplete data. Please retry.'};
    const fieldSettings=await customerFields(business.id);
    return {success:true,data:{...data,fieldSettings} as CustomerPage};
  } catch(error) {return {success:false,message:failure(error).message};}
}

export async function createPosCustomer(businessId: string, input: CustomerInput): Promise<ActionResult<PickerCustomer>> {
  const business=await requirePermission('pos.access');
  if(business.id!==businessId) return {success:false,message:'Your active business changed. Reload POS.'};
  if(!hasPermission(business.role,'customers.create')) return {success:false,message:'You do not have permission to create customers.'};
  try {
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
    // Customer is already committed; cache-refresh failure must not invite duplication.
    try {revalidatePath('/dashboard/customers');revalidatePath('/dashboard/pos');} catch { /* Next directory fetch reads the committed row. */ }
    return {success:true,data:data as PickerCustomer};
  } catch(error){return {success:false,...failure(error)};}
}
