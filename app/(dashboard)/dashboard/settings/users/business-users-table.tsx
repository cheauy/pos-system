"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Clock3, Filter, Search, ShieldCheck, Users } from "lucide-react";

import type { BusinessRole } from "@/lib/business/types";
import UpdateMemberRoleForm from "@/components/settings/update-member-role-form";
import DeleteUserButton from "./delete-user-button";
import { ToggleUserStatusButton } from "./user-status-button";

export type BusinessUserRow = {
  id: string;
  userId: string;
  role: BusinessRole;
  isActive: boolean;
  createdAt: string;
  fullName: string;
  email: string;
  lastSignInAt: string | null;
  pendingInvite: boolean;
};

type FilterStatus = "all" | "active" | "disabled";
type SortMode = "last_active" | "newest" | "oldest";

export default function BusinessUsersTable({
  users,
  loggedInRole,
}: {
  users: BusinessUserRow[];
  loggedInRole: BusinessRole;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<FilterStatus>("all");
  const [role, setRole] = useState("all");
  const [sort, setSort] = useState<SortMode>("last_active");

  const activeCount = users.filter((user) => user.isActive && !user.pendingInvite).length;
  const disabledCount = users.filter((user) => !user.isActive).length;

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return users
      .filter((user) => {
        if (normalized && !`${user.fullName} ${user.email}`.toLowerCase().includes(normalized)) return false;
        if (status === "active" && (!user.isActive || user.pendingInvite)) return false;
        if (status === "disabled" && user.isActive) return false;
        if (role !== "all" && user.role !== role) return false;
        return true;
      })
      .sort((a, b) => {
        if (sort === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (sort === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        const aLast = a.lastSignInAt ? new Date(a.lastSignInAt).getTime() : 0;
        const bLast = b.lastSignInAt ? new Date(b.lastSignInAt).getTime() : 0;
        return bLast - aLast;
      });
  }, [query, role, sort, status, users]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 dark:border-slate-800 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
            <ShieldCheck size={18} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-950 dark:text-white">Business Users</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Manage roles, account access and users</p>
          </div>
        </div>

        <div className="inline-flex w-fit rounded-xl bg-slate-100 p-1 text-xs font-semibold dark:bg-slate-800">
          <Tab active={status === "all"} onClick={() => setStatus("all")}>All ({users.length})</Tab>
          <Tab active={status === "active"} onClick={() => setStatus("active")}>Active ({activeCount})</Tab>
          <Tab active={status === "disabled"} onClick={() => setStatus("disabled")}>Disabled ({disabledCount})</Tab>
        </div>
      </div>

      <div className="grid gap-3 border-b border-slate-200 p-4 dark:border-slate-800 md:grid-cols-[minmax(0,1fr)_170px_180px_44px]">
        <label className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search users by name or email..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:focus:ring-blue-950/40"
          />
        </label>

        <select value={role} onChange={(event) => setRole(event.target.value)} className={selectClass}>
          <option value="all">All roles</option>
          <option value="owner">Owner</option>
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="cashier">Cashier</option>
        </select>

        <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)} className={selectClass}>
          <option value="last_active">Last active</option>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>

        <button
          type="button"
          onClick={() => { setQuery(""); setRole("all"); setStatus("all"); setSort("last_active"); }}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          aria-label="Reset user filters"
        >
          <Filter size={17} />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1050px]">
          <thead className="bg-slate-50/80 dark:bg-slate-950/40">
            <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3.5">User</th>
              <th className="px-5 py-3.5">Role</th>
              <th className="px-5 py-3.5">Status</th>
              <th className="px-5 py-3.5">Created</th>
              <th className="px-5 py-3.5">Last active</th>
              <th className="px-5 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {filtered.map((member) => {
              const canManage = member.role !== "owner" && (
                loggedInRole === "owner" ||
                (loggedInRole === "admin" && ["manager", "cashier"].includes(member.role))
              );

              return (
                <tr key={member.id} className="align-top transition hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
                        {getInitials(member.fullName)}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{member.fullName}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{member.email}</p>
                      </div>
                    </div>
                  </td>

                  <td className="px-5 py-4">
                    {member.role === "owner" ? (
                      <span className="inline-flex rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">Owner</span>
                    ) : canManage ? (
                      <UpdateMemberRoleForm memberId={member.id} currentMemberRole={member.role} loggedInRole={loggedInRole} />
                    ) : (
                      <span className="inline-flex rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{formatRole(member.role)}</span>
                    )}
                  </td>

                  <td className="px-5 py-4"><StatusBadge member={member} /></td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <CalendarDays size={15} className="text-slate-400" />{formatDate(member.createdAt)}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <Clock3 size={15} className="text-slate-400" />{formatLastActive(member.lastSignInAt, member.pendingInvite)}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1">
                      {canManage ? (
                        <>
                          <ToggleUserStatusButton memberId={member.id} isActive={member.isActive} />
                          {loggedInRole === "owner" ? (
                            <DeleteUserButton memberId={member.id} userName={member.fullName} />
                          ) : null}
                        </>
                      ) : (
                        <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500 dark:bg-slate-800">Protected</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-16 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-500 dark:bg-blue-950/40"><Users size={26} /></div>
                  <p className="mt-4 font-semibold text-slate-900 dark:text-white">No users match these filters</p>
                  <p className="mt-1 text-sm text-slate-500">Clear the filters or create another user.</p>
                  <a href="#create-user" className="mt-4 inline-flex items-center rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 dark:border-blue-900 dark:hover:bg-blue-950/30">Add another user</a>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={["rounded-lg px-3 py-1.5 transition", active ? "bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-300" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"].join(" ")}
    >
      {children}
    </button>
  );
}

function StatusBadge({ member }: { member: BusinessUserRow }) {
  if (member.pendingInvite) {
    return <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"><span className="h-2 w-2 rounded-full bg-amber-500" />Pending invite</span>;
  }
  return (
    <span className={member.isActive ? "inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-300"}>
      <span className={member.isActive ? "h-2 w-2 rounded-full bg-emerald-500" : "h-2 w-2 rounded-full bg-red-500"} />
      {member.isActive ? "Active" : "Disabled"}
    </span>
  );
}

function getInitials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");
}
function formatRole(role: BusinessRole) { return role.charAt(0).toUpperCase() + role.slice(1); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)); }
function formatLastActive(value: string | null, pendingInvite: boolean) {
  if (pendingInvite) return "Invite pending";
  if (!value) return "Never";
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (diff >= 0 && diff < 24 * 60 * 60 * 1000) return "Today";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

const selectClass = "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:focus:ring-blue-950/40";
