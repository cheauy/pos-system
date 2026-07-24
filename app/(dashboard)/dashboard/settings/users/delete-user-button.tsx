"use client";

import {
  useState,
  useTransition,
} from "react";
import { Trash2 } from "lucide-react";

import { deleteEmployee } from "./actions";

type DeleteUserButtonProps = {
  userId: string;
  userName: string;
  disabled?: boolean;
};

export default function DeleteUserButton({
  userId,
  userName,
  disabled = false,
}: DeleteUserButtonProps) {
  const [isPending, startTransition] =
    useTransition();

  const [message, setMessage] =
    useState("");

  async function handleDelete() {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${userName}"?\n\nThis action cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    setMessage("");

    startTransition(async () => {
      const result =
        await deleteEmployee(userId);

      setMessage(result.message);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleDelete}
        disabled={disabled || isPending}
        className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" />

        {isPending ? "Deleting..." : "Delete"}
      </button>

      {message && (
        <p className="max-w-[220px] text-right text-xs text-gray-500">
          {message}
        </p>
      )}
    </div>
  );
}