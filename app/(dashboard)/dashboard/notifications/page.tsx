import { Bell, CircleAlert, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { getCurrentBusiness } from "@/lib/business/get-current-business";
import { createClient } from "@/lib/supabase/branch-server";
import NotificationLink from "./notification-link";

const iconMap = { info: Info, success: CheckCircle2, warning: TriangleAlert, critical: CircleAlert } as const;
const tone = { info:"text-blue-600 bg-blue-50", success:"text-emerald-600 bg-emerald-50", warning:"text-amber-700 bg-amber-50", critical:"text-red-700 bg-red-50" } as const;

export default async function NotificationsPage(){
 const business=await getCurrentBusiness(); const supabase=await createClient();
 await supabase.rpc("refresh_business_notifications",{p_business_id:business.id});
 const [{data:items,error},{data:reads}]=await Promise.all([
  supabase.from("business_notifications").select("id,notification_type,severity,title,message,href,occurred_at,is_active").eq("business_id",business.id).order("occurred_at",{ascending:false}).limit(100),
  supabase.from("business_notification_reads").select("notification_id")
 ]);
 const read=new Set((reads??[]).map((r:{notification_id:string})=>r.notification_id));

 return <main className="mx-auto max-w-5xl"><div className="mb-7"><h1 className="flex items-center gap-3 text-3xl font-bold"><Bell/>Notification Center</h1><p className="mt-1 text-slate-500">Orders, payments, inventory, credit, transfers and register alerts in one place.</p></div>
 {error?<div className="rounded-xl bg-red-50 p-4 text-red-700">{error.message}</div>:
 <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">{(items??[]).length===0?<p className="p-10 text-center text-slate-500">No notifications yet.</p>:(items??[]).map((n:any)=>{const Icon=iconMap[n.severity as keyof typeof iconMap]??Info; return <NotificationLink key={n.id} id={n.id} href={n.href??"#"} className={`flex gap-4 border-b border-slate-100 p-5 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60 ${read.has(n.id)?"opacity-65":""}`}><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone[n.severity as keyof typeof tone]??tone.info}`}><Icon size={19}/></span><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="font-semibold">{n.title}</span>{!read.has(n.id)&&<span className="h-2 w-2 rounded-full bg-blue-600"/>}{!n.is_active&&<span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] uppercase text-slate-500">Resolved</span>}</span><span className="mt-1 block text-sm text-slate-600 dark:text-slate-300">{n.message}</span><span className="mt-1 block text-xs text-slate-400">{new Date(n.occurred_at).toLocaleString()}</span></span></NotificationLink>})}</div>}


 </main>;
}
