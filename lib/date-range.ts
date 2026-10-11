// Validates a draft YYYY-MM-DD date filter before it is applied. "" means the range may be applied.
// Dates stay plain calendar days; each page keeps its own business-timezone boundaries.
export function dateRangeError(from: string, to: string, maxSpanDays?: number) {
  if (!from || !to) return "";
  if (from > to) return "Start date must be on or before the end date.";
  if (maxSpanDays && (Date.parse(to) - Date.parse(from)) / 86400000 > maxSpanDays) return `Choose a range of up to ${maxSpanDays + 1} days.`;
  return "";
}

export const calendarPresets = ["Today", "Yesterday", "This Week", "This Month", "This Year"] as const;

export function calendarRange(preset: typeof calendarPresets[number], today: string) {
  const end = new Date(`${today}T00:00:00Z`);
  const start = new Date(end);
  if (preset === "Yesterday") { start.setUTCDate(start.getUTCDate() - 1); end.setUTCDate(end.getUTCDate() - 1); }
  if (preset === "This Week") start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  if (preset === "This Month") start.setUTCDate(1);
  if (preset === "This Year") start.setUTCMonth(0, 1);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export function inCalendarDateRange(timestamp: string, from: string, to: string, offset = "") {
  const created = new Date(timestamp).getTime();
  return Number.isFinite(created) && (!from || created >= Date.parse(`${from}T00:00:00${offset}`)) && (!to || created <= Date.parse(`${to}T23:59:59.999${offset}`));
}
