import "server-only";

import { createHash, createHmac } from "node:crypto";
import { headers } from "next/headers";

import { supabaseAdmin } from "@/lib/supabase/admin";

const MAX_TRIAL_SIGNUPS_PER_FINGERPRINT = 3;
const FINGERPRINT_WINDOW_DAYS = 30;

const FALLBACK_BLOCKED_DOMAINS = new Set([
  "10minutemail.com",
  "10minutemail.net",
  "20minutemail.com",
  "dispostable.com",
  "emailondeck.com",
  "fakeinbox.com",
  "getairmail.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "maildrop.cc",
  "mailinator.com",
  "mailnesia.com",
  "moakt.com",
  "sharklasers.com",
  "temp-mail.org",
  "temp-mail.io",
  "tempmail.com",
  "tempmail.net",
  "tempail.com",
  "throwawaymail.com",
  "trashmail.com",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
]);

export type TrialRegistrationDecision = {
  allowed: boolean;
  canonicalEmailKey: string;
  emailDomain: string;
  fingerprintHash: string | null;
  message?: string;
};

function splitEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");

  if (at <= 0 || at === normalized.length - 1) {
    return null;
  }

  return {
    local: normalized.slice(0, at),
    domain: normalized.slice(at + 1),
  };
}

export function canonicalizeTrialEmail(email: string) {
  const parts = splitEmail(email);

  if (!parts) {
    return email.trim().toLowerCase();
  }

  let { local, domain } = parts;

  if (domain === "googlemail.com") {
    domain = "gmail.com";
  }

  if (domain === "gmail.com") {
    local = local.split("+")[0].replaceAll(".", "");
  } else if (
    domain === "outlook.com" ||
    domain === "hotmail.com" ||
    domain === "live.com"
  ) {
    local = local.split("+")[0];
  }

  return `${local}@${domain}`;
}

function emailDomain(email: string) {
  return splitEmail(email)?.domain ?? "";
}

async function buildSignupFingerprint() {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for") ?? "";
  const ip = forwardedFor.split(",")[0]?.trim() ?? "";
  const userAgent = requestHeaders.get("user-agent") ?? "";

  if (!ip && !userAgent) {
    return null;
  }

  const secret =
    process.env.TRIAL_FINGERPRINT_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    return null;
  }

  return createHmac("sha256", secret)
    .update(`${ip}\n${userAgent}`)
    .digest("hex");
}

export async function checkTrialRegistrationEligibility(
  email: string,
): Promise<TrialRegistrationDecision> {
  const canonicalEmailKey = createHash("sha256")
    .update(canonicalizeTrialEmail(email))
    .digest("hex");
  const domain = emailDomain(email);
  const fingerprintHash = await buildSignupFingerprint();

  if (!domain) {
    return {
      allowed: false,
      canonicalEmailKey,
      emailDomain: domain,
      fingerprintHash,
      message: "Enter a valid email address.",
    };
  }

  if (FALLBACK_BLOCKED_DOMAINS.has(domain)) {
    return {
      allowed: false,
      canonicalEmailKey,
      emailDomain: domain,
      fingerprintHash,
      message:
        "This email provider is not eligible for the free trial. Use a permanent email address.",
    };
  }

  const [{ data: blockedDomain }, { data: existingClaim }] =
    await Promise.all([
      supabaseAdmin
        .from("blocked_signup_email_domains")
        .select("domain")
        .eq("domain", domain)
        .maybeSingle(),
      supabaseAdmin
        .from("trial_claims")
        .select("id")
        .eq("canonical_email_key", canonicalEmailKey)
        .maybeSingle(),
    ]);

  if (blockedDomain) {
    return {
      allowed: false,
      canonicalEmailKey,
      emailDomain: domain,
      fingerprintHash,
      message:
        "This email provider is not eligible for the free trial. Use a permanent email address.",
    };
  }

  if (existingClaim) {
    return {
      allowed: false,
      canonicalEmailKey,
      emailDomain: domain,
      fingerprintHash,
      message:
        "A free trial has already been used with this email. You can continue with a paid subscription.",
    };
  }

  if (fingerprintHash) {
    const since = new Date(
      Date.now() - FINGERPRINT_WINDOW_DAYS * 86_400_000,
    ).toISOString();

    const { count, error } = await supabaseAdmin
      .from("trial_signup_events")
      .select("id", { count: "exact", head: true })
      .eq("fingerprint_hash", fingerprintHash)
      .gte("created_at", since);

    if (error) {
      throw new Error(
        `Unable to verify free-trial eligibility: ${error.message}`,
      );
    }

    if ((count ?? 0) >= MAX_TRIAL_SIGNUPS_PER_FINGERPRINT) {
      return {
        allowed: false,
        canonicalEmailKey,
        emailDomain: domain,
        fingerprintHash,
        message:
          "Too many free-trial registrations were detected from this network or device. Please use a paid subscription or contact support.",
      };
    }
  }

  return {
    allowed: true,
    canonicalEmailKey,
    emailDomain: domain,
    fingerprintHash,
  };
}

export async function recordTrialSignupEvent({
  canonicalEmailKey,
  emailDomain: domain,
  fingerprintHash,
  businessId,
}: TrialRegistrationDecision & {
  businessId: string;
}) {
  const { error } = await supabaseAdmin
    .from("trial_signup_events")
    .insert({
      canonical_email_key: canonicalEmailKey,
      email_domain: domain,
      fingerprint_hash: fingerprintHash,
      business_id: businessId,
    });

  if (error) {
    throw new Error(
      `Unable to record free-trial registration: ${error.message}`,
    );
  }
}
