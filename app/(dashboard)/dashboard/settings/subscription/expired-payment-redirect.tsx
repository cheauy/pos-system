"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const REDIRECT_AFTER_MS = 5 * 1000;
const DESTINATION = "/dashboard/settings/subscription";

export default function ExpiredPaymentRedirect({
  expiredAt,
}: {
  expiredAt: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const update = () => {
      const expired = new Date(expiredAt).getTime();
      if (!Number.isFinite(expired)) {
        router.replace(DESTINATION);
        return;
      }

      const redirectAt = expired + REDIRECT_AFTER_MS;
      if (Date.now() >= redirectAt) router.replace(DESTINATION);
    };

    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [expiredAt, router]);

  return null;
}
