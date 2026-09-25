import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { Promotion } from './promotions';

export async function loadEligiblePromotions(existingCustomer:boolean):Promise<{rules:Promotion[];checkedAt:number}> {
  const checkedAt=Date.now();
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Phnom_Penh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(checkedAt));
  const {data,error}=await supabaseAdmin.from('subscription_promotions')
    .select('id,name,plan_key,term_months,discount_percent,starts_on,ends_on,apply_new,apply_existing,enabled')
    .eq('enabled',true).eq(existingCustomer?'apply_existing':'apply_new',true)
    .lte('starts_on',today).gte('ends_on',today);
  if(error)throw new Error('Unable to verify subscription discounts. Please refresh before choosing a plan.');
  return {rules:(data??[]) as Promotion[],checkedAt};
}
