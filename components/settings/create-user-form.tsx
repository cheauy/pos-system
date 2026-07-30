"use client";

import {
  useActionState,
  useState,
} from "react";
import {
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  User,
  UserPlus,
} from "lucide-react";

import {
  createBusinessUser,
} from "@/app/(dashboard)/dashboard/settings/users/actions";
import {
  initialUserActionState,
} from "@/app/(dashboard)/dashboard/settings/users/state";
import {
  getAssignableRoles,
} from "@/lib/auth/user-role-options";
import type {
  BusinessRole,
} from "@/lib/business/types";

type Props = {
  currentRole: BusinessRole;
};

export default function CreateBusinessUserForm({
  currentRole,
}: Props) {
  const [state, formAction, pending] =
    useActionState(
      createBusinessUser,
      initialUserActionState,
    );

  const [showPassword, setShowPassword] =
    useState(false);

  const [
    showConfirmPassword,
    setShowConfirmPassword,
  ] = useState(false);

  const roles =
    getAssignableRoles(currentRole);

  if (roles.length === 0) {
    return null;
  }

  return (
    <section className="h-fit overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <UserPlus size={21} />
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Create User
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Add a new user to this business
            </p>
          </div>
        </div>
      </div>

      <form
        action={formAction}
        className="space-y-5 p-6"
      >
        <FormField
          label="Full name"
          htmlFor="fullName"
        >
          <div className="relative">
            <User
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              id="fullName"
              name="fullName"
              type="text"
              required
              minLength={2}
              className={inputWithIconClass}
              placeholder="Enter full name"
            />
          </div>
        </FormField>

        <FormField
          label="Email address"
          htmlFor="email"
        >
          <div className="relative">
            <Mail
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="off"
              className={inputWithIconClass}
              placeholder="user@example.com"
            />
          </div>
        </FormField>

        <FormField
          label="Temporary password"
          htmlFor="password"
        >
          <div className="relative">
            <LockKeyhole
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              id="password"
              name="password"
              type={
                showPassword
                  ? "text"
                  : "password"
              }
              required
              minLength={8}
              autoComplete="new-password"
              className={passwordInputClass}
              placeholder="At least 8 characters"
            />

            <button
              type="button"
              onClick={() =>
                setShowPassword(
                  (current) => !current,
                )
              }
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label={
                showPassword
                  ? "Hide password"
                  : "Show password"
              }
            >
              {showPassword ? (
                <EyeOff size={18} />
              ) : (
                <Eye size={18} />
              )}
            </button>
          </div>
        </FormField>

        <FormField
          label="Confirm password"
          htmlFor="confirmPassword"
        >
          <div className="relative">
            <LockKeyhole
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              id="confirmPassword"
              name="confirmPassword"
              type={
                showConfirmPassword
                  ? "text"
                  : "password"
              }
              required
              minLength={8}
              autoComplete="new-password"
              className={passwordInputClass}
              placeholder="Enter password again"
            />

            <button
              type="button"
              onClick={() =>
                setShowConfirmPassword(
                  (current) => !current,
                )
              }
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label={
                showConfirmPassword
                  ? "Hide password"
                  : "Show password"
              }
            >
              {showConfirmPassword ? (
                <EyeOff size={18} />
              ) : (
                <Eye size={18} />
              )}
            </button>
          </div>
        </FormField>

        <FormField
          label="Role"
          htmlFor="role"
        >
          <select
            id="role"
            name="role"
            required
            defaultValue=""
            className={inputClass}
          >
            <option value="" disabled>
              Select user role
            </option>

            {roles.map((role) => (
              <option
                key={role}
                value={role}
              >
                {formatText(role)}
              </option>
            ))}
          </select>
        </FormField>

        {state.message && (
          <div
            className={
              state.success
                ? successClass
                : errorClass
            }
          >
            {state.message}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? (
            <>
              <Loader2
                size={18}
                className="animate-spin"
              />
              Creating...
            </>
          ) : (
            <>
              <UserPlus size={18} />
              Create User
            </>
          )}
        </button>
      </form>
    </section>
  );
}

function FormField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-sm font-semibold text-slate-700"
      >
        {label}
      </label>

      {children}
    </div>
  );
}

function formatText(value: string) {
  return value
    .split("_")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1),
    )
    .join(" ");
}

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

const inputWithIconClass =
  "w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

const passwordInputClass =
  "w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-12 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

const successClass =
  "rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700";

const errorClass =
  "rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700";