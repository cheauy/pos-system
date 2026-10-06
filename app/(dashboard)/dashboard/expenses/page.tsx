import { getBranchContext } from "@/lib/branches/context";
import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";
import { expenseReceiptIds } from "@/lib/expenses/receipts";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import ExpensesClient from "./expenses-client";
import type { Expense } from "./expense-model";
export default async function ExpensesPage() {
 const business=await requirePermission("expenses.manage");
 const {branchId}=await getBranchContext();
 const db=await createClient();
 const [{data:branches,error},expenseRows,receiptIds]=await Promise.all([
  db.from("business_locations").select("id,name,is_active").eq("business_id",business.id).order("is_default",{ascending:false}).order("name"),
  readAllRows<Expense>((from,to)=>db.from("expenses").select("id,category,description,amount,expense_date,created_at,payee,payment_method,reference,location_id").eq("business_id",business.id).order("expense_date",{ascending:false}).order("id").range(from,to)),
  expenseReceiptIds(business.id),
 ]);
 if(error) throw new Error("Unable to load branches. Please retry.");
 if(expenseRows.error) throw new Error("Unable to load expenses. Please retry.");
 const expenses=expenseRows.data;
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Phnom_Penh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 return <ExpensesClient expenses={expenses.map(e=>({...e,has_receipt:receiptIds.has(e.id)}))} branches={branches||[]} defaultBranchId={branchId} today={today}/>;
}
