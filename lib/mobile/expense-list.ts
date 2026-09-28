import type {SupabaseClient} from '@supabase/supabase-js';

export async function mobileExpenses(db:SupabaseClient,businessId:string,branchId:string,url:URL,now=new Date()) {
  const page=Math.max(1,Math.min(10000,Number(url.searchParams.get('page'))||1));
  const period=url.searchParams.get('period'),category=url.searchParams.get('category');
  const term=(url.searchParams.get('search')||'').slice(0,100).replace(/[^\p{L}\p{N}\s_-]/gu,'');
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Phnom_Penh',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const monthEnd=new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7)),0)).toISOString().slice(0,10);
  const base=(fields:string)=>{
    let query=db.from('expenses').select(fields,{count:'exact'}).eq('business_id',businessId).eq('location_id',branchId);
    if(category)query=query.eq('category',category);
    if(term)query=query.or(`description.ilike.%${term}%,payee.ilike.%${term}%`);
    if(period==='month'||period==='year')query=query.gte('expense_date',period==='month'?`${today.slice(0,7)}-01`:`${today.slice(0,4)}-01-01`).lte('expense_date',period==='month'?monthEnd:`${today.slice(0,4)}-12-31`);
    return query;
  };
  const ascending=url.searchParams.get('sort')==='oldest';
  const result=await base('id,category,description,amount,expense_date,payee').order('expense_date',{ascending}).order('id').range((page-1)*10,page*10-1);
  if(result.error)throw new Error('Unable to load expenses.');
  let totalAmount=0;
  // ponytail: O(filtered expenses); replace with a database aggregate if large ledgers make this slow.
  for(let offset=0;offset<(result.count||0);offset+=1000){
    const amounts=await base('amount').order('id').range(offset,offset+999);
    if(amounts.error)throw new Error('Unable to load expense total.');
    for(const row of amounts.data||[])totalAmount+=Math.round(Number((row as unknown as {amount:number}).amount)*100);
  }
  const settings=await db.from('branch_pos_settings').select('currency').eq('business_id',businessId).eq('location_id',branchId).single();
  if(settings.error||!settings.data)throw new Error('Unable to load currency.');
  return {rows:result.data,total:result.count||0,totalAmount:totalAmount/100,currency:settings.data.currency,page};
}
