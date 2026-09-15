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

function cleanupMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to create your Tenh POS account.";
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

    const {
      data: existingProfile,
      error: profileLookupError,
    } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (profileLookupError) {
      throw new Error(
        `Unable to check email address: ${profileLookupError.message}`,
      );
    }

    if (existingProfile) {
      return {
        success: false,
        message: "An account already exists with this email address.",
      };
    }

    const supabase = await createClient();
    const { data: authData, error: authError } =
      await supabase.auth.signUp({
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
          authError?.message ?? "Unable to create your account.",
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
        `Unable to create your profile: ${profileError.message}`,
      );
    }

    if (authData.session) {
      // Email confirmation may be disabled in Supabase. Even then, keep the
      // requested product flow explicit: registration first, sign-in second,
      // business onboarding after the first successful sign-in.
      await supabase.auth.signOut();
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
    // Account creation only has two records to clean up. Business data does
    // not exist until first-login onboarding succeeds.
    if (createdAuthUserId) {
      await supabaseAdmin
        .from("profiles")
        .delete()
        .eq("id", createdAuthUserId);

      await supabaseAdmin.auth.admin.deleteUser(createdAuthUserId);
    }

    return {
      success: false,
      message: cleanupMessage(error),
    };
  }
}
