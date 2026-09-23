"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Settings2 } from "lucide-react";

import { saveScheduledRenewalSelection } from "./actions";
import RenewalSelectionDialog, {
  type RenewalBranchOption,
  type RenewalMemberOption,
} from "./renewal-selection-dialog";

type Props = {
  orderId: string;
  userLimit: number;
  branchLimit: number;
  members: RenewalMemberOption[];
  branches: RenewalBranchOption[];
  initialMemberIds: string[] | null;
  initialBranchIds: string[] | null;
};

export default function ScheduledRenewalSelection(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [memberIds, setMemberIds] = useState<string[] | null>(props.initialMemberIds);
  const [branchIds, setBranchIds] = useState<string[] | null>(props.initialBranchIds);

  const needsSelection =
    props.members.length > props.userLimit || props.branches.length > props.branchLimit;

  if (!needsSelection) return null;

  function save(nextMemberIds: string[], nextBranchIds: string[]) {
    setError("");
    startTransition(async () => {
      try {
        const data = new FormData();
        data.set("orderId", props.orderId);
        for (const id of nextMemberIds) data.append("keepMemberId", id);
        for (const id of nextBranchIds) data.append("keepBranchId", id);
        await saveScheduledRenewalSelection(data);
        setMemberIds(nextMemberIds);
        setBranchIds(nextBranchIds);
        setOpen(false);
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to save the selection.");
      }
    });
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        disabled={pending}
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-blue-300 bg-white px-4 py-2.5 text-sm font-extrabold text-blue-700 transition hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-300"
      >
        {pending ? <Loader2 size={16} className="animate-spin" /> : <Settings2 size={16} />}
        {memberIds?.length || branchIds?.length ? "Change selection" : "Select Which to Keep Active"}
      </button>
      <p className="mt-2 text-xs leading-5 text-blue-700/80 dark:text-blue-300/80">
        Optional. Without a selection, TENH POS protects the Owner and Main Branch, keeps the oldest allowed records, and disables the newest excess users and branches automatically.
      </p>
      {error ? <p role="alert" className="mt-2 text-xs font-semibold text-red-600">{error}</p> : null}

      {open ? (
        <RenewalSelectionDialog
          members={props.members}
          branches={props.branches}
          userLimit={props.userLimit}
          branchLimit={props.branchLimit}
          initialMemberIds={memberIds ?? undefined}
          initialBranchIds={branchIds ?? undefined}
          onClose={() => setOpen(false)}
          onApply={save}
        />
      ) : null}
    </div>
  );
}
