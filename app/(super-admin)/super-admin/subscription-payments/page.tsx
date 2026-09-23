import { ExternalLink, FileCheck2, ReceiptText, UsersRound } from "lucide-react";

import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSubscriptionPlanLabel } from "@/lib/subscriptions/plans";
import { quoteCustomSubscriptionOrder, reviewSubscriptionPayment } from "./actions";

type Order = {
  id: string;
  business_id: string;
  requested_by_user_id: string;
  plan_key: string;
  requested_user_limit: number;
  requested_branch_limit?: number;
  term_months: number;
  monthly_price: number | string | null;
  discount_percent: number | string;
  total_amount: number | string | null;
  status: string;
  payment_note: string | null;
  proof_bucket: string | null;
  proof_path: string | null;
  proof_file_name: string | null;
  created_at: string;
};

const REJECTION_MESSAGES = [
  "We could not verify this payment. Please check the payment and submit a clear payment proof again.",
  "The payment proof is unclear or incomplete. Please upload a clear payment proof and submit again.",
  "The payment amount or payment details do not match this subscription order. Please correct the payment information and submit again.",
];

export default async function SubscriptionPaymentsAdminPage() {
  await requireSuperAdmin();

  const { data, error } = await supabaseAdmin
    .from("subscription_orders")
    .select("*")
    .in("status", ["quote_requested", "pending_payment", "payment_submitted", "approved", "rejected"])
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(`Unable to load subscription payments: ${error.message}`);
  const orders = (data ?? []) as Order[];

  const businessIds = [...new Set(orders.map((order) => order.business_id))];
  const { data: businesses } = businessIds.length
    ? await supabaseAdmin.from("businesses").select("id,name,slug").in("id", businessIds)
    : { data: [] as Array<{ id: string; name: string; slug: string }> };
  const businessMap = new Map((businesses ?? []).map((business) => [business.id, business]));

  const proofLinks = new Map<string, string>();
  for (const order of orders) {
    if (!order.proof_bucket || !order.proof_path) continue;
    const { data: signed } = await supabaseAdmin.storage
      .from(order.proof_bucket)
      .createSignedUrl(order.proof_path, 300);
    if (signed?.signedUrl) proofLinks.set(order.id, signed.signedUrl);
  }

  const submittedCount = orders.filter((order) => order.status === "payment_submitted").length;
  const quoteCount = orders.filter((order) => order.status === "quote_requested").length;

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-6 pb-12">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">Super Admin</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white">Subscription Payments</h1>
        <p className="mt-2 text-sm text-slate-500">Create custom quotes and review Manual Bank Transfer subscription payments.</p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <Card label="Needs review" value={submittedCount} />
        <Card label="Custom quotes" value={quoteCount} />
        <Card label="Orders loaded" value={orders.length} />
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-950/60">
              <tr>
                <th className="px-5 py-3">Business</th>
                <th className="px-5 py-3">Plan</th>
                <th className="px-5 py-3">Users / Branches</th>
                <th className="px-5 py-3">Term</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Proof / Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {orders.map((order) => {
                const business = businessMap.get(order.business_id);
                const proofUrl = proofLinks.get(order.id);
                return (
                  <tr key={order.id} className="align-top">
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-950 dark:text-white">{business?.name ?? "Unknown business"}</p>
                      <p className="mt-1 text-xs text-slate-400">{business?.slug ?? order.business_id}</p>
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold">{getSubscriptionPlanLabel(order.plan_key)}</td>
                    <td className="px-5 py-4 text-sm"><span className="inline-flex items-center gap-1.5"><UsersRound size={15} />{order.requested_user_limit} users / {order.requested_branch_limit ?? 1} branches</span></td>
                    <td className="px-5 py-4 text-sm">{order.term_months === 12 ? "1 year" : `${order.term_months} months`}</td>
                    <td className="px-5 py-4 text-sm font-black">{order.total_amount === null ? "Quote" : `$${Number(order.total_amount).toFixed(2)}`}</td>
                    <td className="px-5 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{order.status.replace(/_/g, " ")}</span></td>
                    <td className="px-5 py-4">
                      {order.status === "quote_requested" ? (
                        <form action={quoteCustomSubscriptionOrder} className="flex items-end gap-2">
                          <input type="hidden" name="orderId" value={order.id} />
                          <label className="text-xs font-bold text-slate-500">
                            Monthly price
                            <input name="monthlyPrice" type="number" min="1" step="0.01" required className="mt-1 block w-28 rounded-lg border border-slate-300 px-2.5 py-2 text-sm" />
                          </label>
                          <button type="submit" className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white">Create quote</button>
                        </form>
                      ) : order.status === "payment_submitted" ? (
                        <div className="space-y-3">
                          {proofUrl ? (
                            <a href={proofUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline">
                              <FileCheck2 size={14} /> View proof <ExternalLink size={12} />
                            </a>
                          ) : null}
                          {order.payment_note ? <p className="max-w-xs text-xs leading-5 text-slate-500">{order.payment_note}</p> : null}
                          <form action={reviewSubscriptionPayment} className="flex flex-wrap gap-2">
                            <input type="hidden" name="orderId" value={order.id} />
                            <input type="hidden" name="decision" value="approve" />
                            <button type="submit" className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Approve</button>
                          </form>
                          <form action={reviewSubscriptionPayment} className="space-y-2">
                            <input type="hidden" name="orderId" value={order.id} />
                            <input type="hidden" name="decision" value="reject" />
                            <select name="reviewNote" required className="w-full max-w-sm rounded-lg border border-slate-300 px-2.5 py-2 text-xs">
                              <option value="">Choose rejection reason</option>
                              {REJECTION_MESSAGES.map((message) => <option key={message} value={message}>{message}</option>)}
                            </select>
                            <button type="submit" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">Reject</button>
                          </form>
                        </div>
                      ) : proofUrl ? (
                        <a href={proofUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline"><ReceiptText size={14} /> View proof</a>
                      ) : (
                        <span className="text-xs text-slate-400">Waiting</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Card({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><p className="text-sm font-semibold text-slate-500">{label}</p><p className="mt-2 text-3xl font-black text-slate-950 dark:text-white">{value}</p></div>;
}
