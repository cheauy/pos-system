import { getBranchContext } from "@/lib/branches/context";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/branch-server";
import RegisterClient from "./register-client";
import type { Movement, Order } from "./register-model";
export default async function RegisterPage(){
 const business=await requirePermission("register.manage");const db=await createClient();const {branchId}=await getBranchContext();
 const [locations,recent,opened]=await Promise.all([
 db.from("business_locations").select("id,name,code,is_active").eq("business_id",business.id).order("is_default",{ascending:false}).order("name"),
 db.from("cash_register_shifts").select("*").eq("business_id",business.id).order("opened_at",{ascending:false}).limit(50),
 db.from("cash_register_shifts").select("*").eq("business_id",business.id).eq("status","open"),
 ]);
 if(locations.error||recent.error||opened.error)throw new Error("Unable to load registers. Please retry.");
 const shifts=[...new Map([...(opened.data||[]),...(recent.data||[])].map(s=>[s.id,s])).values()].sort((a,b)=>b.opened_at.localeCompare(a.opened_at));const ids=shifts.map(s=>s.id);
 const movements:Movement[]=[];const orders:Order[]=[];
 if(ids.length){
 for(let offset=0;;offset+=1000){const r=await db.from("cash_movements").select("id,shift_id,movement_type,amount,reason,reference,created_at,created_by").eq("business_id",business.id).in("shift_id",ids).order("created_at",{ascending:false}).order("id").range(offset,offset+999);if(r.error)throw new Error("Unable to load cash movements.");movements.push(...r.data);if(r.data.length<1000)break;}
 for(let offset=0;;offset+=1000){const r=await db.from("orders").select("id,order_number,register_shift_id,payment_method,total,amount_paid,change_amount,status,created_at,pos_checkout").eq("business_id",business.id).in("register_shift_id",ids).order("created_at",{ascending:false}).order("id").range(offset,offset+999);if(r.error)throw new Error("Unable to load shift payments.");orders.push(...r.data);if(r.data.length<1000)break;}
 }
 const people=[...new Set([...shifts.map(s=>s.opened_by),...movements.map(m=>m.created_by)])];const names:Record<string,string>={};
 if(people.length){const members=await db.from("business_members").select("user_id").eq("business_id",business.id).in("user_id",people);if(members.error)throw new Error("Unable to load shift staff.");const allowed=(members.data||[]).map(m=>m.user_id);if(allowed.length){const profiles=await db.from("profiles").select("id,full_name").in("id",allowed);for(const p of profiles.data||[])names[p.id]=p.full_name||"Staff";}}
 return <RegisterClient branches={(locations.data||[]).filter(b=>b.id===branchId)} shifts={shifts} movements={movements} orders={orders} names={names}/>;
}
