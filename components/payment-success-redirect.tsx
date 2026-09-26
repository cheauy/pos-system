"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function PaymentSuccessRedirect({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  const [seconds, setSeconds] = useState(5);
  useEffect(() => {
    const countdown = window.setInterval(() => setSeconds(value => Math.max(0, value - 1)), 1000);
    const redirect = window.setTimeout(() => router.replace(href), 5000);
    return () => { window.clearInterval(countdown); window.clearTimeout(redirect); };
  }, [href, router]);
  return <p role="status" className="my-4 text-sm text-emerald-700 dark:text-emerald-300">Payment approved. Returning to {label} in {seconds} seconds.</p>;
}
