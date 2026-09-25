import Link from "next/link";
import { ArrowLeft, CheckCircle2, Link2, Store, XCircle } from "lucide-react";
import { getBusinessChangeEntitlements } from "@/lib/subscriptions/entitlements";
import PaymentMethodSelector from "../../../subscription/payment/[orderId]/payment-method-selector";
import PaywayCheckoutButton from "../../../subscription/payment/[orderId]/payway-checkout-button";
import ManualPaymentStatusWatcher from "../../../subscription/manual-payment-status-watcher";
import ManualPaymentQrPreview from "../../../subscription/manual-payment-qr-preview";
import BusinessChangePaymentForm from "./payment-form";
import { cancelBusinessChangeCheckout } from "../../actions";
import PaymentRequestCountdown from "../../../subscription/payment-request-countdown";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { getSubscriptionPaymentExpiryAt, isSubscriptionPaymentExpired } from "@/lib/subscriptions/payment-expiry";

export type CreditCheckoutOrder={
 id:string;credit_purchase:boolean;status:string;change_url:boolean;change_business_mode:boolean;total_amount:number|string;payment_provider:string|null;payment_reference:string|null;payment_note:string|null;proof_path:string|null;proof_file_name:string|null;review_note:string|null;
 manual_bank_name:string|null;manual_account_name:string|null;manual_account_number:string|null;manual_qr_image_url:string|null;payment_expires_at:string|null;payment_expired_at:string|null;created_at:string;
};
export default async function CreditCheckout({order,businessId,cancelFailed=false,expiryCheckFailed=false}:{order:CreditCheckoutOrder;businessId:string;cancelFailed?:boolean;expiryCheckFailed?:boolean}){
 const paid=order.status==='paid';
 const pending=order.status==='pending_payment';
 const submitted=order.status==='payment_submitted';
 const payway=order.payment_provider==='aba_payway';
 const expiresAt=getSubscriptionPaymentExpiryAt(order);
 const windowEnded=isSubscriptionPaymentExpired(order);
 const expired=Boolean(order.payment_expired_at);
 // Server-rendered once and passed to the client to keep hydration stable.
 // eslint-disable-next-line react-hooks/purity
 const remainingSeconds=expiresAt?Math.max(0,Math.ceil((new Date(expiresAt).getTime()-Date.now())/1000)):0;
 const manualAvailable=Boolean(order.manual_bank_name&&order.manual_account_name&&order.manual_account_number);
 const credits=paid?await getBusinessChangeEntitlements(businessId):null;
 const manualContent=<><p className="text-sm text-slate-500">Transfer the exact amount, then upload your receipt for approval.</p><p className="my-4 text-3xl font-extrabold">${Number(order.total_amount).toFixed(2)} USD</p><dl className="space-y-2 rounded-xl border p-4 text-sm"><div><dt className="text-slate-500">Bank</dt><dd className="font-bold">{order.manual_bank_name}</dd></div><div><dt className="text-slate-500">Account name</dt><dd className="font-bold">{order.manual_account_name}</dd></div><div><dt className="text-slate-500">Account number</dt><dd className="font-bold">{order.manual_account_number}</dd></div></dl>{order.manual_qr_image_url&&<div className="mx-auto my-4 max-w-64"><ManualPaymentQrPreview imageUrl={order.manual_qr_image_url}/></div>}<BusinessChangePaymentForm orderId={order.id} paymentReference={order.payment_reference} paymentNote={order.payment_note} hasProof={Boolean(order.proof_path)} proofFileName={order.proof_file_name} submitted={submitted}/></>;
 return <main className="mx-auto w-full max-w-[1540px] pb-10">
  {(submitted||(pending&&payway))&&<ManualPaymentStatusWatcher orderId={order.id} kind="business_change"/>}
  <Link href="/dashboard/settings/business" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500"><ArrowLeft size={16}/>Business Details</Link>
  <div className="my-6"><p className="text-xs font-bold uppercase tracking-widest text-blue-600">TENH POS</p><h1 className="mt-2 text-3xl font-extrabold">Checkout</h1><p className="mt-2 text-sm text-slate-500">Business change credits · Order #{order.id.slice(0,8).toUpperCase()}</p></div>
  {pending&&<div className="mb-5 flex justify-end"><form action={cancelBusinessChangeCheckout}><input type="hidden" name="orderId" value={order.id}/><PendingSubmitButton pendingText="Cancelling…" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-extrabold text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"><XCircle size={14}/>Cancel transaction</PendingSubmitButton></form></div>}
  {cancelFailed&&<p role="alert" className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">Unable to safely cancel this payment yet. It stays locked to prevent duplicate payment. Please try again.</p>}
  <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
   <section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900"><h2 className="text-lg font-bold">Order summary</h2><div className="my-5 divide-y rounded-2xl border border-slate-200 dark:border-slate-700">{[{enabled:order.change_business_mode,label:'Business mode change',icon:Store},{enabled:order.change_url,label:'Store URL change',icon:Link2}].filter(item=>item.enabled).map(({label,icon:Icon})=><div key={label} className="flex items-center gap-3 p-4"><Icon size={22} className="text-blue-600"/><div className="flex-1"><p className="font-bold">{label}</p><p className="mt-1 text-xs text-slate-500">1 credit · One change · No expiry</p></div><strong>$5.00</strong></div>)}</div><div className="flex items-center justify-between rounded-2xl bg-slate-950 p-5 text-white"><span>Total · USD</span><strong className="text-3xl">${Number(order.total_amount).toFixed(2)}</strong></div><p className="mt-4 text-sm leading-6 text-slate-500">Payment adds credits to your business. Your current business mode and Store URL stay unchanged until you confirm a change in Business Details.</p></section>
   <section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
    <h2 className="text-xl font-bold">{paid?'Payment successful':'Payment'}</h2>
    {pending&&expiresAt&&<PaymentRequestCountdown orderId={order.id} kind="business_change" expiresAt={expiresAt} initialRemainingSeconds={remainingSeconds} variant="panel"/>}
    {paid?<div className="mt-4 space-y-3"><CheckCircle2 className="text-emerald-600"/><p>Business mode · Available {credits?.modeCredits}</p><p>Store URL · Available {credits?.urlCredits}</p><p className="text-sm text-slate-500">Your purchased credits never expire.</p><Link href="/dashboard/settings/business" className="inline-flex rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white">Open Business Details</Link></div>:submitted?<div className="mt-4"><p className="font-semibold text-amber-700">Awaiting payment approval</p><p className="mt-2 text-sm text-slate-500">Your receipt is submitted. Credits will appear here after approval.</p></div>:pending&&!windowEnded&&!expired?(payway?<div className="mt-4 space-y-4"><PaywayCheckoutButton orderId={order.id} kind="business_change"/></div>:<PaymentMethodSelector orderId={order.id} kind="business_change" manualAvailable={manualAvailable} initialMethod={null} manualContent={manualContent}/>):<div className="mt-4 space-y-3"><p className="font-semibold">{order.status==='under_review'?'Payment needs review':expired?'Payment request expired':pending&&windowEnded?'Payment window ended':'Checkout closed'}</p><p className="text-sm text-slate-500">{pending&&windowEnded&&(payway||expiryCheckFailed)?'Payment status is being verified. Do not pay again until this transaction is safely closed.':order.review_note||'No credits were added. Return to Business Details to continue.'}</p><Link href="/dashboard/settings/business" className="text-sm font-bold text-blue-600">Back to Business Details</Link></div>}
   </section>
  </div>
 </main>;
}
