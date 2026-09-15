"use server";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";

export type ExportEntity="products"|"customers"|"orders"|"expenses"|"suppliers"|"shifts"|"credit"|"inventory";
export async function buildExport(entity:ExportEntity,format:"csv"|"json"="csv"){
 const business=await requirePermission("exports.manage"); const supabase=await createClient();
 const map:Record<ExportEntity,{table:string;select:string;order?:string}>={products:{table:"products",select:"id,name,sku,barcode,size,color,cost_price,selling_price,stock_quantity,is_active,created_at",order:"created_at"},customers:{table:"customers",select:"id,name,phone,email,address,created_at",order:"created_at"},orders:{table:"orders",select:"id,order_number,total,status,payment_method,payment_status,amount_paid,credit_amount,location_id,created_at",order:"created_at"},expenses:{table:"expenses",select:"id,category,description,amount,expense_date,payee,payment_method,reference,location_id,created_at",order:"created_at"},suppliers:{table:"suppliers",select:"*",order:"created_at"},shifts:{table:"cash_register_shifts",select:"id,location_id,status,opening_cash,closing_cash,expected_cash,variance,opened_at,closed_at",order:"opened_at"},credit:{table:"customer_credit_ledger",select:"id,customer_id,entry_type,amount,balance_after,note,reference,created_at",order:"created_at"},inventory:{table:"product_location_stock",select:"location_id,product_id,quantity,low_stock_threshold,updated_at",order:"updated_at"}};
 const spec=map[entity]; let q=supabase.from(spec.table).select(spec.select).eq("business_id",business.id); if(spec.order) q=q.order(spec.order,{ascending:false}); const {data,error}=await q.limit(10000); if(error) throw new Error(error.message); const rows=(data??[]) as Record<string,unknown>[];
 if(format==="json") return {filename:`tenh-${entity}.json`,mime:"application/json",content:JSON.stringify(rows,null,2)};
 const keys=Array.from(new Set(rows.flatMap(r=>Object.keys(r)))); const esc=(v:unknown)=>`"${String(v??"").replaceAll('"','""')}"`; const content=[keys.map(esc).join(","),...rows.map(r=>keys.map(k=>esc(r[k])).join(","))].join("\n"); return {filename:`tenh-${entity}.csv`,mime:"text/csv;charset=utf-8",content};
}
