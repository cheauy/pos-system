"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { createAuditLog } from "@/lib/audit/create-audit-log";

function t(fd:FormData,k:string){const v=fd.get(k);return typeof v==="string"?v.trim():""}
export async function createLocation(fd:FormData){
 const business=await requirePermission("locations.manage"); const supabase=await createClient();
 const name=t(fd,"name"), code=t(fd,"code").toUpperCase(); if(!name||!code) throw new Error("Name and code are required.");
 const {data,error}=await supabase.from("business_locations").insert({business_id:business.id,name,code,address:t(fd,"address")||null,phone:t(fd,"phone")||null}).select("id").single();
 if(error) throw new Error(error.message); await createAuditLog({action:"create",entityType:"business",entityId:data.id,description:`Created branch ${name}`,metadata:{code}}); revalidatePath("/dashboard/locations");
}
export async function setDefaultLocation(fd:FormData){
 const business=await requirePermission("locations.manage"); const id=t(fd,"locationId"); if(!id) throw new Error("Invalid branch."); const supabase=await createClient();
 const {error:e1}=await supabase.from("business_locations").update({is_default:false}).eq("business_id",business.id).eq("is_default",true); if(e1) throw new Error(e1.message);
 const {error}=await supabase.from("business_locations").update({is_default:true,updated_at:new Date().toISOString()}).eq("id",id).eq("business_id",business.id); if(error) throw new Error(error.message);
 await createAuditLog({action:"update",entityType:"business",entityId:id,description:"Changed default branch"}); revalidatePath("/dashboard/locations");
}
export async function toggleLocation(fd:FormData){
 const business=await requirePermission("locations.manage"); const id=t(fd,"locationId"), active=t(fd,"active")==="true"; const supabase=await createClient();
 const {error}=await supabase.from("business_locations").update({is_active:active,updated_at:new Date().toISOString()}).eq("id",id).eq("business_id",business.id).eq("is_default",false); if(error) throw new Error(error.message);
 await createAuditLog({action:"update",entityType:"business",entityId:id,description:active?"Activated branch":"Disabled branch"}); revalidatePath("/dashboard/locations");
}
