"use client";

import {
  useActionState,
  useMemo,
  useState,
} from "react";

import {
  Check,
  Users,
} from "lucide-react";

import {
  updateBusinessStaffLimit,
  type UpdateStaffLimitState,
} from "../actions";

type StaffLimitFormProps = {
  businessId: string;
  initialMaxStaff: number;
  currentStaffCount: number;
};

const presets = [
  3,
  5,
  10,
  15,
  20,
  25,
  30,
  50,
];

const initialState: UpdateStaffLimitState = {
  success: false,
  message: "",
};

export default function StaffLimitForm({
  businessId,
  initialMaxStaff,
  currentStaffCount,
}: StaffLimitFormProps) {
  const initialIsCustom =
    !presets.includes(initialMaxStaff);

  const [
    maxStaff,
    setMaxStaff,
  ] = useState(initialMaxStaff);

  const [
    isCustom,
    setIsCustom,
  ] = useState(initialIsCustom);

  const [
    state,
    formAction,
    pending,
  ] = useActionState(
    updateBusinessStaffLimit,
    initialState,
  );

  const remainingSlots = useMemo(
    () =>
      Math.max(
        0,
        maxStaff - currentStaffCount,
      ),
    [maxStaff, currentStaffCount],
  );

  function choosePreset(
    value: number,
  ) {
    setIsCustom(false);
    setMaxStaff(value);
  }

  function enableCustom() {
    setIsCustom(true);

    if (presets.includes(maxStaff)) {
      setMaxStaff(
        Math.max(
          3,
          maxStaff,
        ),
      );
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
          <Users size={22} />
        </div>

        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Staff Limit
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Set how many staff accounts this
            business may create.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Active staff"
          value={currentStaffCount}
        />

        <StatCard
          label="Maximum staff"
          value={maxStaff}
        />

        <StatCard
          label="Available slots"
          value={remainingSlots}
        />
      </div>

      <form
        action={formAction}
        className="mt-7 space-y-6"
      >
        <input
          type="hidden"
          name="businessId"
          value={businessId}
        />

        <input
          type="hidden"
          name="maxStaff"
          value={maxStaff}
        />

        <div>
          <p className="text-sm font-semibold text-slate-800">
            Preset limits
          </p>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {presets.map((value) => {
              const selected =
                !isCustom &&
                maxStaff === value;

              return (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    choosePreset(value)
                  }
                  className={`relative rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                    selected
                      ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                      : "border-slate-300 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50"
                  }`}
                >
                  {selected && (
                    <Check
                      size={15}
                      className="absolute right-2 top-2"
                    />
                  )}

                  {value} staff
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={enableCustom}
            className={`w-full rounded-xl border p-4 text-left transition ${
              isCustom
                ? "border-blue-500 bg-blue-50"
                : "border-slate-300 bg-white hover:border-blue-300"
            }`}
          >
            <span className="block font-semibold text-slate-900">
              Custom limit
            </span>

            <span className="mt-1 block text-sm text-slate-500">
              Enter any number between 3 and 100.
            </span>
          </button>

          {isCustom && (
            <div className="mt-4">
              <label
                htmlFor="customMaxStaff"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Maximum staff
              </label>

              <input
                id="customMaxStaff"
                type="number"
                min={3}
                max={100}
                step={1}
                value={maxStaff}
                onChange={(event) => {
                  const value = Number(
                    event.target.value,
                  );

                  setMaxStaff(value);
                }}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />

              <p className="mt-2 text-xs text-slate-500">
                Current active staff:
                {" "}
                {currentStaffCount}
              </p>
            </div>
          )}
        </div>

        {maxStaff < currentStaffCount && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            The limit cannot be lower than the
            current active staff count of{" "}
            {currentStaffCount}.
          </div>
        )}

        {state.message && (
          <div
            role={
              state.success
                ? "status"
                : "alert"
            }
            className={`rounded-xl border p-4 text-sm ${
              state.success
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {state.message}
          </div>
        )}

        <button
          type="submit"
          disabled={
            pending ||
            !Number.isInteger(maxStaff) ||
            maxStaff < 3 ||
            maxStaff > 100 ||
            maxStaff < currentStaffCount
          }
          className="w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending
            ? "Saving..."
            : "Save Staff Limit"}
        </button>
      </form>
    </section>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>

      <p className="mt-2 text-2xl font-bold text-slate-900">
        {value}
      </p>
    </div>
  );
}
