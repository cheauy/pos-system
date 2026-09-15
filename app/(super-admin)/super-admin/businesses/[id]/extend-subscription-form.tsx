"use client";
import { Loader2 } from "lucide-react";
import {
  useActionState,
  useEffect,
  useState,
} from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import type { ExtendSubscriptionState } from "@/app/(super-admin)/super-admin//businesses/actions";

type ExtendSubscriptionFormProps = {
  businessId: string;
  businessName: string;
  months: number;
  action: (
    previousState: ExtendSubscriptionState,
    formData: FormData,
  ) => Promise<ExtendSubscriptionState>;
};

const initialState: ExtendSubscriptionState = {
  success: false,
  message: "",
  submittedAt: 0,
};

function SubmitButton({
  isConfirmed,
}: {
  isConfirmed: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
  type="submit"
  disabled={!isConfirmed || pending}
  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
>
  {pending ? (
    <>
      <Loader2
        size={17}
        className="animate-spin"
      />
      Extending...
    </>
  ) : (
    "Confirm Extension"
  )}
</button>
  );
}

export function ExtendSubscriptionForm({
  businessId,
  businessName,
  months,
  action,
}: ExtendSubscriptionFormProps) {
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [
    confirmationText,
    setConfirmationText,
  ] = useState("");

  const [state, formAction] = useActionState(
    action,
    initialState,
  );

  const isConfirmed =
    confirmationText.trim().toLowerCase() ===
    businessName.trim().toLowerCase();

  function closeDialog() {
    setIsOpen(false);
    setConfirmationText("");
  }

useEffect(() => {
  if (!state.success || state.submittedAt === 0) {
    return;
  }

  const timeout = window.setTimeout(() => {
    setIsOpen(false);
    setConfirmationText("");
    router.refresh();
  }, 0);

  return () => window.clearTimeout(timeout);
}, [state.success, state.submittedAt, router]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 transition hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700"
      >
        +{months}{" "}
        {months === 1 ? "Month" : "Months"}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-xl font-bold text-slate-900">
              Confirm subscription extension
            </h3>

            <p className="mt-2 text-sm text-slate-600">
              Extend{" "}
              <span className="font-semibold text-slate-900">
                {businessName}
              </span>{" "}
              by{" "}
              <span className="font-semibold text-slate-900">
                {months}{" "}
                {months === 1
                  ? "month"
                  : "months"}
              </span>
              ?
            </p>

            <div className="mt-5">
              <label
                htmlFor={`confirm-${months}`}
                className="block text-sm font-medium text-slate-700"
              >
                Type{" "}
                <span className="font-semibold text-slate-900">
                  {businessName}
                </span>{" "}
                to confirm
              </label>

              <input
                id={`confirm-${months}`}
                type="text"
                value={confirmationText}
                onChange={(event) =>
                  setConfirmationText(
                    event.target.value,
                  )
                }
                placeholder={businessName}
                autoComplete="off"
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {!state.success && state.message && (
              <p className="mt-3 text-sm font-medium text-red-600">
                {state.message}
              </p>
            )}

            <form
              action={formAction}
              className="mt-6 flex gap-3"
            >
              <input
                type="hidden"
                name="businessId"
                value={businessId}
              />

              <input
                type="hidden"
                name="months"
                value={months}
              />

              <input
                type="hidden"
                name="confirmationText"
                value={confirmationText}
              />

              <button
                type="button"
                onClick={closeDialog}
                className="flex-1 rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <SubmitButton
                isConfirmed={isConfirmed}
              />
            </form>
          </div>
        </div>
      )}
    </>
  );
}

