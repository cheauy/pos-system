import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { Promotion } from '@/lib/subscriptions/promotions';
import DiscountManager from './discount-manager';

export default async function DiscountsPage(){
  await requireSuperAdmin();
  const {data,error}=await supabaseAdmin.from('subscription_promotions').select('id,name,plan_key,term_months,discount_percent,starts_on,ends_on,apply_new,apply_existing,enabled').order('updated_at',{ascending:false});
  if(error)return <p role="alert">Unable to load discounts. Check that the subscription promotions migration is installed.</p>;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Phnom_Penh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  return <DiscountManager rules={(data??[]) as Promotion[]} today={today}/>;
}
