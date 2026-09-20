"use client";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Store } from "lucide-react";
import { switchOperatingBranch } from "./branch-actions";

const sharedRoutes = ["stock-transfers", "categories", "online-store", "products", "inventory", "locations", "settings"];
export default function BranchSwitcher({ branches, branchId }: { branches: { id: string; name: string }[]; branchId: string }) {
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const segment = pathname.split("/")[2] ?? "";
  if (!segment || ["reports", "expenses", "pos", ...sharedRoutes].includes(segment)) return null;
  return <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
    <label className="text-xs font-semibold text-slate-500"><span className="mb-1 flex items-center gap-2"><Store size={15}/> Operating branch</span>
      <select aria-label="Switch operating branch" value={branchId} disabled={busy} className="min-w-60 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900" onChange={async e => {
        const next = e.target.value;
        // Changing the operating context discards form drafts across this screen.
        if (!window.confirm("Switch branch? Save any unfinished work before continuing.")) return;
        setBusy(true); setError("");
        try { const result = await switchOperatingBranch(next); if (!result.success) { setError(result.message); setBusy(false); } else window.location.reload(); }
        catch { setError("Unable to switch branch. Please retry."); setBusy(false); }
      }}>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
    </label>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </div>;
}
