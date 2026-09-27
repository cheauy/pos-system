import type { SupabaseClient } from '@supabase/supabase-js';
import { staffReportDates } from '@/lib/analytics/staff-report';

export function expenseCategories(rows: { category: string | null; amount: number | string }[]) {
  const groups=new Map<string,number>();
  for(const row of rows){const amount=Number(row.amount);if(!Number.isFinite(amount)||amount<0)throw new Error('An expense has an invalid amount. Review it before using these totals.');const name=row.category||'Other';groups.set(name,(groups.get(name)||0)+Math.round(amount*100));}
  return [...groups].map(([name,cents])=>({name,value:cents/100})).sort((a,b)=>b.value-a.value);
}
export async function mobileExpenseBreakdown(db:SupabaseClient,businessId:string,branchId:string,range:string){
 if(!['yesterday','today','7days','30days','365days'].includes(range))throw new Error('Choose a supported period.');
 const dates=staffReportDates(range),rows:{category:string|null;amount:number}[]=[];
 for(let offset=0;;offset+=500){
  if(offset>=20000)throw new Error('Too many expenses. Choose a shorter period.');
  const result=await db.from('expenses').select('id,category,amount').eq('business_id',businessId).eq('location_id',branchId).gte('expense_date',dates.from).lte('expense_date',dates.to).order('id').range(offset,offset+499);
  if(result.error)throw new Error('Unable to load expense totals.');rows.push(...result.data);if(result.data.length<500)break;
 }
 const settings=await db.from('branch_pos_settings').select('currency').eq('business_id',businessId).eq('location_id',branchId).single();
 if(settings.error)throw new Error('Unable to load currency.');
 return {rows:expenseCategories(rows),count:rows.length,from:dates.from,to:dates.to,currency:settings.data.currency};
}
