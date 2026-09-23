"use client";

import {
  useEffect,
  useState,
  useTransition,
} from "react";
import {
  AlertTriangle,
  Loader2,
  Trash2,
  X,
} from "lucide-react";

import {
  deleteBusinessUser,
} from "./actions";

type Props = {
  memberId: string;
  userName: string;
};

export default function DeleteUserButton({
  memberId,
  userName,
}: Props) {
  const [open, setOpen] =
    useState(false);

  const [confirmation, setConfirmation] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [isPending, startTransition] =
    useTransition();

  const isConfirmed =
    confirmation.trim() === userName;

  const [successMessage, setSuccessMessage] =
  useState("");

  useEffect(() => {
    if (!successMessage) return;

    const timeout = window.setTimeout(() => {
      setSuccessMessage("");
    }, 3000);

    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  function closeDialog() {
    if (isPending) return;

    setOpen(false);
    setConfirmation("");
    setMessage("");
  }

  function handleDelete() {
    if (!isConfirmed) return;

    const formData = new FormData();

    startTransition(async () => {
      try {
        setMessage("");
        formData.set(
          "memberId",
          memberId,
        );
        await deleteBusinessUser(
          formData,
        );

        setOpen(false);
        setConfirmation("");
        setMessage("");
        setSuccessMessage(
          `${userName} was deleted. Historical business records were kept.`,
        );
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to delete this user.",
        );
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
      >
        <Trash2 size={16} />
        Delete user
      </button>
{successMessage && (
  <div className="fixed bottom-6 left-1/2 z-[120] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 shadow-lg">
    <div className="flex items-start justify-between gap-3">
      <p className="text-sm font-medium text-emerald-700">
        ✓ {successMessage}
      </p>

      <button
        type="button"
        onClick={() => setSuccessMessage("")}
        className="text-emerald-500 transition hover:text-emerald-800"
        aria-label="Close notification"
      >
        ✕
      </button>
    </div>
  </div>
)}
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
          onClick={closeDialog}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <AlertTriangle size={22} />
              </div>

              <button
                type="button"
                disabled={isPending}
                onClick={closeDialog}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>

            <h2 className="mt-5 text-xl font-bold text-slate-900">
              Delete user?
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              This will remove{" "}
              <strong>{userName}</strong>{" "}
              and their login account permanently. Historical business records are kept, with ownership transferred to the business Owner.
            </p>

            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700">
                Accounts belonging to another business cannot be deleted here. Close any open register before deleting.
              </p>
            </div>

            <div className="mt-5">
              <label
                htmlFor={`delete-${memberId}`}
                className="block text-sm font-semibold text-slate-700"
              >
                Type{" "}
                <span className="text-red-600">
                  {userName}
                </span>{" "}
                to confirm
              </label>

              <input
                id={`delete-${memberId}`}
                value={confirmation}
                onChange={(event) =>
                  setConfirmation(
                    event.target.value,
                  )
                }
                autoComplete="off"
                placeholder={userName}
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-100"
              />
            </div>

            {message && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {message}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={isPending}
                onClick={closeDialog}
                className="rounded-xl border border-slate-300 px-4 py-2.5 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={
                  isPending ||
                  !isConfirmed
                }
                onClick={handleDelete}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
              >
                {isPending ? (
                  <Loader2
                    size={17}
                    className="animate-spin"
                  />
                ) : (
                  <Trash2 size={17} />
                )}

                {isPending
                  ? "Deleting..."
                  : "Delete User"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
