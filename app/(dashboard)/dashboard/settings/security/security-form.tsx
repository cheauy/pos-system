"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Eye,
  EyeOff,
  KeyRound,
  Save,
} from "lucide-react";

import {
  changePassword,
  type ChangePasswordState,
} from "./actions";

const initialState: ChangePasswordState = {
  success: false,
  message: "",
};

export default function SecurityForm() {
  const formRef =
    useRef<HTMLFormElement>(null);

  const [state, formAction, pending] =
    useActionState(
      changePassword,
      initialState,
    );

  const [
    showCurrentPassword,
    setShowCurrentPassword,
  ] = useState(false);

  const [
    showNewPassword,
    setShowNewPassword,
  ] = useState(false);

  const [
    showConfirmPassword,
    setShowConfirmPassword,
  ] = useState(false);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();

      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
    }
  }, [state.success]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-6 rounded-xl border bg-white p-6 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-blue-50 p-3">
          <KeyRound className="h-5 w-5 text-blue-600" />
        </div>

        <div>
          <h2 className="text-lg font-semibold">
            Change Password
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Choose a strong password for your
            account.
          </p>
        </div>
      </div>

      <PasswordField
        id="current_password"
        name="current_password"
        label="Current Password"
        placeholder="Enter your current password"
        visible={showCurrentPassword}
        onToggle={() =>
          setShowCurrentPassword(
            (current) => !current,
          )
        }
      />

      <PasswordField
        id="new_password"
        name="new_password"
        label="New Password"
        placeholder="Minimum 8 characters"
        visible={showNewPassword}
        onToggle={() =>
          setShowNewPassword(
            (current) => !current,
          )
        }
        minLength={8}
      />

      <PasswordField
        id="confirm_password"
        name="confirm_password"
        label="Confirm New Password"
        placeholder="Enter the new password again"
        visible={showConfirmPassword}
        onToggle={() =>
          setShowConfirmPassword(
            (current) => !current,
          )
        }
        minLength={8}
      />

      <div className="rounded-lg bg-gray-50 p-4">
        <p className="text-sm font-medium">
          Password requirements
        </p>

        <p className="mt-1 text-sm text-gray-500">
          Use at least 8 characters. A combination
          of uppercase letters, lowercase letters,
          numbers, and symbols is recommended.
        </p>
      </div>

      {state.message && (
        <div
          className={
            state.success
              ? "rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700"
              : "rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          }
        >
          {state.message}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-4 w-4" />

          {pending
            ? "Changing..."
            : "Change Password"}
        </button>
      </div>
    </form>
  );
}

type PasswordFieldProps = {
  id: string;
  name: string;
  label: string;
  placeholder: string;
  visible: boolean;
  onToggle: () => void;
  minLength?: number;
};

function PasswordField({
  id,
  name,
  label,
  placeholder,
  visible,
  onToggle,
  minLength,
}: PasswordFieldProps) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="text-sm font-medium"
      >
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          required
          minLength={minLength}
          autoComplete={
            name === "current_password"
              ? "current-password"
              : "new-password"
          }
          placeholder={placeholder}
          className="w-full rounded-lg border px-3 py-2 pr-11 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />

        <button
          type="button"
          onClick={onToggle}
          aria-label={
            visible
              ? `Hide ${label}`
              : `Show ${label}`
          }
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition hover:text-gray-700"
        >
          {visible ? (
            <EyeOff className="h-5 w-5" />
          ) : (
            <Eye className="h-5 w-5" />
          )}
        </button>
      </div>
    </div>
  );
}