import { getBranchContext } from "@/lib/branches/context";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { expenseReceiptIds } from "@/lib/expenses/receipts";
import ExpensesClient from "./expenses-client";
import type { Expense } from "./expense-model";
export default async function ExpensesPage() {
 const business=await requirePermission("expenses.manage");
 const {ownBranchId}=await getBranchContext();
 const db=await createClient();
 const {data:branches,error}=await db.from("business_locations").select("id,name,is_active").eq("business_id",business.id).order("is_default",{ascending:false}).order("name");
 if(error) throw new Error("Unable to load branches. Please retry.");
 const expenses:Expense[]=[];
 for(let offset=0;;offset+=1000){
  const {data,error}=await db.from("expenses").select("id,category,description,amount,expense_date,created_at,payee,payment_method,reference,location_id").eq("business_id",business.id).order("expense_date",{ascending:false}).order("id").range(offset,offset+999);
  if(error) throw new Error("Unable to load expenses. Please retry.");
  expenses.push(...(data||[])); if(!data || data.length<1000)break;
 }
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Phnom_Penh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 const receiptIds=await expenseReceiptIds(business.id);
 return <ExpensesClient expenses={expenses.map(e=>({...e,has_receipt:receiptIds.has(e.id)}))} branches={branches||[]} defaultBranchId={ownBranchId} today={today}/>;
}
