import { getCurrentBusiness } from "@/lib/business/get-current-business";
import { createClient } from "@/lib/supabase/branch-server";
import NotificationsList from "./notifications-list";

export default async function NotificationsPage(){
 const business=await getCurrentBusiness(); const supabase=await createClient();
 await supabase.rpc("refresh_business_notifications",{p_business_id:business.id});
 const {data:items,error:itemsError}=await supabase.from("business_notifications").select("id,notification_type,severity,title,message,href,occurred_at,is_active").eq("business_id",business.id).order("occurred_at",{ascending:false}).limit(100);
 const {data:reads,error:readsError}=items?.length
  ? await supabase.from("business_notification_reads").select("notification_id").in("notification_id",items.map(item=>item.id))
  : {data:[],error:null};
 const error=itemsError??readsError;
 const read=new Set((reads??[]).map((r:{notification_id:string})=>r.notification_id));

 return <NotificationsList items={items??[]} read={read} error={error?.message} />;
}
