"use client";

import { useActionState, useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, LockKeyhole, Mail, User, UserPlus } from "lucide-react";

import { createBusinessUser } from "@/app/(dashboard)/dashboard/settings/users/actions";
import { initialUserActionState } from "@/app/(dashboard)/dashboard/settings/users/state";
import { getAssignableRoles } from "@/lib/auth/user-role-options";
import type { BusinessRole } from "@/lib/business/types";

type Props = { currentRole: BusinessRole; branches: {id:string;name:string}[] };

export default function CreateBusinessUserForm({ currentRole, branches }: Props) {
  const [state, formAction, pending] = useActionState(
    createBusinessUser,
    initialUserActionState,
  );

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState("");
  const [sendInviteEmail, setSendInviteEmail] = useState(true);
  const [requirePasswordChange, setRequirePasswordChange] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const roles = getAssignableRoles(currentRole);

  useEffect(() => {
    if (!state.success) return;
    setFullName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setRole("");
    setSendInviteEmail(true);
    setRequirePasswordChange(true);
  }, [state.success, state.message]);

  if (roles.length === 0) return null;

  return (
    <section
      id="create-user"
      className="h-fit overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="border-b border-slate-200 p-5 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
            <UserPlus size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-950 dark:text-white">Create User</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Add a new user to this business
            </p>
          </div>
        </div>
      </div>

      <form action={formAction} className="space-y-4 p-5">
        <FormField label="Full name" htmlFor="fullName">
          <div className="relative">
            <User className={iconClass} size={16} />
            <input
              id="fullName"
              name="fullName"
              type="text"
              required
              minLength={2}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className={inputWithIconClass}
              placeholder="Enter full name"
            />
          </div>
        </FormField>

        <FormField label="Email address" htmlFor="email">
          <div className="relative">
            <Mail className={iconClass} size={16} />
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputWithIconClass}
              placeholder="user@example.com"
            />
          </div>
        </FormField>

        <FormField label="Temporary password" htmlFor="password">
          <div className="relative">
            <LockKeyhole className={iconClass} size={16} />
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={passwordInputClass}
              placeholder="At least 8 characters"
            />
            <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((current) => !current)} />
          </div>
        </FormField>

        <FormField label="Confirm password" htmlFor="confirmPassword">
          <div className="relative">
            <LockKeyhole className={iconClass} size={16} />
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className={passwordInputClass}
              placeholder="Enter password again"
            />
            <PasswordToggle
              shown={showConfirmPassword}
              onToggle={() => setShowConfirmPassword((current) => !current)}
            />
          </div>
        </FormField>

        <FormField label="Assigned branch" htmlFor="branchId"><select id="branchId" name="branchId" required defaultValue={branches[0]?.id ?? ""} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"><option value="" disabled>Choose branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></FormField>
        <FormField label="Role" htmlFor="role">
          <select
            id="role"
            name="role"
            required
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className={inputClass}
          >
            <option value="" disabled>Select user role</option>
            {roles.map((roleOption) => (
              <option key={roleOption} value={roleOption}>{formatText(roleOption)}</option>
            ))}
          </select>
        </FormField>

        <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            name="sendInviteEmail"
            checked={sendInviteEmail}
            onChange={(event) => {
              setSendInviteEmail(event.target.checked);
              if (event.target.checked) setRequirePasswordChange(true);
            }}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-600"
          />
          <span>
            <strong className="block font-semibold text-slate-800 dark:text-slate-100">Send invite email</strong>
            <span className="mt-0.5 block text-xs leading-5 text-slate-500">
              TENH sends a secure password setup link to this email.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            name="requirePasswordChange"
            checked={sendInviteEmail || requirePasswordChange}
            disabled={sendInviteEmail}
            onChange={(event) => setRequirePasswordChange(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-600 disabled:opacity-60"
          />
          <span>
            <strong className="block font-semibold text-slate-800 dark:text-slate-100">
              Require password change on first login
            </strong>
            <span className="mt-0.5 block text-xs leading-5 text-slate-500">
              {sendInviteEmail
                ? "Required when an invite email is sent."
                : "The temporary password cannot be kept permanently."}
            </span>
          </span>
        </label>

        {state.message && (
          <div className={state.success ? successClass : errorClass}>{state.message}</div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? (
            <><Loader2 size={18} className="animate-spin" />Creating...</>
          ) : (
            <><UserPlus size={18} />Create User</>
          )}
        </button>
      </form>
    </section>
  );
}

function PasswordToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
      aria-label={shown ? "Hide password" : "Show password"}
    >
      {shown ? <EyeOff size={17} /> : <Eye size={17} />}
    </button>
  );
}

function FormField({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200">
        {label}
      </label>
      {children}
    </div>
  );
}

function formatText(value: string) {
  return value.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

const iconClass = "pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400";
const inputClass = "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-blue-950/40";
const inputWithIconClass = "w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-blue-950/40";
const passwordInputClass = "w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-11 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-blue-950/40";
const successClass = "rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300";
const errorClass = "rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300";
