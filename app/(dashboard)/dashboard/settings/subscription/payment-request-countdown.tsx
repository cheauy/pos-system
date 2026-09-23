"use client";

import { Clock3 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { expireSubscriptionPaymentRequest } from "./actions";

function formatRemaining(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function PaymentRequestCountdown({
  orderId,
  expiresAt,
  initialRemainingSeconds,
  variant = "inline",
}: {
  orderId: string;
  expiresAt: string;
  initialRemainingSeconds: number;
  variant?: "inline" | "panel";
}) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(Math.max(0, initialRemainingSeconds));
  const [isPending, startTransition] = useTransition();
  const expiryAttempted = useRef(false);

  useEffect(() => {
    const update = () => {
      const timestamp = new Date(expiresAt).getTime();
      const next = Number.isFinite(timestamp)
        ? Math.max(0, Math.ceil((timestamp - Date.now()) / 1000))
        : 0;
      setRemaining(next);

      if (next === 0 && !expiryAttempted.current) {
        expiryAttempted.current = true;
        startTransition(async () => {
          try {
            await expireSubscriptionPaymentRequest(orderId);
          } finally {
            router.refresh();
          }
        });
      }
    };

    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt, orderId, router]);

  const label =
    remaining > 0
      ? `Expires in ${formatRemaining(remaining)}`
      : isPending
        ? "Checking payment status…"
        : "Payment window ended";

  if (variant === "panel") {
    return (
      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        <span className="flex items-center gap-2 text-xs font-bold">
          <Clock3 size={15} />
          10-minute payment request
        </span>
        <span className="font-mono text-sm font-black tabular-nums">{label}</span>
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700 ring-1 ring-inset ring-amber-600/10 dark:bg-amber-950/30 dark:text-amber-300">
      <Clock3 size={12} />
      <span className="font-mono tabular-nums">{label}</span>
    </span>
  );
}
