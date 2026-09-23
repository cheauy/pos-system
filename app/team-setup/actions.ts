'use server';
import {createClient} from '@/lib/supabase/server';
import {supabaseAdmin} from '@/lib/supabase/admin';
export async function completeTeamPasswordSetup(password:string,confirm:string){
 try{
  if(typeof password!=='string'||password.length<12||password.length>128||password!==confirm)throw new Error('Use matching passwords of 12–128 characters.');
  const db=await createClient();const {data:{user},error}=await db.auth.getUser();
  if(error||!user)throw new Error('Sign in again with the temporary password provided by your Owner.');
  const changed=await db.auth.updateUser({password});
  if(changed.error && changed.error.code!=='same_password')throw changed.error;
  // This service-only RPC verifies a changed password fingerprint, subscription,
  // pending membership and reserved seat before activation. Metadata is not authority.
  const finished=await supabaseAdmin.rpc('tenh_users_finish_setup',{p_user:user.id});
  if(finished.error)throw finished.error;
  return {success:true as const,message:'Password saved. Your eligible team access is now active.'};
 }catch(error){return {success:false as const,message:error instanceof Error?error.message:(error as {message?:string})?.message||'Unable to finish setup.'};}
}
