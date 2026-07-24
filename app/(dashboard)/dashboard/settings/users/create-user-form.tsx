"use client";

import {
  useActionState,
  useEffect,
  useRef,
} from "react";

import {
  createEmployee,
  type CreateUserState,
} from "./actions";

const initialState: CreateUserState = {
  success: false,
  message: "",
};

export default function CreateUserForm() {
  const formRef =
    useRef<HTMLFormElement>(null);

  const [state, formAction, pending] =
    useActionState(
      createEmployee,
      initialState,
    );

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-4 rounded-xl border bg-white p-5"
    >
      <div>
        <h2 className="text-lg font-semibold">
          Create New User
        </h2>

        <p className="text-sm text-gray-500">
          Create an account for an employee.
        </p>
      </div>

      <div className="space-y-1">
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
          className="w-full rounded-lg border px-3 py-2 outline-none focus:ring-2"
          placeholder="Employee name"
        />
      </div>

      <div className="space-y-1">
        <label
          htmlFor="email"
          className="text-sm font-medium"
        >
          Email
        </label>

        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full rounded-lg border px-3 py-2 outline-none focus:ring-2"
          placeholder="employee@example.com"
        />
      </div>

      <div className="space-y-1">
        <label
          htmlFor="password"
          className="text-sm font-medium"
        >
          Temporary Password
        </label>

        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          className="w-full rounded-lg border px-3 py-2 outline-none focus:ring-2"
          placeholder="Minimum 8 characters"
        />
      </div>

      <div className="space-y-1">
        <label
          htmlFor="role"
          className="text-sm font-medium"
        >
          Role
        </label>

        <select
          id="role"
          name="role"
          defaultValue="cashier"
          className="w-full rounded-lg border px-3 py-2"
        >
          <option value="cashier">
            Cashier
          </option>

          <option value="manager">
            Manager
          </option>

          <option value="admin">
            Admin
          </option>
        </select>
      </div>

      {state.message && (
        <div
          className={
            state.success
              ? "rounded-lg bg-green-50 p-3 text-sm text-green-700"
              : "rounded-lg bg-red-50 p-3 text-sm text-red-700"
          }
        >
          {state.message}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending
          ? "Creating..."
          : "Create User"}
      </button>
    </form>
  );
}