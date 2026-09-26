"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { useActivity } from '@/components/ui/activity-link';
export default function ViewBranchSelect({ branches, branchId }: { branches: { id: string; name: string; is_active?: boolean }[]; branchId: string }) {
  const router = useRouter(); const path = usePathname(); const search = useSearchParams(); const [pending, startTransition] = useTransition();
  useActivity(pending);
  return <label className="text-xs font-semibold text-slate-500">Choose Branch
    <select aria-label="View data for branch" disabled={pending} value={branchId} onChange={e => {
      const query = new URLSearchParams(search.toString()); query.set("branch", e.target.value || "all");
      startTransition(() => router.push(`${path}?${query}`, { scroll: false }));
    }} className="mt-1 block min-w-56 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"><option value="">All branches</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}{b.is_active === false ? " (inactive)" : ""}</option>)}</select>
  </label>;
}
