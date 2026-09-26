import PaymentSuccessRedirect from "@/components/payment-success-redirect";
import Link from "next/link";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";

import { getCurrentBusinessForSubscription } from "@/lib/business/get-current-business";
import { verifyAndConfirmSubscriptionPaywayPayment } from "@/lib/payway/server";
import { expireSubscriptionPaymentRequestSafely } from "@/lib/subscriptions/payment-expiry";

export default async function SubscriptionPaywayReturnPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const business = await getCurrentBusinessForSubscription({ startTrial: false });
  const { orderId } = await params;

  let state: "approved" | "pending" | "expired" | "error" = "pending";
  let message = "ABA PayWay is still processing this transaction. You can safely check again; do not pay a second time.";
  try {
    const result = await verifyAndConfirmSubscriptionPaywayPayment({ orderId, businessId: business.id });
    if (result.state === "approved") {
      state = "approved";
      message = "Payment verified with ABA PayWay. Your subscription order is confirmed.";
    } else if (result.state === "pending") {
      const expiry = await expireSubscriptionPaymentRequestSafely({
        orderId,
        businessId: business.id,
      });
      if (expiry.state === "expired") {
        state = "expired";
        message = "The 10-minute payment request expired. ABA PayWay was verified unpaid and closed safely. Create a new payment request to continue.";
      } else if (expiry.state === "approved") {
        state = "approved";
        message = "Payment verified with ABA PayWay. Your subscription order is confirmed.";
      } else {
        state = "pending";
        message = `Payment is not approved yet (${result.providerStatus}). You can check again without creating another payment.`;
      }
    } else {
      state = "pending";
      message = "This order is no longer waiting for payment. Open the payment page to see its current status.";
    }
  } catch (error) {
    state = "error";
    message = error instanceof Error ? error.message : "Unable to verify ABA PayWay payment right now.";
  }

  const approved = state === "approved";
  const expired = state === "expired";
  const pending = state === "pending";

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-xl items-center justify-center py-10">
      <section className="w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${approved ? "bg-emerald-50 text-emerald-600" : pending ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"}`}>
          {approved ? <CheckCircle2 size={28} /> : pending ? <Clock3 size={28} /> : <XCircle size={28} />}
        </div>
        <h1 className="mt-5 text-2xl font-extrabold text-slate-950 dark:text-white">
          {approved ? "Payment verified" : expired ? "Payment request expired" : pending ? "Checking payment" : "Verification needs attention"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">{message}</p>
        {approved && <PaymentSuccessRedirect href="/dashboard/settings/subscription" label="Subscription Overview" />}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href={`/dashboard/settings/subscription/payment/${orderId}`}
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700"
          >
            View payment order
          </Link>
          {expired ? (
            <Link
              href="/dashboard/settings/subscription?view=plans"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Create new payment request
            </Link>
          ) : !approved ? (
            <Link
              href={`/dashboard/settings/subscription/payment/${orderId}/payway-return`}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Check again
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}
