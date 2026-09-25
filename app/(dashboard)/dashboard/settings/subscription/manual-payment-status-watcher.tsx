"use client";

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

    const refresh = () => {
      router.refresh();
    };

    // Realtime gives the payment page an immediate update when TENH approves
    // or rejects a submitted manual payment. The polling fallback keeps this
    // safe when Realtime is temporarily unavailable or disabled for the table.
    const channel = supabase
      .channel(`subscription-payment:${orderId}`)
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
      .subscribe();

    const timer = window.setInterval(refresh, 4000);

    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [orderId, router, kind]);

  return null;
}
