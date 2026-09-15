"use client";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function NotificationLink({id,href,className,children}:{id:string;href:string;className:string;children:React.ReactNode}){
  async function mark(){const supabase=createClient(); const {data:{user}}=await supabase.auth.getUser(); if(user) await supabase.from("business_notification_reads").upsert({notification_id:id,user_id:user.id,read_at:new Date().toISOString()});}
  return <Link href={href} onClick={()=>void mark()} className={className}>{children}</Link>;
}
