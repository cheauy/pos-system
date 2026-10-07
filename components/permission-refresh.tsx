'use client';
import { realtimeTopic } from '@/lib/supabase/realtime-topic';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function PermissionRefresh({businessId,userId,role}:{businessId:string;userId:string;role:string}) {
 const router=useRouter();
 useEffect(()=>{
  const db=createClient();let timer:ReturnType<typeof setTimeout>|undefined;let last=Date.now();
  const refresh=()=>{clearTimeout(timer);timer=setTimeout(()=>{last=Date.now();router.refresh();},300);};
  // Realtime covers member/business-role changes. Focus is the catch-up path for
  // branch-role changes and missed events; each refresh re-renders the whole
  // layout and page, so window switching refreshes at most once a minute.
  const onFocus=()=>{if(Date.now()-last>=60000)refresh();};
  const channel=db.channel(realtimeTopic(`access:${businessId}:${userId}`))
   .on('postgres_changes',{event:'UPDATE',schema:'public',table:'business_members',filter:`user_id=eq.${userId}`},refresh)
   .on('postgres_changes',{event:'*',schema:'public',table:'business_role_permissions',filter:`business_id=eq.${businessId}`},refresh)
   .on('postgres_changes',{event:'*',schema:'public',table:'branch_role_permissions',filter:`business_id=eq.${businessId}`},refresh)
   .subscribe();
  window.addEventListener('focus',onFocus);
  return()=>{clearTimeout(timer);window.removeEventListener('focus',onFocus);void db.removeChannel(channel);};
 },[businessId,userId,role,router]);
 return null;
}
