"use server";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/branch-server";

export type SupplierMetric = {orderCount:number;receivedTotal:number;openValue:number;lastOrderDate:string|null};
export type SupplierWorkspace = {
  suppliers: {id:string;name:string;contact_person:string|null;phone:string|null;email:string|null;address:string|null;notes:string|null;is_active:boolean;created_at:string}[];
  total:number;page:number;metrics:Record<string,SupplierMetric>;
  stats:{total:number;active:number;thisMonthOrders:number;openPoValue:number};
};
export async function loadSuppliers(filters?: {page:number;query:string;statusFilter:string}): Promise<SupplierWorkspace> {
  const business=await requirePermission("suppliers.manage");
  const db=await createClient();
  const {data,error}=await db.rpc("tenh_suppliers_page",{
    p_business:business.id,p_page:Math.max(1,Math.min(10000,Math.trunc(Number(filters?.page)||1))),
    p_query:String(filters?.query??"").trim().slice(0,200),p_status:filters?.statusFilter||"all",
  });
  if(error||!data)throw new Error("Unable to load suppliers. Please try again.");
  return data as SupplierWorkspace;
}
