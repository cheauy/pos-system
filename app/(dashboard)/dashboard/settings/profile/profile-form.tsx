"use client";

import {
  useActionState,
  useEffect,
  useRef,
} from "react";
import { Save } from "lucide-react";

import {
  updateProfile,
  type UpdateProfileState,
} from "./actions";

type ProfileFormProps = {
  defaultFullName: string;
  email: string;
  role: string;
};

const initialState: UpdateProfileState = {
  success: false,
  message: "",
};

export default function ProfileForm({
  defaultFullName,
  email,
  role,
}: ProfileFormProps) {
  const formRef =
    useRef<HTMLFormElement>(null);

  const [state, formAction, pending] =
    useActionState(
      updateProfile,
      initialState,
    );

  useEffect(() => {
    if (!state.message) {
      return;
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-6 rounded-xl border bg-white p-6 shadow-sm"
    >
      <div>
        <h2 className="text-lg font-semibold">
          Personal Information
        </h2>

        <p className="mt-1 text-sm text-gray-500">
          Update your profile information.
        </p>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="full_name"
          className="text-sm font-medium"
        >
          Full Name
        </label>

        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          minLength={2}
          maxLength={100}
          defaultValue={defaultFullName}
          placeholder="Enter your full name"
          className="w-full rounded-lg border px-3 py-2 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="email"
          className="text-sm font-medium"
        >
          Email
        </label>

        <input
          id="email"
          type="email"
          value={email}
          disabled
          className="w-full cursor-not-allowed rounded-lg border bg-gray-50 px-3 py-2 text-gray-500"
        />

        <p className="text-xs text-gray-500">
          Your login email cannot be changed here.
        </p>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="role"
          className="text-sm font-medium"
        >
          Role
        </label>

        <input
          id="role"
          type="text"
          value={role}
          disabled
          className="w-full cursor-not-allowed rounded-lg border bg-gray-50 px-3 py-2 capitalize text-gray-500"
        />

        <p className="text-xs text-gray-500">
          Only the Owner or Admin can change user roles.
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
            ? "Saving..."
            : "Save Changes"}
        </button>
      </div>
    </form>
  );
}