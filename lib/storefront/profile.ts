export const weekDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type WeekDay = (typeof weekDays)[number];
export type OpeningDay = { closed: boolean; open: string; close: string };
export type StoreProfile = {
  contactEmail?: string;
  locationUrl?: string;
  socialNames?: Record<string, string>;
  featuredProductIds?: string[];
  seoTitle?: string;
  seoDescription?: string;
  newArrivals?: { enabled: boolean; days: number };
  openingHours?: { enabled: boolean; timezone: string; days: Record<WeekDay, OpeningDay> };
};

// Store profile extensions live alongside the public links in the existing
// JSONB document so older installations can save them without a schema rollout.
export function supportsDineIn(businessType: string) {
  return ["restaurant", "cafe", "milk_tea"].includes(businessType);
}

export function defaultOpeningHours(): NonNullable<StoreProfile["openingHours"]> {
  return { enabled: false, timezone: "Asia/Phnom_Penh", days: Object.fromEntries(
    weekDays.map(day => [day, { closed: false, open: "09:00", close: "18:00" }]),
  ) as Record<WeekDay, OpeningDay> };
}

export function parseStoreProfile(form: FormData): StoreProfile {
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const contactEmail = text("contactEmail");
  const locationUrl = text("locationUrl");
  if (locationUrl) {
    let url: URL;
    try { url = new URL(locationUrl); } catch { throw new Error("Enter a valid location URL starting with https:// or http://."); }
    if (locationUrl.length > 2000 || !["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("Enter a valid public location URL starting with https:// or http://.");
  }
  const seoTitle = text("seoTitle");
  const seoDescription = text("seoDescription");
  if (contactEmail && (contactEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))) throw new Error("Enter a valid contact email.");
  if (seoTitle.length > 60) throw new Error("Meta title must be 60 characters or fewer.");
  if (seoDescription.length > 160) throw new Error("Meta description must be 160 characters or fewer.");
  const hours = defaultOpeningHours();
  hours.enabled = form.get("hoursEnabled") === "on";
  hours.timezone = text("hoursTimezone") || hours.timezone;
  try { new Intl.DateTimeFormat("en", { timeZone: hours.timezone }).format(); }
  catch { throw new Error("Select a valid time zone for opening hours."); }
  for (const day of weekDays) {
    const closed = form.get(`hours-${day}-closed`) === "on";
    const open = text(`hours-${day}-open`) || "09:00";
    const close = text(`hours-${day}-close`) || "18:00";
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(open) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(close)) throw new Error(`Enter valid ${day} opening times.`);
    if (hours.enabled && !closed && open === close) throw new Error(`Choose different opening and closing times for ${day}, or mark it closed.`);
    hours.days[day] = { closed, open, close };
  }
  const days = Number(text("newArrivalDays") || "30");
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error("New arrival period must be between 1 and 365 days.");
  const socialNames: Record<string, string> = {};
  for (const key of ["facebook", "instagram", "tiktok", "youtube", "telegram", "whatsapp", "messenger", "x"]) {
    const value = text(`${key}Url-name`);
    if (value.length > 80) throw new Error("Social account names must be 80 characters or fewer.");
    socialNames[key] = value;
  }
  return { contactEmail, locationUrl, socialNames, seoTitle, seoDescription, openingHours: hours,
    newArrivals: { enabled: form.get("newArrivalsEnabled") === "on", days } };
}

export function isNewArrival(createdAt: string | null | undefined, settings: StoreProfile["newArrivals"], now = Date.now()) {
  if (settings?.enabled === false || !createdAt) return false;
  const age = now - Date.parse(createdAt);
  return Number.isFinite(age) && age >= 0 && age <= (settings?.days ?? 30) * 86_400_000;
}

export function formatOpeningTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}
