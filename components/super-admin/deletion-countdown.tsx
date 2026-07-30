"use client";

import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";

type DeletionCountdownProps = {
  scheduledDeletionAt: string | null;
  isActive: boolean;
};

type RemainingTime = {
  expired: boolean;
  months: number;
  days: number;
  hours: number;
  minutes: number;
  progress: number;
};

const SIX_MONTHS_MS =
  1000 * 60 * 60 * 24 * 30 * 6;

function calculateRemainingTime(
  scheduledDeletionAt: string,
  now: number,
): RemainingTime {
  const deletionTime = new Date(
    scheduledDeletionAt,
  ).getTime();

  const difference = deletionTime - now;

  if (difference <= 0) {
    return {
      expired: true,
      months: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      progress: 100,
    };
  }

  const totalMinutes = Math.floor(
    difference / (1000 * 60),
  );

  const totalHours = Math.floor(
    totalMinutes / 60,
  );

  const totalDays = Math.floor(
    totalHours / 24,
  );

  const months = Math.floor(
    totalDays / 30,
  );

  const days = totalDays % 30;
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;

  const elapsed =
    SIX_MONTHS_MS - difference;

  const progress = Math.min(
    100,
    Math.max(
      0,
      (elapsed / SIX_MONTHS_MS) * 100,
    ),
  );

  return {
    expired: false,
    months,
    days,
    hours,
    minutes,
    progress,
  };
}

export default function DeletionCountdown({
  scheduledDeletionAt,
  isActive,
}: DeletionCountdownProps) {
  const [nowTick, setNowTick] =
    useState<number | null>(null);

  useEffect(() => {
    if (isActive || !scheduledDeletionAt) {
      return;
    }

    const updateNow = () => {
      setNowTick(Date.now());
    };

    const initialTimeout =
      window.setTimeout(updateNow, 0);

    const interval =
      window.setInterval(updateNow, 60_000);

    return () => {
      window.clearTimeout(initialTimeout);
      window.clearInterval(interval);
    };
  }, [isActive, scheduledDeletionAt]);

  if (isActive) {
    return (
      <span className="text-sm text-slate-400">
        —
      </span>
    );
  }

  if (!scheduledDeletionAt) {
    return (
      <span className="text-sm text-slate-500">
        Not scheduled
      </span>
    );
  }

  if (nowTick === null) {
    return (
      <span className="text-sm text-slate-500">
        Calculating...
      </span>
    );
  }

  const remaining = calculateRemainingTime(
    scheduledDeletionAt,
    nowTick,
  );

  if (remaining.expired) {
    return (
      <div className="space-y-1">
        <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
          Ready for deletion
        </span>

        <p className="text-xs text-red-600">
          Retention period has ended
        </p>
      </div>
    );
  }

  const urgencyClass =
    remaining.months >= 3
      ? "text-emerald-700"
      : remaining.months >= 1
        ? "text-amber-700"
        : "text-red-700";

  const progressClass =
    remaining.months >= 3
      ? "bg-emerald-500"
      : remaining.months >= 1
        ? "bg-amber-500"
        : "bg-red-500";

  return (
    <div className="min-w-[220px] space-y-2">
      <div className="flex items-center gap-2">
        <Clock3
          size={15}
          className={urgencyClass}
        />

        <p
          className={`text-sm font-semibold ${urgencyClass}`}
        >
          {remaining.months}m{" "}
          {remaining.days}d{" "}
          {remaining.hours}h{" "}
          {remaining.minutes}min left
        </p>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full transition-all duration-700 ${progressClass}`}
          style={{
            width: `${remaining.progress}%`,
          }}
        />
      </div>

      <p className="text-xs text-slate-500">
        Deletes on{" "}
        {new Intl.DateTimeFormat(
          "en-GB",
          {
            day: "2-digit",
            month: "short",
            year: "numeric",
          },
        ).format(
          new Date(scheduledDeletionAt),
        )}
      </p>
    </div>
  );
}
