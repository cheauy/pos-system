"use client";

import {
  useActionState,
  useEffect,
  useState,
} from "react";
import {
  Loader2,
  Power,
  PowerOff,
} from "lucide-react";

import {
  toggleBusinessUserStatus,
} from "./actions";
import {
  initialUserStatusActionState,
} from "./state";

type Props = {
  memberId: string;
  isActive: boolean;
};

export function ToggleUserStatusButton({
  memberId,
  isActive,
}: Props) {
  const [
    state,
    formAction,
    pending,
  ] = useActionState(
    toggleBusinessUserStatus,
    initialUserStatusActionState,
  );

  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!visible || pending || !state.message) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setVisible(false);
    }, state.success ? 3000 : 5000);

    return () => window.clearTimeout(timeout);
  }, [
    pending,
    state.message,
    state.success,
    visible,
  ]);

  function handleAction(formData: FormData) {
    setVisible(true);
    formAction(formData);
  }

  return (
    <div className="flex flex-col items-end">
      <form action={handleAction}>
        <input
          type="hidden"
          name="memberId"
          value={memberId}
        />

        <button
          type="submit"
          disabled={pending}
          className={
            isActive
              ? disableButtonClass
              : enableButtonClass
          }
        >
          {pending ? (
            <>
              <Loader2
                size={16}
                className="animate-spin"
              />

              Updating...
            </>
          ) : isActive ? (
            <>
              <PowerOff size={16} />
              Disable
            </>
          ) : (
            <>
              <Power size={16} />
              Enable
            </>
          )}
        </button>
      </form>

    {visible && !pending && state.message && (
  <div
    className={[
      "fixed bottom-6 left-1/2 z-50 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 rounded-xl border px-5 py-4 shadow-lg",
      state.success
        ? "border-emerald-200 bg-emerald-50"
        : "border-amber-200 bg-amber-50",
    ].join(" ")}
  >
    <div className="flex items-start justify-between gap-3">
    <p
      className={[
        "text-sm font-medium",
        state.success
          ? "text-emerald-700"
          : "text-amber-700",
      ].join(" ")}
    >
      {state.success ? "✓ " : "⚠ "}
      {state.message}
    </p>
    <button
    type="button"
    onClick={() => setVisible(false)}
    aria-label="Close notification"
    className="text-slate-400 hover:text-slate-700"
  >
    ✕
  </button>
  </div>
    
  </div>
  
)}
    </div>
  );
}

const disableButtonClass =
  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60";

const enableButtonClass =
  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60";
