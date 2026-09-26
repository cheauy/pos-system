import PaymentSuccessRedirect from "@/components/payment-success-redirect";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/require-permission";
import { verifyAndConfirmSubscriptionPaywayPayment } from "@/lib/payway/server";
export default async function ReturnPage({params}:{params:Promise<{orderId:string}>}){
  const business=await requirePermission("business.update");
  if(business.role!=="owner")throw new Error("Only the owner can check this payment.");
  const {orderId}=await params;
  let approved=false;
  let message="Payment is not confirmed yet. Check again after paying.";
  try{const result=await verifyAndConfirmSubscriptionPaywayPayment({orderId,businessId:business.id,kind:"business_change"});if(result.state==="approved"){approved=true;message="Payment successful. Your change credits are available and will not expire.";}else if(result.state==="late_payment_review")message="Payment received after checkout expired. Please contact support for review.";}
  catch{message="Unable to verify payment yet. Return to checkout to check again.";}
  return <main className="mx-auto max-w-lg rounded-2xl border bg-white p-6 dark:bg-slate-900"><h1 className="text-xl font-bold">Business change credits</h1><p className="my-4">{message}</p>{approved&&<PaymentSuccessRedirect href="/dashboard/settings/business?edit=1" label="Change business"/>}<Link href={`/dashboard/settings/business/payment/${orderId}`} className="text-blue-600">Back to checkout</Link></main>;
}
