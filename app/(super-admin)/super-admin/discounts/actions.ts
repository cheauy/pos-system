'use server';
import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { validatePromotion, type Promotion } from '@/lib/subscriptions/promotions';

type SaveState={error:string|null;saved:boolean;id?:string};
export async function managePromotion(id:string,operation:'enable'|'disable'|'delete'):Promise<{error:string|null}> {
  const admin=await requireSuperAdmin();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||!['enable','disable','delete'].includes(operation))return {error:'Invalid discount action. Refresh and try again.'};
  const query=supabaseAdmin.from('subscription_promotions');
  const result=operation==='delete'
    ?await query.delete().eq('id',id).select('id').maybeSingle()
    :await query.update({enabled:operation==='enable',updated_by:admin.id,updated_at:new Date().toISOString()}).eq('id',id).select('id').maybeSingle();
  if(result.error||!result.data)return {error:'Discount could not be changed. Refresh and try again.'};
  try {revalidatePath('/super-admin/discounts');revalidatePath('/dashboard/settings/subscription');} catch { /* The change is committed. */ }
  return {error:null};
}
export async function savePromotion(_previous:SaveState,form:FormData):Promise<SaveState> {
  const admin=await requireSuperAdmin();
  const id=String(form.get('id')??'');
  if(id&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return {error:'Invalid discount. Refresh and try again.',saved:false};
  const input:Omit<Promotion,'id'>={
    name:String(form.get('name')??'').trim(),plan_key:(form.get('plan')||null) as Promotion['plan_key'],
    term_months:form.get('term')?Number(form.get('term')) as Promotion['term_months']:null,
    discount_percent:Number(form.get('percent')),starts_on:String(form.get('startsOn')??''),ends_on:String(form.get('endsOn')??''),
    apply_new:form.get('applyNew')==='on',apply_existing:form.get('applyExisting')==='on',enabled:form.get('enabled')==='on',
  };
  const invalid=validatePromotion(input);
  if(invalid)return {error:invalid,saved:false,id};
  const values={...input,updated_by:admin.id,updated_at:new Date().toISOString()};
  const result=id?await supabaseAdmin.from('subscription_promotions').update(values).eq('id',id).select('id').maybeSingle()
    :await supabaseAdmin.from('subscription_promotions').insert(values).select('id').single();
  if(result.error||!result.data)return {error:'Discount was not saved. Please try again.',saved:false,id};
  try {revalidatePath('/super-admin/discounts');revalidatePath('/dashboard/settings/subscription');} catch { /* The save is committed. */ }
  return {error:null,saved:true,id:String(result.data.id)};
}
