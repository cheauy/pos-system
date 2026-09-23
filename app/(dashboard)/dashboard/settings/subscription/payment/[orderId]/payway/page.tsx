import Link from "next/link";
import { redirect } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import { getCurrentBusinessForSubscription } from "@/lib/business/get-current-business";
import { createClient } from "@/lib/supabase/server";
import { prepareSubscriptionPaywayCheckout } from "@/lib/payway/server";
import { getManualPaymentConfig } from "@/lib/subscriptions/manual-bank";
import { selectSubscriptionPaymentMethod } from "../../../actions";
import PaywaySubmitForm from "./payway-submit-form";

export default async function SubscriptionPaywayStartPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const business = await getCurrentBusinessForSubscription({ startTrial: false });
  if (business.role !== "owner") throw new Error("Only the business owner can start ABA PayWay checkout.");
  const { orderId } = await params;
  const manualConfig = getManualPaymentConfig();
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  let checkout: Awaited<ReturnType<typeof prepareSubscriptionPaywayCheckout>> | null = null;
  let checkoutError: string | null = null;
  try {
    checkout = await prepareSubscriptionPaywayCheckout({
      orderId,
      businessId: business.id,
      email: user.email,
    });
  } catch (error) {
    checkoutError = error instanceof Error ? error.message : "ABA PayWay checkout is unavailable right now.";
  }

  if (checkout?.alreadyPaid) {
    redirect(`/dashboard/settings/subscription/payment/${orderId}`);
  }

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-xl items-center justify-center py-10">
      <section className="w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 p-2 dark:bg-blue-950/40">
          {/* aba-khqr.png is the existing ABA brand image in /public. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/aba-khqr.png"
            alt="ABA PayWay"
            className="h-full w-full rounded-xl object-contain"
          />
        </div>
        <h1 className="mt-5 text-2xl font-extrabold text-slate-950 dark:text-white">
          {checkoutError ? "ABA PayWay needs attention" : "Opening ABA PayWay"}
        </h1>
        {checkoutError ? (
          <>
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left text-sm leading-6 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              {checkoutError}
            </div>
            {manualConfig.enabled ? (
              <form action={selectSubscriptionPaymentMethod} className="mt-4">
                <input type="hidden" name="orderId" value={orderId} />
                <input type="hidden" name="paymentMethod" value="manual" />
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 transition hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  Use Manual Payment
                </button>
              </form>
            ) : manualConfig.requestedEnabled ? (
              <p className="mt-4 text-xs leading-5 text-amber-700 dark:text-amber-300">
                Manual payment is enabled but its bank account settings are incomplete.
              </p>
            ) : null}
          </>
        ) : (
          <>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Your subscription amount is locked to this order. Complete payment only once. TENH POS verifies the transaction with ABA PayWay before activating anything.
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <LoaderCircle className="animate-spin" size={14} />
              Redirecting securely…
            </div>
            {checkout && !checkout.alreadyPaid ? (
              <PaywaySubmitForm action={checkout.purchaseUrl} fields={checkout.fields} />
            ) : null}
          </>
        )}
        <Link
          href={`/dashboard/settings/subscription/payment/${orderId}`}
          className="mt-4 inline-flex text-sm font-semibold text-slate-500 hover:text-blue-600"
        >
          Back to payment options
        </Link>
      </section>
    </main>
  );
}
