"use client";
import { realtimeTopic } from '@/lib/supabase/realtime-topic';

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { incomingOrderSummary } from "@/app/(dashboard)/dashboard/online-orders/actions";

export const ORDER_ALERTS_KEY = "tenh-order-alerts";
export const ORDER_SOUND_KEY = "tenh-order-sound";
const NEW_ORDERS_HREF = "/dashboard/orders?source=online&status=new";

export default function OnlineOrderListener({
  businessId, branchId, receiveAll = false,
}: {
  businessId: string; branchId: string;
  receiveAll?: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    if (receiveAll) {
      let stopped = false, busy = false;
      let seen: Set<string> | null = null;
      const poll = async () => {
        if (busy || document.visibilityState !== "visible") return;
        busy = true;
        try {
          const orders = await incomingOrderSummary();
          if (stopped) return;
          const fresh = orders.filter(order => seen && !seen.has(order.id));
          seen = new Set(orders.map(order => order.id));
          if (fresh.length) { announceNewOrder(() => router.push(NEW_ORDERS_HREF)); router.refresh(); }
        } catch { /* Preserve the last snapshot during temporary connection failures. */ }
        finally { busy = false; }
      };
      void poll(); const timer = setInterval(() => void poll(), 20000);
      return () => { stopped = true; clearInterval(timer); };
    }
    const supabase = createClient();

    const channel = supabase
      .channel(realtimeTopic(`dashboard-online-orders:${businessId}`))
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders", filter: `business_id=eq.${businessId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (row.location_id !== branchId) return;
          if (row.order_source !== "online" && row.order_source !== "qr") return;
          announceNewOrder(() => router.push(NEW_ORDERS_HREF));
          router.refresh();
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [businessId, branchId, receiveAll, router]);

  return null;
}

function preference(key: string) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function announceNewOrder(open: () => void) {
  if (preference(ORDER_SOUND_KEY) !== "0") playOrderTone();
  toast.success("New online order", {
    description: "A customer order is waiting for confirmation.",
    action: { label: "View", onClick: open },
    duration: 10000,
  });
  if (preference(ORDER_ALERTS_KEY) === "1" && "Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
    try {
      const notice = new Notification("Tenh POS - New online order", { body: "Open Orders to confirm the new customer order." });
      notice.onclick = () => { window.focus(); open(); notice.close(); };
    } catch { /* Some browsers only allow notifications from a service worker. */ }
  }
}

function playOrderTone() {
  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const gain = context.createGain();
    gain.gain.value = 0.05;
    gain.connect(context.destination);
    [740, 940].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      const start = context.currentTime + index * 0.12;
      oscillator.start(start);
      oscillator.stop(start + 0.09);
    });
  } catch {
    // Browsers can block audio until the user interacts with the page.
  }
}
