"use client";
import { usePathname, useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { useActivity } from '@/components/ui/activity-link';
export default function NavigationForm({ children, className }: { children: ReactNode; className?: string }) {
  const router = useRouter(); const path = usePathname();
  const [pending, startTransition] = useTransition();
  useActivity(pending);
  return <form className={className} onSubmit={e => {
    e.preventDefault(); const query = new URLSearchParams();
    new FormData(e.currentTarget).forEach((value, key) => { if (typeof value === "string") query.set(key, value); });
    startTransition(() => router.push(`${path}?${query}`, { scroll: false }));
  }}>{children}</form>;
}
