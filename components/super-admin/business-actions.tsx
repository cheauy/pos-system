"use client";
import { useFormStatus } from "react-dom";
import {
  useEffect,
  useState,
  useTransition,
} from "react";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import {
  deleteBusiness,
  reactivateExpiredBusiness,
  suspendBusiness,
  unsuspendBusiness,
  updateBusiness,
} from "@/app/(super-admin)/super-admin/businesses/actions";

import Link from "next/link";

import {
  CheckCircle2,
  Edit3,
  Eye,
  Loader2,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";

import { toast } from "sonner";
import { useRouter } from "next/navigation";


type BusinessActionsProps = {
  business: {
    id: string;
    name: string;
    product_mode:
      | "standard"
      | "variant"
      | "configurable";
      max_staff:number;
    
    is_active: boolean;
    subscription_expires_at:
  string  | null;
  };
};

type BusinessStatusActionsProps = {
  businessId: string;
  businessName: string;
  isActive: boolean;
  disabledReason: string | null;
  subscriptionExpiresAt: string | null;
  currentMaxStaff: number;
};

type ExpirationResolution = {
  expiresAt: string | null;
  expired: boolean;
};

function useSubscriptionExpired(
  expiresAt: string | null,
) {
  const [resolution, setResolution] =
    useState<ExpirationResolution | null>(
      null,
    );

  useEffect(() => {
    let expirationTimeout:
      | number
      | undefined;

    const expiryTime = expiresAt
      ? new Date(expiresAt).getTime()
      : Number.NaN;

    const scheduleExpiration = () => {
      const remaining =
        expiryTime - Date.now();

      if (remaining <= 0) {
        setResolution({
          expiresAt,
          expired: true,
        });
        return;
      }

      expirationTimeout = window.setTimeout(
        scheduleExpiration,
        Math.min(remaining, 2_147_483_647),
      );
    };

    const initialTimeout = window.setTimeout(
      () => {
        const expired =
          Number.isFinite(expiryTime) &&
          expiryTime <= Date.now();

        setResolution({
          expiresAt,
          expired,
        });

        if (
          Number.isFinite(expiryTime) &&
          !expired
        ) {
          scheduleExpiration();
        }
      },
      0,
    );

    return () => {
      window.clearTimeout(initialTimeout);

      if (expirationTimeout !== undefined) {
        window.clearTimeout(expirationTimeout);
      }
    };
  }, [expiresAt]);

  if (
    !resolution ||
    resolution.expiresAt !== expiresAt
  ) {
    return null;
  }

  return resolution.expired;
}

export default function BusinessActions({
  business,
}: BusinessActionsProps) {
  

  return (
    <>
      <div className="flex items-center gap-2">
        <Link
          href={`/super-admin/businesses/${business.id}`}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <Eye size={14} />
          View
        </Link>

       
      </div>

    
    </>
  );
}

export function ToggleAndDeleteActions({
  business,
}: BusinessActionsProps) {
  const router = useRouter();
   const [showEdit, setShowEdit] =
    useState(false);
    const STAFF_OPTIONS = [
  3, 5, 10, 15,
  20, 25, 30, 50,
];

const [showDelete, setShowDelete] =
  useState(false);
const { pending } = useFormStatus();
const [
  deleteConfirmation,
  setDeleteConfirmation,
] = useState("");

const [isDeleting, setIsDeleting] =
  useState(false);

const [selectedStaff, setSelectedStaff] = useState(
  business.max_staff,
);

const isExpired = useSubscriptionExpired(
  business.subscription_expires_at,
);

  if (isExpired === null) {
    return (
      <div
        aria-busy="true"
        className="px-4 py-2.5 text-sm text-slate-500"
      >
        Checking actions...
      </div>
    );
  }

  return (
    <div className="flex items-center overflow-hidden  bg-white shadow-sm">

      {!isExpired && (
  <button
    type="button"
    onClick={() =>
      setShowEdit(true)
    }
    className="inline-flex items-center gap-2 border-r border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
  >
    <Edit3 size={16} />
    Edit
  </button>
)}

        
   

<form
  action={async (formData) => {
    const confirmed = window.confirm(
      `Delete ${business.name}? This action cannot be undone.`,
    );

    if (!confirmed) return;

    try {
      await deleteBusiness(formData);

      toast.success("Business deleted successfully!", {
        description: "Redirecting to Businesses...",
      });

      setTimeout(() => {
        router.push("/super-admin/businesses");
        router.refresh();
      }, 1200);
    } catch (error) {
      toast.error("Delete failed", {
        description:
          error instanceof Error
            ? error.message
            : "Unable to delete business.",
      });
    }
  }}
>
  <input
    type="hidden"
    name="businessId"
    value={business.id}
  />

 <button
  type="button"
  onClick={() => {
    setDeleteConfirmation("");
    setShowDelete(true);
  }}
  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50"
>{pending ? (
    <>
      <Loader2
        size={17}
        className="animate-spin"
      />
      Deleting...
    </>
  ) : (
    <>
      <Trash2 size={17} />
      Confirm Delete
    </>
  )}
</button>
</form>
 {showEdit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowEdit(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Edit Business
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Change the business name or
                  product mode.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowEdit(false)
                }
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            <form
             action={async (formData) => {
  try {
    const result =
      await updateBusiness(formData);

    setShowEdit(false);

    router.refresh();

    toast.success(
      "Business updated successfully",
      {
        description:
          result.disabledStaff > 0
            ? `Staff limit changed to ${result.maxStaff}. ${result.disabledStaff} newest staff account(s) were disabled.`
            : `Staff limit changed to ${result.maxStaff}.`,
      },
    );
  } catch (error) {
    toast.error(
      "Unable to update business",
      {
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred.",
      },
    );
  }
}}
              className="mt-6 space-y-5"
            >
              <input
                type="hidden"
                name="businessId"
                value={business.id}
              />

              <div>
                <label
                  htmlFor={`businessName-${business.id}`}
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Business name
                </label>

                <input
                  id={`businessName-${business.id}`}
                  name="businessName"
                  required
                  defaultValue={business.name}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor={`productMode-${business.id}`}
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Product mode
                </label>

                <select
                  id={`productMode-${business.id}`}
                  name="productMode"
                  defaultValue={
                    business.product_mode
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                >
                  <option value="standard">
                    Standard
                  </option>

                  <option value="variant">
                    Variant
                  </option>

                  <option value="configurable">
                    Configurable
                  </option>
                </select>
              </div>

              <div>
<input
  type="hidden"
  name="maxStaff"
  value={selectedStaff}
/>

<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
  {STAFF_OPTIONS.map((staff) => {
    const selected = selectedStaff === staff;

    return (
     <button
  key={staff}
  type="button"
  onClick={() => setSelectedStaff(staff)}
  className={[
    "flex h-20 flex-col items-center justify-center rounded-xl border transition",
    selected
      ? "border-blue-600 bg-blue-600 text-white"
      : "border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50",
  ].join(" ")}
>
  <span className="text-xl font-bold">
    {staff}
  </span>

  <span className="text-xs opacity-90">
    Users
  </span>
</button>
    );
  })}
</div>

</div>


              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setShowEdit(false)
                  }
                  className="rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

  {showDelete && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    onClick={() => {
      if (!isDeleting) {
        setShowDelete(false);
      }
    }}
  >
    <div
      className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      onClick={(event) =>
        event.stopPropagation()
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-100 text-red-700">
            <Trash2 size={21} />
          </div>

          <h2 className="mt-4 text-xl font-bold text-slate-900">
            Delete Business
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            This permanently deletes{" "}
            <strong>{business.name}</strong>{" "}
            and its related tenant data. This
            action cannot be undone.
          </p>
        </div>

        <button
          type="button"
          disabled={isDeleting}
          onClick={() =>
            setShowDelete(false)
          }
          className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Close delete dialog"
        >
          <X size={20} />
        </button>
      </div>

      <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-semibold text-red-900">
          This action is permanent
        </p>

        <p className="mt-1 text-sm text-red-700">
          Products, orders, customers and
          other records may also be removed
          when database cascade deletion is
          configured.
        </p>
      </div>

      <form
        className="mt-5 space-y-5"
        action={async (formData) => {
          try {
            setIsDeleting(true);

            const result =
              await deleteBusiness(
                formData,
              );

            toast.success(
              `${result.businessName} deleted successfully.`,
            );

            setShowDelete(false);

            router.push(
              "/super-admin/businesses",
            );

            router.refresh();
          } catch (error) {
            toast.error(
              "Unable to delete business",
              {
                description:
                  error instanceof Error
                    ? error.message
                    : "An unexpected error occurred.",
              },
            );
          } finally {
            setIsDeleting(false);
          }
        }}
      >
        <input
          type="hidden"
          name="businessId"
          value={business.id}
        />

        <div>
          <label
            htmlFor={`deleteConfirmation-${business.id}`}
            className="block text-sm font-semibold text-slate-700"
          >
            Type{" "}
            <span className="text-red-700">
              {business.name}
            </span>{" "}
            to confirm
          </label>

          <input
            id={`deleteConfirmation-${business.id}`}
            name="confirmationName"
            value={deleteConfirmation}
            onChange={(event) =>
              setDeleteConfirmation(
                event.target.value,
              )
            }
            autoComplete="off"
            placeholder={business.name}
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-100"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            disabled={isDeleting}
            onClick={() =>
              setShowDelete(false)
            }
            className="rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={
              isDeleting ||
              deleteConfirmation !==
                business.name
            }
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
          >
            <Trash2 size={17} />

            {isDeleting
              ? "Deleting..."
              : "Delete Permanently"}
          </button>
        </div>
      </form>
    </div>
  </div>
)}

    </div>
  );
}





export function BusinessStatusActions({
  businessId,
  businessName,
  isActive,
  disabledReason,
  subscriptionExpiresAt,
  currentMaxStaff,
}: BusinessStatusActionsProps) {
  const router = useRouter();

  const [
    showSuspend,
    setShowSuspend,
  ] = useState(false);

  const [
    showReactivate,
    setShowReactivate,
  ] = useState(false);

  const isExpired =
    useSubscriptionExpired(
      subscriptionExpiresAt,
    );

  const isManuallySuspended =
    !isActive &&
    disabledReason ===
      "manually_suspended";

  if (isExpired === null) {
    return (
      <span
        aria-busy="true"
        className="px-4 py-2.5 text-sm text-slate-500"
      >
        Checking status...
      </span>
    );
  }

  if (isExpired) {
    return (
      <>
        <button
          type="button"
          onClick={() =>
            setShowReactivate(true)
          }
          className="inline-flex items-center gap-2 border-r border-slate-200 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
        >
          <RotateCcw size={16} />
          Reactivate
        </button>

        {showReactivate && (
          <ReactivateBusinessModal
            businessId={businessId}
            businessName={businessName}
            currentMaxStaff={
              currentMaxStaff
            }
            previousExpiry={
              subscriptionExpiresAt
            }
            onClose={() =>
              setShowReactivate(false)
            }
            onSuccess={() => {
              setShowReactivate(false);
              router.refresh();
            }}
          />
        )}
      </>
    );
  }

  if (isManuallySuspended) {
    return (
     <form
  action={async (formData) => {
    try {
      await unsuspendBusiness(
        formData,
      );

      toast.success(
        "Business restored successfully.",
      );

      router.refresh();
    } catch (error) {
      toast.error(
        "Unable to restore business",
        {
          description:
            error instanceof Error
              ? error.message
              : "Unexpected error.",
        },
      );
    }
  }}
>
  <input
    type="hidden"
    name="businessId"
    value={businessId}
  />

  <PendingSubmitButton
  pendingText="Restoring..."
  icon={<PlayCircle size={16} />}
  className="border-r border-slate-200 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
>
  Restore
</PendingSubmitButton>
</form>
    );
  }

  if (!isActive) {
    return (
      <span className="inline-flex items-center border-r border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">
        Inactive
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() =>
          setShowSuspend(true)
        }
        className="inline-flex items-center gap-2 border-r border-slate-200 px-4 py-2.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-50"
      >
        <PauseCircle size={16} />
        Suspend
      </button>

      {showSuspend && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() =>
            setShowSuspend(false)
          }
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Suspend Business
                </h2>

                <p className="mt-2 text-sm text-slate-600">
                  Staff and owners of{" "}
                  <strong>
                    {businessName}
                  </strong>{" "}
                 will lose access. The business
will be scheduled for permanent
deletion after 60 days unless it
is restored.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowSuspend(false)
                }
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            <form
  action={async (formData) => {
    try {
      await suspendBusiness(
        formData,
      );

      setShowSuspend(false);

      toast.success(
        "Business suspended successfully.",
      );

      router.refresh();
    } catch (error) {
      toast.error(
        "Unable to suspend business",
        {
          description:
            error instanceof Error
              ? error.message
              : "Unexpected error.",
        },
      );
    }
  }}
  className="mt-6 space-y-4"
>
              <input
                type="hidden"
                name="businessId"
                value={businessId}
              />

              <div>
                <label
                  htmlFor={`reason-${businessId}`}
                  className="text-sm font-semibold text-slate-700"
                >
                  Suspension reason
                </label>

                <textarea
                  id={`reason-${businessId}`}
                  name="reason"
                  required
                  rows={4}
                  className="mt-2 w-full resize-none rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setShowSuspend(false)
                  }
                  className="rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700"
                >
                  Cancel
                </button>

               <PendingSubmitButton
  pendingText="Suspending..."
  className="rounded-xl bg-amber-600 px-4 py-3 font-semibold text-white hover:bg-amber-700"
>
  Confirm Suspend
</PendingSubmitButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}




