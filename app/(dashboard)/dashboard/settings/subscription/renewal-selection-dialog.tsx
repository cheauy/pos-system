"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Building2, Check, ShieldCheck, UsersRound, X } from "lucide-react";

export type RenewalMemberOption = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
};

export type RenewalBranchOption = {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
};

type Props = {
  members: RenewalMemberOption[];
  branches: RenewalBranchOption[];
  userLimit: number;
  branchLimit: number;
  initialMemberIds?: string[];
  initialBranchIds?: string[];
  onClose: () => void;
  onApply: (memberIds: string[], branchIds: string[]) => void;
};

function oldestFirst<T extends { createdAt: string; id: string }>(items: T[]) {
  return [...items].sort((a, b) => {
    const byDate = a.createdAt.localeCompare(b.createdAt);
    return byDate || a.id.localeCompare(b.id);
  });
}

export function automaticKeepSelection(
  members: RenewalMemberOption[],
  branches: RenewalBranchOption[],
  userLimit: number,
  branchLimit: number,
) {
  const owners = oldestFirst(members.filter((member) => member.role === "owner"));
  const otherMembers = oldestFirst(members.filter((member) => member.role !== "owner"));
  const keptMembers = [...owners];
  for (const member of otherMembers) {
    if (keptMembers.length >= userLimit) break;
    keptMembers.push(member);
  }

  const defaults = oldestFirst(branches.filter((branch) => branch.isDefault));
  const otherBranches = oldestFirst(branches.filter((branch) => !branch.isDefault));
  const keptBranches = [...defaults];
  if (keptBranches.length === 0 && otherBranches.length > 0) {
    keptBranches.push(otherBranches.shift()!);
  }
  for (const branch of otherBranches) {
    if (keptBranches.length >= branchLimit) break;
    keptBranches.push(branch);
  }

  return {
    memberIds: keptMembers.slice(0, userLimit).map((member) => member.id),
    branchIds: keptBranches.slice(0, branchLimit).map((branch) => branch.id),
  };
}

export default function RenewalSelectionDialog(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const automatic = useMemo(
    () => automaticKeepSelection(props.members, props.branches, props.userLimit, props.branchLimit),
    [props.members, props.branches, props.userLimit, props.branchLimit],
  );
  const ownerIds = useMemo(
    () => new Set(props.members.filter((member) => member.role === "owner").map((member) => member.id)),
    [props.members],
  );
  const defaultBranchIds = useMemo(
    () => new Set(props.branches.filter((branch) => branch.isDefault).map((branch) => branch.id)),
    [props.branches],
  );
  const [memberIds, setMemberIds] = useState<string[]>(
    props.initialMemberIds?.length ? props.initialMemberIds : automatic.memberIds,
  );
  const [branchIds, setBranchIds] = useState<string[]>(
    props.initialBranchIds?.length ? props.initialBranchIds : automatic.branchIds,
  );

  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  function toggleMember(id: string) {
    if (ownerIds.has(id)) return;
    setMemberIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= props.userLimit) return current;
      return [...current, id];
    });
  }

  function toggleBranch(id: string) {
    if (defaultBranchIds.has(id)) return;
    setBranchIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= props.branchLimit) return current;
      return [...current, id];
    });
  }

  const valid =
    memberIds.length === Math.min(props.userLimit, props.members.length) &&
    branchIds.length === Math.min(props.branchLimit, props.branches.length);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="keep-active-title"
      onCancel={props.onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
    >
      <div className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="keep-active-title" className="text-2xl font-black tracking-tight">
              Select Which to Keep Active
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              This is optional. If you do not choose, TENH POS protects the Owner and Main Branch, keeps the oldest active records up to the plan limit, and disables the newest excess users and branches. Nothing is deleted.
            </p>
          </div>
          <button type="button" aria-label="Close selection" onClick={props.onClose} className="rounded-xl p-2 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={20} />
          </button>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <SelectionGroup
            icon={<UsersRound size={19} />}
            title={`Users · keep ${Math.min(props.userLimit, props.members.length)}`}
            description="Owner access is always protected."
          >
            {oldestFirst(props.members).map((member) => {
              const checked = memberIds.includes(member.id);
              const protectedItem = ownerIds.has(member.id);
              const disabled = !checked && memberIds.length >= props.userLimit;
              return (
                <Choice
                  key={member.id}
                  checked={checked}
                  disabled={disabled || protectedItem}
                  protectedItem={protectedItem}
                  title={member.name}
                  detail={`${member.email || "No email"} · ${member.role === "owner" ? "Owner" : member.role}`}
                  onClick={() => toggleMember(member.id)}
                />
              );
            })}
          </SelectionGroup>

          <SelectionGroup
            icon={<Building2 size={19} />}
            title={`Branches · keep ${Math.min(props.branchLimit, props.branches.length)}`}
            description="Main Branch is always protected."
          >
            {oldestFirst(props.branches).map((branch) => {
              const checked = branchIds.includes(branch.id);
              const protectedItem = defaultBranchIds.has(branch.id);
              const disabled = !checked && branchIds.length >= props.branchLimit;
              return (
                <Choice
                  key={branch.id}
                  checked={checked}
                  disabled={disabled || protectedItem}
                  protectedItem={protectedItem}
                  title={branch.name}
                  detail={branch.isDefault ? "Main Branch" : "Branch"}
                  onClick={() => toggleBranch(branch.id)}
                />
              );
            })}
          </SelectionGroup>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={() => {
              setMemberIds(automatic.memberIds);
              setBranchIds(automatic.branchIds);
            }}
            className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Use automatic selection
          </button>
          <div className="flex gap-3">
            <button type="button" onClick={props.onClose} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold dark:border-slate-700">
              Cancel
            </button>
            <button
              type="button"
              disabled={!valid}
              onClick={() => props.onApply(memberIds, branchIds)}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-extrabold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save selection
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}

function SelectionGroup({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
      <div className="border-b border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/50">
        <h3 className="flex items-center gap-2 font-extrabold"><span className="text-blue-600">{icon}</span>{title}</h3>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>
      <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto p-2 dark:divide-slate-800">{children}</div>
    </section>
  );
}

function Choice({ checked, disabled, protectedItem, title, detail, onClick }: { checked: boolean; disabled: boolean; protectedItem: boolean; title: string; detail: string; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition ${checked ? "bg-blue-50 dark:bg-blue-950/30" : "hover:bg-slate-50 dark:hover:bg-slate-800"} disabled:cursor-default disabled:opacity-100`}
    >
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${checked ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-transparent dark:border-slate-600"}`}>
        <Check size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-slate-500">{detail}</span>
      </span>
      {protectedItem ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
          <ShieldCheck size={12} /> Protected
        </span>
      ) : null}
    </button>
  );
}
