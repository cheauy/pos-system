import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { expenseReceiptBucket } from "@/lib/expenses/receipts";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const business=await requirePermission("expenses.manage");const {id}=await params;
 if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))return new Response("Not found",{status:404});
 const db=await createClient();const {data,error}=await db.from("expenses").select("id").eq("id",id).eq("business_id",business.id).maybeSingle();
 if(error)return new Response("Unable to load receipt",{status:503});
 if(!data)return new Response("Not found",{status:404});
 const file=await supabaseAdmin.storage.from(expenseReceiptBucket).download(`${business.id}/${id}/receipt`);
 if(file.error||!file.data)return new Response("Receipt unavailable",{status:404});
 return new Response(file.data,{headers:{"Content-Type":file.data.type,"Content-Disposition":"inline","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox"}});
}
