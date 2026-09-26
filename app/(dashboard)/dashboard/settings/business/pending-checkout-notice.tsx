"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function PendingCheckoutNotice({ order }: { order: {id: string; status: string; payment_expires_at: string | null; created_at: string} }) {
  const [expired, setExpired] = useState(false);
  const pending = order.status === "pending_payment";
  const expiresAt = order.payment_expires_at ?? new Date(new Date(order.created_at).getTime() + 600_000).toISOString();
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setExpired(true), Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    return () => window.clearTimeout(timer);
  }, [pending, expiresAt]);
  if (expired && pending) return null;
  return <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30"><p className="text-sm font-semibold">{pending ? "You have an unfinished checkout." : "Your payment is awaiting review."}</p><Link href={`/dashboard/settings/business/payment/${order.id}`} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">{pending ? "Continue checkout" : "View payment"}</Link></div>;
}
