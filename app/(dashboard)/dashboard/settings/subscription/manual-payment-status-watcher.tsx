"use client";
import { realtimeTopic } from '@/lib/supabase/realtime-topic';

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { createClient } from "@/lib/supabase/client";

export default function ManualPaymentStatusWatcher({
  orderId,
  kind='subscription',
}: {
  orderId: string;
  kind?: 'subscription'|'business_change';
}) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    let live = false;
    let lastRefresh = Date.now();
    const refresh = () => {
      lastRefresh = Date.now();
      router.refresh();
    };

    // Realtime gives the payment page an immediate update when TENH approves
    // or rejects a submitted manual payment. Each refresh re-renders the whole
    // payment page, so poll every 4s only while Realtime is not subscribed and
    // fall back to a 30s safety net once it is. Hidden tabs skip ticks and
    // reconcile once when the owner comes back (payment app return/resume).
    const tick = () => {
      if (document.hidden) return;
      if (Date.now() - lastRefresh >= (live ? 30000 : 4000) - 100) refresh();
    };
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    const channel = supabase
      .channel(realtimeTopic(`subscription-payment:${orderId}`))
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: kind==='business_change'?'business_change_orders':"subscription_orders",
          filter: `id=eq.${orderId}`,
        },
        refresh,
      )
      .subscribe((status) => {
        live = status === "SUBSCRIBED";
      });

    const timer = window.setInterval(tick, 4000);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [orderId, router, kind]);

  return null;
}
