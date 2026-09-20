import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
export const expenseReceiptBucket="tenh-expense-receipts";
export async function receiptBytes(file:File){
 if(file.size>5*1024*1024)throw new Error("Receipt must be 5 MB or smaller.");
 const bytes=Buffer.from(await file.arrayBuffer());
 const type=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?"image/png":bytes[0]===255&&bytes[1]===216&&bytes[2]===255?"image/jpeg":bytes.subarray(0,5).toString()==="%PDF-"?"application/pdf":"";
 if(!type || file.type!==type)throw new Error("Upload a valid JPG, PNG or PDF receipt.");
 return {bytes,type};
}
// Call only after resolving the business through expenses.manage permission.
export async function uploadExpenseReceipt(businessId:string,id:string,file:File){
 const {bytes,type}=await receiptBytes(file);
 const existing=await supabaseAdmin.storage.getBucket(expenseReceiptBucket);
 if(existing.error){
  if(!/not found|does not exist/i.test(existing.error.message))throw new Error("Receipt storage is unavailable.");
  const created=await supabaseAdmin.storage.createBucket(expenseReceiptBucket,{public:false,fileSizeLimit:5*1024*1024,allowedMimeTypes:["image/jpeg","image/png","application/pdf"]});
  if(created.error&&!/already exists/i.test(created.error.message))throw new Error("Unable to prepare receipt storage.");
 }else if(existing.data.public)throw new Error("Receipt storage must be private.");
 const {error}=await supabaseAdmin.storage.from(expenseReceiptBucket).upload(`${businessId}/${id}/receipt`,bytes,{contentType:type,upsert:false});
 if(error)throw new Error("Unable to upload receipt. Expense was not saved.");
}
export async function removeExpenseReceipt(businessId:string,id:string){
 const {error}=await supabaseAdmin.storage.from(expenseReceiptBucket).remove([`${businessId}/${id}/receipt`]);
 if(error&&!/not found/i.test(error.message))console.error("Expense receipt cleanup failed",id);
}
export async function expenseReceiptIds(businessId:string){
 const ids=new Set<string>();
 for(let offset=0;;offset+=1000){
  const {data,error}=await supabaseAdmin.storage.from(expenseReceiptBucket).list(businessId,{limit:1000,offset,sortBy:{column:"name",order:"asc"}});
  if(error){if(/not found|does not exist/i.test(error.message))return ids;throw new Error("Unable to load expense receipts.");}
  for(const entry of data||[])ids.add(entry.name);
  if(!data||data.length<1000)return ids;
 }
}
