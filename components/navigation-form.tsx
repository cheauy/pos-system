"use client";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
export default function NavigationForm({ children, className }: { children: ReactNode; className?: string }) {
  const router = useRouter(); const path = usePathname();
  return <form className={className} onSubmit={e => {
    e.preventDefault(); const query = new URLSearchParams();
    new FormData(e.currentTarget).forEach((value, key) => { if (typeof value === "string") query.set(key, value); });
    router.push(`${path}?${query}`, { scroll: false });
  }}>{children}</form>;
}
