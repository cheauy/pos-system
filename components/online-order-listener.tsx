"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";

export default function OnlineOrderListener({
  businessId, branchId,
}: {
  businessId: string; branchId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`dashboard-online-orders:${businessId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `business_id=eq.${businessId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (row.location_id !== branchId) return;
          if (row.order_source !== "online" && row.order_source !== "qr") {
            return;
          }

          if (!pathname.startsWith("/dashboard/online-orders")) {
            playOrderTone();
            toast.success("New online order", {
              description: "A customer order is waiting for confirmation.",
              action: {
                label: "Open",
                onClick: () => router.push("/dashboard/online-orders"),
              },
              duration: 10000,
            });
          }

          router.refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [businessId, branchId, pathname, router]);

  return null;
}

function playOrderTone() {
  try {
    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }).webkitAudioContext;

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
