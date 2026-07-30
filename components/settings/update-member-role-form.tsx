"use client";

import {
  useActionState,
  useState,
} from "react";

import {
  updateBusinessUserRole,
} from "@/app/(dashboard)/dashboard/settings/users/actions";




import type {
  BusinessRole,
} from "@/lib/business/types";

export type UserActionState = {
  success: boolean;
  message: string;
  updatedRole?: BusinessRole;
};

export const initialUserActionState: UserActionState = {
  success: false,
  message: "",
};



type Props = {
  memberId: string;
  currentMemberRole: BusinessRole;
  loggedInRole: BusinessRole;
};

export default function UpdateMemberRoleForm({
  memberId,
  currentMemberRole,
  loggedInRole,
}: Props) {
  const [selectedRole, setSelectedRole] =
    useState<BusinessRole>(
      currentMemberRole,
    );

  const [state, formAction, pending] =
    useActionState(
      updateBusinessUserRole,
      initialUserActionState,
    );

  const savedRole =
    state.success && state.updatedRole
      ? state.updatedRole
      : currentMemberRole;

  const roleOptions =
    loggedInRole === "owner"
      ? [
          "admin",
          "manager",
          "cashier",
        ]
      : ["manager", "cashier"];

  return (
    <form
      action={formAction}
      className="flex flex-col items-start"
    >
      <input
        type="hidden"
        name="memberId"
        value={memberId}
      />

      <div className="flex items-center gap-2">
        <select
          name="role"
          value={selectedRole}
          disabled={pending}
          onChange={(event) =>
            setSelectedRole(
              event.target
                .value as BusinessRole,
            )
          }
          className="rounded-lg border border-slate-300 bg-white px-3 py-2"
        >
          {roleOptions.map((role) => (
            <option
              key={role}
              value={role}
            >
              {role.charAt(0).toUpperCase() +
                role.slice(1)}
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={
            pending ||
            selectedRole === savedRole
          }
          className="rounded-lg bg-slate-900 px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Saving..." : "Save"}
        </button>
      </div>

      {state.message && (
        <p
          className={[
            "mt-2 text-xs",
            state.success
              ? "text-emerald-600"
              : "text-red-600",
          ].join(" ")}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
