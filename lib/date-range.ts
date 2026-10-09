// Validates a draft YYYY-MM-DD date filter before it is applied. "" means the range may be applied.
// Dates stay plain calendar days; each page keeps its own business-timezone boundaries.
export function dateRangeError(from: string, to: string, maxSpanDays?: number) {
  if (!from || !to) return "";
  if (from > to) return "Start date must be on or before the end date.";
  if (maxSpanDays && (Date.parse(to) - Date.parse(from)) / 86400000 > maxSpanDays) return `Choose a range of up to ${maxSpanDays + 1} days.`;
  return "";
}
