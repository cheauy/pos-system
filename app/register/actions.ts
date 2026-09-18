"use server";

import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { getAppUrl } from "@/lib/tenancy/domain";

import type { RegisterAccountState } from "./state";

const PENDING_EMAIL_COOKIE = "tenh_pending_signup_email";

function requiredText(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required.`);
  }

  return value.trim();
}

function getErrorField(error: unknown, key: string) {
  if (!error || typeof error !== "object") return null;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getErrorStatus(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const value = (error as Record<string, unknown>).status;
  return typeof value === "number" ? value : null;
}

function readableAuthError(error: unknown): string {
  const rawMessage =
    error instanceof Error
      ? error.message.trim()
      : getErrorField(error, "message") ??
        getErrorField(error, "error_description") ??
        getErrorField(error, "error") ??
        "";
  const code = getErrorField(error, "code")?.toLowerCase() ?? "";
  const normalized = rawMessage.toLowerCase();

  if (
    code.includes("user_already_exists") ||
    code.includes("email_exists") ||
    normalized.includes("already registered") ||
    normalized.includes("already exists")
  ) {
    return "An account already exists with this email address.";
  }

  if (
    code.includes("weak_password") ||
    normalized.includes("weak password") ||
    normalized.includes("password should")
  ) {
    return rawMessage || "Please choose a stronger password.";
  }

  if (
    code.includes("email_address_invalid") ||
    normalized.includes("invalid email")
  ) {
    return "Enter a valid email address.";
  }

  if (
    code.includes("signup_disabled") ||
    normalized.includes("signups not allowed") ||
    normalized.includes("signup is disabled") ||
    normalized.includes("email signups are disabled")
  ) {
    return "Email registration is currently disabled. Please contact support.";
  }

  if (
    code.includes("over_email_send_rate_limit") ||
    normalized.includes("rate limit") ||
    normalized.includes("too many requests")
  ) {
    return "Too many registration attempts. Please wait a few minutes and try again.";
  }

  if (
    normalized.includes("database error") ||
    normalized.includes("saving new user")
  ) {
    const status = getErrorStatus(error);
    const diagnostic = [
      status ? `HTTP ${status}` : null,
      code || null,
    ].filter(Boolean).join(" · ");

    return `Supabase Auth could not save the new account${diagnostic ? ` (${diagnostic})` : ""}: ${rawMessage || "Database error saving new user."}`;
  }

  if (rawMessage) {
    const status = getErrorStatus(error);
    const diagnostic = [
      status ? `HTTP ${status}` : null,
      code || null,
    ].filter(Boolean).join(" · ");
    return `${rawMessage}${diagnostic ? ` (${diagnostic})` : ""}`;
  }

  return "Registration is temporarily unavailable. Please try again.";
}

export async function registerAccount(
  _previousState: RegisterAccountState,
  formData: FormData,
): Promise<RegisterAccountState> {
  try {
    const website = formData.get("website");
    if (typeof website === "string" && website.trim()) {
      return { success: false, message: "Unable to create account." };
    }

    const fullName = requiredText(formData, "fullName");
    const email = requiredText(formData, "email").toLowerCase();
    const password = requiredText(formData, "password");
    const confirmPassword = requiredText(formData, "confirmPassword");

    if (fullName.length < 2 || fullName.length > 100) {
      return {
        success: false,
        message: "Your name must be between 2 and 100 characters.",
      };
    }

    if (!email.includes("@") || email.length > 254) {
      return { success: false, message: "Enter a valid email address." };
    }

    if (password.length < 8) {
      return {
        success: false,
        message: "Password must contain at least 8 characters.",
      };
    }

    if (password !== confirmPassword) {
      return { success: false, message: "Passwords do not match." };
    }

    // Account-only registration. Business/profile setup happens after the
    // first confirmed sign-in through /auth/continue.
    const supabase = await createClient();
    const confirmationCallback = getAppUrl(
      "/auth/callback?flow=email-confirmation",
    );

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: confirmationCallback,
        data: { full_name: fullName },
      },
    });

    if (error) {
      const message = readableAuthError(error);
      console.error("[registerAccount] Supabase signup failed", {
        code: getErrorField(error, "code"),
        status: getErrorStatus(error),
        message:
          error instanceof Error ? error.message : getErrorField(error, "message"),
      });
      return { success: false, message };
    }

    if (!data.user) {
      console.error(
        "[registerAccount] Supabase signup returned no user and no error.",
      );
      return {
        success: false,
        message: "Registration is temporarily unavailable. Please try again.",
      };
    }

    if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return {
        success: false,
        message: "An account already exists with this email address.",
      };
    }

    const cookieStore = await cookies();

    if (!data.session) {
      // Confirmation is enabled. Keep the email server-only so the waiting page
      // can display/resend without putting the address in the URL.
      cookieStore.set(PENDING_EMAIL_COOKIE, email, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24,
      });

      return {
        success: true,
        message: "We sent a confirmation link to your email address.",
        requiresEmailConfirmation: true,
        destination: getAppUrl("/register/check-email"),
      };
    }

    // If Confirm email is disabled in Supabase, no confirmation email is sent.
    // Sign the user out so registration still remains account-only.
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      console.error(
        "[registerAccount] post-registration sign-out failed:",
        signOutError.message,
      );
    }

    cookieStore.delete(PENDING_EMAIL_COOKIE);

    return {
      success: true,
      message: "Your account is created. Sign in to set up your business.",
      requiresEmailConfirmation: false,
      destination: getAppUrl("/login?registered=1"),
    };
  } catch (error) {
    const message = readableAuthError(error);
    console.error("[registerAccount] failed:", message);
    return { success: false, message };
  }
}
