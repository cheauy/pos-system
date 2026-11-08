export const MAIL_DOMAINS = [
  "loeuklabs.site",
  "mekhalatech.site",
  "tumnob.site",
  "helenbl.site",
  "honey-wellaerospace.site",
] as const;

export const SITE_URL = "https://temp-mail.tenh-pos.com";
export const EMAIL_TTL = 60 * 60 * 1000;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  const [username, domain] = email.split("@");
  return email.length <= 254 && /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/.test(username)
    && !username.includes("..") && MAIL_DOMAINS.some((item) => item === domain)
    && email.split("@").length === 2 ? email : null;
}

export interface EmailMessage {
  id: string;
  recipient: string;
  sender: string;
  subject: string;
  text: string;
  html: string;
  otp_code: string | null;
  timestamp: number;
}
