import { defaultOpeningHours, parseStoreProfile, type StoreProfile } from "@/lib/storefront/profile";

export type BusinessInfo = {
  description: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  phone: string;
  address: string;
  contactEmail: string;
  locationUrl: string;
  openingHours: NonNullable<StoreProfile["openingHours"]>;
};

/** Shared contact information stays in the existing storefront row; no data migration. */
export function businessInfoValues(value: { description?: string | null; logo_url?: string | null; banner_url?: string | null; phone?: string | null; address?: string | null; profile?: StoreProfile | null }): BusinessInfo {
  const defaults = defaultOpeningHours();
  const hours = value.profile?.openingHours;
  return {
    description: value.description ?? "", logoUrl: value.logo_url ?? null, bannerUrl: value.banner_url ?? null,
    phone: value.phone ?? "", address: value.address ?? "",
    contactEmail: value.profile?.contactEmail ?? "", locationUrl: value.profile?.locationUrl ?? "",
    openingHours: { ...defaults, ...hours, days: { ...defaults.days, ...hours?.days } },
  };
}

/** Deterministic comparison of only this form's fields, not unrelated branding changes. */
export function businessInfoSnapshot(value: BusinessInfo): string {
  return JSON.stringify([
    value.description, value.logoUrl, value.bannerUrl,
    value.phone, value.address, value.contactEmail, value.locationUrl,
    value.openingHours.enabled, value.openingHours.timezone,
    Object.keys(defaultOpeningHours().days).map(day => {
      const entry = value.openingHours.days[day as keyof typeof value.openingHours.days];
      return [day, entry.closed, entry.open, entry.close];
    }),
  ]);
}

export function parseBusinessInfo(form: FormData): BusinessInfo {
  const text = (name: string) => typeof form.get(name) === "string" ? String(form.get(name)).trim() : "";
  const phone = text("phone"), address = text("address");
  const description = text("description");
  if (description.length > 500) throw new Error("Store description must be 500 characters or fewer.");
  if (phone && (phone.length > 40 || !/^[+0-9(). \-]+$/.test(phone) || !/\d/.test(phone))) {
    throw new Error("Enter a valid shop phone number, up to 40 characters.");
  }
  if (address.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(address)) {
    throw new Error("Address must be 500 characters or fewer without control characters.");
  }
  // Only accept business-owned profile fields; ignore branding and payment keys.
  const contact = new FormData();
  for (const [key, value] of form) {
    if (["contactEmail", "locationUrl", "hoursEnabled", "hoursTimezone"].includes(key) || key.startsWith("hours-")) contact.append(key, value);
  }
  return businessInfoValues({ phone, address, description, profile: parseStoreProfile(contact) });
}

/** Online Store may update branding but cannot overwrite Business Settings fields. */
export function mergeOnlineStoreProfile(current: StoreProfile | null | undefined, submitted: StoreProfile): StoreProfile {
  const { contactEmail: _email, locationUrl: _location, openingHours: _hours, ...branding } = submitted;
  return { ...current, ...branding };
}
