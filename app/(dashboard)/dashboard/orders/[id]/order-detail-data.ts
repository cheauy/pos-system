import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { authorizedOrderBranch } from '@/lib/branches/order-access';
import type { DetailedOrder } from './order-detail-model';
export async function loadDetailedOrder(businessId:string,orderId:string):Promise<DetailedOrder|null>{
 if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(orderId))return null;
 if(!await authorizedOrderBranch(businessId,orderId))return null;
 const db=supabaseAdmin;
 const {data,error}=await db.from('orders').select('*,customers(id,name,phone,email,address,loyalty_points),order_items(*,products(name,sku,image_url))').eq('business_id',businessId).eq('id',orderId).maybeSingle();
 if(error)throw new Error('Order details could not be loaded. Please retry.');
 if(!data || data.archived_at)return null;
 return data as unknown as DetailedOrder;
}
