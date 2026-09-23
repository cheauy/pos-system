export const BRANCH_WEEK_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type BranchWeekDay = (typeof BRANCH_WEEK_DAYS)[number];

export type BranchOpeningHoursDay = {
  closed: boolean;
  open: string;
  close: string;
};

export type BranchOpeningHoursSchedule = {
  version: 1;
  days: Record<BranchWeekDay, BranchOpeningHoursDay>;
};

const DAY_LABELS: Record<BranchWeekDay, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function defaultBranchOpeningHours(): BranchOpeningHoursSchedule {
  return {
    version: 1,
    days: Object.fromEntries(
      BRANCH_WEEK_DAYS.map((day) => [
        day,
        { closed: false, open: "09:00", close: "21:00" },
      ]),
    ) as Record<BranchWeekDay, BranchOpeningHoursDay>,
  };
}

export function parseBranchOpeningHours(
  value: string | null | undefined,
): BranchOpeningHoursSchedule | null {
  const raw = value?.trim();
  if (!raw || !raw.startsWith("{")) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<BranchOpeningHoursSchedule>;
    if (!parsed || parsed.version !== 1 || !parsed.days) return null;

    const defaults = defaultBranchOpeningHours();
    const days = {} as Record<BranchWeekDay, BranchOpeningHoursDay>;

    for (const day of BRANCH_WEEK_DAYS) {
      const current = parsed.days?.[day];
      const fallback = defaults.days[day];
      const closed = Boolean(current?.closed);
      const open = typeof current?.open === "string" && TIME_RE.test(current.open)
        ? current.open
        : fallback.open;
      const close = typeof current?.close === "string" && TIME_RE.test(current.close)
        ? current.close
        : fallback.close;

      days[day] = { closed, open, close };
    }

    return { version: 1, days };
  } catch {
    return null;
  }
}

export function serializeBranchOpeningHours(schedule: BranchOpeningHoursSchedule) {
  return JSON.stringify(schedule);
}

export function normalizeBranchOpeningHours(
  value: string | null | undefined,
): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  const parsed = parseBranchOpeningHours(raw);
  if (!parsed) {
    // Keep legacy free-text values readable for old branches, but new/edit UI
    // always submits the structured weekly schedule.
    if (!raw.startsWith("{")) return raw.slice(0, 300);
    throw new Error("Opening hours schedule is invalid.");
  }

  return serializeBranchOpeningHours(parsed);
}

export function formatBranchOpeningHoursSummary(
  value: string | null | undefined,
): string {
  const raw = value?.trim();
  if (!raw) return "Not set";

  const schedule = parseBranchOpeningHours(raw);
  if (!schedule) return raw;

  type Group = {
    start: BranchWeekDay;
    end: BranchWeekDay;
    signature: string;
    label: string;
  };

  const groups: Group[] = [];
  for (const day of BRANCH_WEEK_DAYS) {
    const current = schedule.days[day];
    const signature = current.closed ? "closed" : `${current.open}-${current.close}`;
    const label = current.closed ? "Closed" : `${current.open}–${current.close}`;
    const previous = groups.length ? groups[groups.length - 1] : undefined;

    if (previous?.signature === signature) {
      previous.end = day;
    } else {
      groups.push({ start: day, end: day, signature, label });
    }
  }

  return groups
    .map((group) => {
      const range = group.start === group.end
        ? DAY_LABELS[group.start]
        : `${DAY_LABELS[group.start]}–${DAY_LABELS[group.end]}`;
      return `${range} ${group.label}`;
    })
    .join(" · ");
}
