'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function PermissionRefresh({businessId,userId,role}:{businessId:string;userId:string;role:string}) {
 const router=useRouter();
 useEffect(()=>{
  const db=createClient();let timer:ReturnType<typeof setTimeout>|undefined;
  const refresh=()=>{clearTimeout(timer);timer=setTimeout(()=>router.refresh(),300);};
  const channel=db.channel(`access:${businessId}:${userId}`)
   .on('postgres_changes',{event:'UPDATE',schema:'public',table:'business_members',filter:`user_id=eq.${userId}`},refresh)
   .on('postgres_changes',{event:'*',schema:'public',table:'business_role_permissions',filter:`business_id=eq.${businessId}`},refresh)
   .subscribe();
  window.addEventListener('focus',refresh);
  return()=>{clearTimeout(timer);window.removeEventListener('focus',refresh);void db.removeChannel(channel);};
 },[businessId,userId,role,router]);
 return null;
}
