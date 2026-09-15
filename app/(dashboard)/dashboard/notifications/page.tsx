import { Bell, CircleAlert, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { getCurrentBusiness } from "@/lib/business/get-current-business";
import { createClient } from "@/lib/supabase/server";
import { saveNotificationRoleSettings } from "./actions";
import NotificationLink from "./notification-link";

const iconMap = { info: Info, success: CheckCircle2, warning: TriangleAlert, critical: CircleAlert } as const;
const tone = { info:"text-blue-600 bg-blue-50", success:"text-emerald-600 bg-emerald-50", warning:"text-amber-700 bg-amber-50", critical:"text-red-700 bg-red-50" } as const;

export default async function NotificationsPage(){
 const business=await getCurrentBusiness(); const supabase=await createClient();
 await supabase.rpc("refresh_business_notifications",{p_business_id:business.id});
 const [{data:items,error},{data:reads},{data:roleSettings}]=await Promise.all([
  supabase.from("business_notifications").select("id,notification_type,severity,title,message,href,occurred_at,is_active").eq("business_id",business.id).order("occurred_at",{ascending:false}).limit(100),
  supabase.from("business_notification_reads").select("notification_id"),
  supabase.from("business_notification_role_settings").select("notification_type,target_roles").eq("business_id",business.id)
 ]);
 const read=new Set((reads??[]).map((r:{notification_id:string})=>r.notification_id));
 const defaults:Record<string,string[]>={new_order:["owner","admin","manager","cashier"],khqr_pending:["owner","admin","manager","cashier"],low_stock:["owner","admin","manager"],purchase_order:["owner","admin","manager"],stock_transfer:["owner","admin","manager"],register_variance:["owner","admin","manager"],credit_overdue:["owner","admin","manager"],scheduled_order:["owner","admin","manager","cashier"]};
 const currentRoles=new Map((roleSettings??[]).map((r:any)=>[r.notification_type,r.target_roles as string[]]));
 const typeLabels:Record<string,string>={new_order:"New online / QR order",khqr_pending:"KHQR pending verification",low_stock:"Low stock",purchase_order:"Purchase order awaiting receipt",stock_transfer:"Stock transfer in transit",register_variance:"Register over / short",credit_overdue:"Overdue customer credit",scheduled_order:"Scheduled order reminder"};

 return <main className="mx-auto max-w-5xl"><div className="mb-7"><h1 className="flex items-center gap-3 text-3xl font-bold"><Bell/>Notification Center</h1><p className="mt-1 text-slate-500">Orders, payments, inventory, credit, transfers and register alerts in one place.</p></div>
 {error?<div className="rounded-xl bg-red-50 p-4 text-red-700">{error.message}</div>:
 <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">{(items??[]).length===0?<p className="p-10 text-center text-slate-500">No notifications yet.</p>:(items??[]).map((n:any)=>{const Icon=iconMap[n.severity as keyof typeof iconMap]??Info; return <NotificationLink key={n.id} id={n.id} href={n.href??"#"} className={`flex gap-4 border-b border-slate-100 p-5 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60 ${read.has(n.id)?"opacity-65":""}`}><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone[n.severity as keyof typeof tone]??tone.info}`}><Icon size={19}/></span><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="font-semibold">{n.title}</span>{!read.has(n.id)&&<span className="h-2 w-2 rounded-full bg-blue-600"/>}{!n.is_active&&<span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] uppercase text-slate-500">Resolved</span>}</span><span className="mt-1 block text-sm text-slate-600 dark:text-slate-300">{n.message}</span><span className="mt-1 block text-xs text-slate-400">{new Date(n.occurred_at).toLocaleString()}</span></span></NotificationLink>})}</div>}

 {business.role==="owner"&&<section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><h2 className="text-lg font-semibold">Who receives each alert?</h2><p className="mt-1 text-sm text-slate-500">Owner can control notification visibility by staff role.</p><form action={saveNotificationRoleSettings} className="mt-5 overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead><tr className="border-b text-left text-xs uppercase text-slate-500"><th className="py-3">Alert</th>{["owner","admin","manager","cashier"].map(r=><th key={r} className="px-3 py-3 capitalize">{r}</th>)}</tr></thead><tbody>{Object.entries(typeLabels).map(([type,label])=>{const roles=currentRoles.get(type)??defaults[type]; return <tr key={type} className="border-b last:border-0"><td className="py-3 font-medium">{label}</td>{["owner","admin","manager","cashier"].map(role=><td key={role} className="px-3 py-3"><input type="checkbox" name={`${type}:${role}`} defaultChecked={roles.includes(role)} className="h-4 w-4 rounded border-slate-300"/></td>)}</tr>})}</tbody></table><button className="mt-5 rounded-xl bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-700">Save alert roles</button></form></section>}
 </main>;
}
