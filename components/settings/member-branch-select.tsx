"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { assignMemberBranch } from "@/app/(dashboard)/dashboard/settings/users/actions";
export default function MemberBranchSelect({ memberId, branchId, branches, disabled }: { memberId: string; branchId: string; branches: { id: string; name: string }[]; disabled: boolean }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const router = useRouter();
  return <div><select aria-label="Assigned branch" disabled={disabled || busy} value={branchId} className="rounded-lg border border-slate-200 bg-white p-2 text-xs" onChange={async e => {
    setBusy(true); setError("");
    try { const result = await assignMemberBranch(memberId, e.target.value); if (!result.success) setError(result.message); else router.refresh(); }
    catch { setError("Unable to save branch."); } finally { setBusy(false); }
  }}><option value="" disabled>Choose branch</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>{error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}</div>;
}
