import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { receiptAppearance, type ReceiptContext } from './receipt-model';
// Call only after the caller has resolved/authorized its business server-side.
export async function loadReceiptContext(businessId:string, name:string): Promise<ReceiptContext> {
 const db=await createClient();
 const [settings,store]=await Promise.all([
  db.from('business_receipt_settings').select('*').eq('business_id',businessId).maybeSingle(),
  supabaseAdmin.from('business_storefronts').select('display_name,logo_url,phone,address').eq('business_id',businessId).maybeSingle()
 ]);
 if(settings.error || store.error) throw new Error('Receipt settings could not be loaded. Please retry.');
 return {appearance:receiptAppearance(settings.data,store.data?.logo_url),store:{name:store.data?.display_name || name,phone:store.data?.phone || '',address:store.data?.address || ''}};
}