function ReactivateBusinessModal({
  businessId,
  businessName,
  currentMaxStaff,
  previousExpiry,
  onClose,
  onSuccess,
}: {
  businessId: string;
  businessName: string;
  currentMaxStaff: number;
  previousExpiry: string | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] =
    useState<1 | 2>(1);

  const [months, setMonths] =
    useState(3);

  const [maxStaff, setMaxStaff] =
    useState(currentMaxStaff);

  const [
    confirmation,
    setConfirmation,
  ] = useState("");

  const [error, setError] =
    useState("");

  const [pending, startTransition] =
    useTransition();

  const monthOptions = [
    1,
    3,
    5,
    12,
  ];

  const staffOptions = [
    3,
    5,
    10,
    15,
    20,
    25,
    30,
    50,
  ];

  const canConfirm =
    confirmation
      .trim()
      .toLowerCase() ===
    "reactivate";

  const newExpiry = new Date();

  newExpiry.setMonth(
    newExpiry.getMonth() + months,
  );

  function handleReactivate() {
    if (!canConfirm) return;

    const formData = new FormData();

    formData.set(
      "businessId",
      businessId,
    );

    formData.set(
      "months",
      String(months),
    );

    formData.set(
      "maxStaff",
      String(maxStaff),
    );

    formData.set(
      "confirmation",
      confirmation,
    );

    startTransition(async () => {
      try {
        setError("");

        await reactivateExpiredBusiness(
          formData,
        );

        onSuccess();
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to reactivate business.",
        );
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!pending) onClose();
      }}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(event) =>
          event.stopPropagation()
        }
      >
        <div className="flex items-start justify-between gap-4">
          <div>
      

            <h2 className="mt-4 text-2xl font-bold text-slate-900">
              {step === 1
                ? "Reactivate Business"
                : "Confirm Reactivation"}
            </h2>

            <p className="mt-1 text-sm text-slate-600">
      Select a new subscription and staff limit for this business.
    </p>

            <p className="mt-2 text-sm text-slate-600">
              {businessName}
            </p>
          </div>

          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        {step === 1 ? (
          <>
            <div className="mt-7">
              <p className="text-sm font-semibold text-slate-700">
                Subscription period
              </p>

              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {monthOptions.map(
                  (option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() =>
                        setMonths(option)
                      }
                      className={[
                        "rounded-xl border px-4 py-4 transition",
                        months === option
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:border-blue-400 hover:bg-blue-50",
                      ].join(" ")}
                    >
                      <span className="block text-xl font-bold">
                        {option}
                      </span>

                      <span className="text-xs">
                        {option === 1
                          ? "Month"
                          : "Months"}
                      </span>
                    </button>
                  ),
                )}
              </div>
            </div>

            <div className="mt-7">
              <p className="text-sm font-semibold text-slate-700">
                Staff limit
              </p>

              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {staffOptions.map(
                  (option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() =>
                        setMaxStaff(option)
                      }
                      className={[
                        "rounded-xl border px-4 py-4 transition",
                        maxStaff === option
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:border-blue-400 hover:bg-blue-50",
                      ].join(" ")}
                    >
                      <span className="block text-xl font-bold">
                        {option}
                      </span>

                      <span className="text-xs">
                        Users
                      </span>
                    </button>
                  ),
                )}
              </div>
            </div>

            <div className="mt-7 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
              >
                Continue
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-7 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <ChangeRow
                label="Status"
                before="Expired"
                after="Active"
              />

              <ChangeRow
                label="Subscription"
                before="Expired"
                after={`${months} ${
                  months === 1
                    ? "Month"
                    : "Months"
                }`}
              />

              <ChangeRow
                label="Staff limit"
                before={`${currentMaxStaff} Users`}
                after={`${maxStaff} Users`}
              />

              <ChangeRow
                label="Expiry date"
                before={
                  previousExpiry
                    ? formatActionDate(
                        previousExpiry,
                      )
                    : "Not available"
                }
                after={formatActionDate(
                  newExpiry.toISOString(),
                )}
              />
            </div>

            <div className="mt-6">
              <label
                htmlFor={`reactivate-${businessId}`}
                className="block text-sm font-semibold text-slate-700"
              >
                Type{" "}
                <span className="text-emerald-700">
                  reactivate
                </span>{" "}
                to continue
              </label>

              <input
                id={`reactivate-${businessId}`}
                value={confirmation}
                onChange={(event) =>
                  setConfirmation(
                    event.target.value,
                  )
                }
                autoComplete="off"
                placeholder="reactivate"
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              />
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="mt-7 flex justify-end gap-3">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setError("");
                  setStep(1);
                }}
                className="rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50"
              >
                Back
              </button>

              <button
                type="button"
                disabled={
                  pending ||
                  !canConfirm
                }
                onClick={handleReactivate}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
              >
                {pending ? (
                  <>
                    <Loader2
                      size={17}
                      className="animate-spin"
                    />
                    Reactivating...
                  </>
                ) : (
                  <>
                    <CheckCircle2
                      size={17}
                    />
                    Reactivate Business
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ChangeRow({
  label,
  before,
  after,
}: {
  label: string;
  before: string;
  after: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-3 last:border-0 last:pb-0">
      <span className="text-sm font-medium text-slate-500">
        {label}
      </span>

      <div className="text-right text-sm">
        <span className="text-slate-500 line-through">
          {before}
        </span>

        <span className="mx-2 text-slate-400">
          →
        </span>

        <span className="font-semibold text-slate-900">
          {after}
        </span>
      </div>
    </div>
  );
}

function formatActionDate(
  value: string,
) {
  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    },
  ).format(new Date(value));
}
