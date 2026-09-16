"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getRootUrl } from "@/lib/tenancy/domain";

import type { RegisterAccountState } from "./state";

function requiredText(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required.`);
  }

  return value.trim();
}

function readableError(error: unknown): string {
  if (typeof error === "string") {
    const value = error.trim();
    return value && value !== "{}" ? value : "";
  }

  if (error instanceof Error) {
    const value = error.message?.trim();
    return value && value !== "{}" ? value : "";
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;

    for (const key of [
      "message",
      "error_description",
      "error",
      "details",
      "hint",
    ]) {
      const value = record[key];
      if (typeof value === "string" && value.trim() && value.trim() !== "{}") {
        return value.trim();
      }
    }

    const code = record.code;
    if (typeof code === "string" && code.trim()) {
      return `Registration failed (${code.trim()}).`;
    }
  }

  return "";
}

function cleanupMessage(error: unknown) {
  return (
    readableError(error) ||
    "Unable to create your Tenh POS account. Please try again."
  );
}

async function cleanupPartialRegistration(userId: string) {
  // Cleanup must never replace the original registration error. Every step is
  // intentionally best-effort because the database/Auth state can be only
  // partially created when signup fails.
  try {
    await supabaseAdmin.from("profiles").delete().eq("id", userId);
  } catch (cleanupError) {
    console.error(
      "[registerAccount] profile cleanup failed:",
      readableError(cleanupError) || "unknown cleanup error",
    );
  }

  try {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) {
      console.error(
        "[registerAccount] auth cleanup failed:",
        readableError(error) || "unknown cleanup error",
      );
    }
  } catch (cleanupError) {
    console.error(
      "[registerAccount] auth cleanup threw:",
      readableError(cleanupError) || "unknown cleanup error",
    );
  }
}

export async function registerAccount(
  _previousState: RegisterAccountState,
  formData: FormData,
): Promise<RegisterAccountState> {
  let createdAuthUserId: string | null = null;

  try {
    // Simple bot trap. Real users never see or fill this field.
    const website = formData.get("website");
    if (typeof website === "string" && website.trim()) {
      return {
        success: false,
        message: "Unable to create account.",
      };
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
      return {
        success: false,
        message: "Enter a valid email address.",
      };
    }

    if (password.length < 8) {
      return {
        success: false,
        message: "Password must contain at least 8 characters.",
      };
    }

    if (password !== confirmPassword) {
      return {
        success: false,
        message: "Passwords do not match.",
      };
    }

    // Supabase Auth remains the source of truth for whether an email can sign
    // up. We intentionally do not query profiles first: a stale/missing profile
    // must not block creating an Auth account, and duplicate-email protection is
    // already enforced by Supabase Auth below.
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getRootUrl("/auth/continue"),
        data: {
          full_name: fullName,
        },
      },
    });

    if (authError || !authData.user) {
      return {
        success: false,
        message:
          readableError(authError) || "Unable to create your account.",
      };
    }

    if (
      Array.isArray(authData.user.identities) &&
      authData.user.identities.length === 0
    ) {
      return {
        success: false,
        message: "An account already exists with this email address.",
      };
    }

    createdAuthUserId = authData.user.id;

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: createdAuthUserId,
          full_name: fullName,
          email,
          role: "owner",
          is_active: true,
        },
        { onConflict: "id" },
      );

    if (profileError) {
      throw new Error(
        `Unable to create your profile: ${
          readableError(profileError) || "database rejected the profile"
        }`,
      );
    }

    if (authData.session) {
      // Registration creates the account only. Even when email confirmation is
      // disabled, sign the new account out so the next explicit sign-in is what
      // starts first-login business onboarding.
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        console.error(
          "[registerAccount] post-registration sign-out failed:",
          readableError(signOutError) || "unknown sign-out error",
        );
      }
    }

    return {
      success: true,
      message: authData.session
        ? "Your account is created. Sign in to set up your business."
        : "Your account is created. Check your email to confirm it, then sign in to set up your business.",
      requiresEmailConfirmation: !authData.session,
      destination: authData.session
        ? getRootUrl("/login?registered=1")
        : null,
    };
  } catch (error) {
    const message = cleanupMessage(error);

    // Log only a human-readable error string. Never log submitted passwords or
    // the service-role key.
    console.error("[registerAccount] failed:", message);

    if (createdAuthUserId) {
      await cleanupPartialRegistration(createdAuthUserId);
    }

    return {
      success: false,
      message,
    };
  }
}
