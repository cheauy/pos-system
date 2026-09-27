import type { SupabaseClient } from '@supabase/supabase-js';
import { totals, type Shift, type Movement, type Order } from '@/app/(dashboard)/dashboard/register/register-model';

export async function mobileRegisterDetail(db: SupabaseClient, businessId: string, branchId: string, id: string) {
  const saved=await db.from('cash_register_shifts').select('*').eq('business_id',businessId).eq('location_id',branchId).eq('id',id).single();
  if(saved.error||!saved.data)throw new Error('Register shift is unavailable in this branch.');
  const shift=saved.data as Shift;
  const movements:Movement[]=[], orders:Order[]=[];
  for(let offset=0;;offset+=1000){
    const result=await db.from('cash_movements').select('id,shift_id,movement_type,amount,reason,reference,created_at,created_by').eq('business_id',businessId).eq('shift_id',id).order('created_at',{ascending:false}).order('id').range(offset,offset+999);
    if(result.error)throw new Error('Unable to load cash movements.');
    movements.push(...result.data as Movement[]);if(result.data.length<1000)break;
  }
  for(let offset=0;;offset+=1000){
    const result=await db.from('orders').select('id,order_number,register_shift_id,payment_method,total,amount_paid,change_amount,status,created_at,pos_checkout').eq('business_id',businessId).eq('location_id',branchId).eq('register_shift_id',id).order('id').range(offset,offset+999);
    if(result.error)throw new Error('Unable to load shift payments.');
    orders.push(...result.data as Order[]);if(result.data.length<1000)break;
  }
  const settings=await db.from('branch_pos_settings').select('currency').eq('business_id',businessId).eq('location_id',branchId).single();
  if(settings.error)throw new Error('Unable to load register currency.');
  return {status:shift.status,openingCash:shift.opening_cash,closingCash:shift.closing_cash,variance:shift.variance,openedAt:shift.opened_at,closedAt:shift.closed_at,openingNote:shift.opening_note,closingNote:shift.closing_note,summary:totals(shift,movements,orders),orderCount:orders.filter(order=>order.pos_checkout||!['cancelled','refunded'].includes(order.status)).length,movements:movements.slice(0,20).map(row=>({id:row.id,type:row.movement_type,amount:row.amount,reason:row.reason})),currency:settings.data.currency};
}
