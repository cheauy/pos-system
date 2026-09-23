import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
/** Pending users hold a seat but have inactive membership, so RLS cannot grant workspace access. */
export async function needsTeamPasswordSetup(userId:string):Promise<boolean>{
 const {data,error}=await supabaseAdmin.from('business_members').select('id').eq('user_id',userId).eq('disabled_reason','password_setup').limit(1);
 if(error)throw new Error('Unable to verify team setup status. Please retry.');
 return Boolean(data?.length);
}
