"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { FaFacebookF } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";

import { createClient } from "@/lib/supabase/client";

const signInErrorMessage =
  "Unable to sign in. Check your credentials or account status.";

const oauthErrorMessages: Record<string, string> = {
  oauth_failed:
    "Social sign-in could not be completed. Please try again.",
  oauth_email_required:
    "Your social account did not provide an email address. Use another account or sign up with email.",
  account_inactive:
    "This Tenh POS account is inactive. Contact your business owner or TENH support.",
};

type OAuthProvider = "google" | "facebook";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [rememberMe, setRememberMe] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] =
    useState<OAuthProvider | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);


  const accountCreated = searchParams.get("registered") === "1";

  useEffect(() => {
    const error = searchParams.get("error");

    if (error && oauthErrorMessages[error]) {
      setErrorMessage(oauthErrorMessages[error]);
    }
  }, [searchParams]);

  async function handleLogin(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setLoading(true);
    setErrorMessage("");

    try {
      const { data, error } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (error || !data.user) {
        setErrorMessage(signInErrorMessage);
        return;
      }

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select("role, is_active")
        .eq("id", data.user.id)
        .maybeSingle();

      if (
        profileError ||
        !profile ||
        profile.is_active !== true
      ) {
        await supabase.auth.signOut();
        setErrorMessage(signInErrorMessage);
        return;
      }

      if (rememberMe) {
        localStorage.setItem("rememberMe", "true");
      } else {
        localStorage.removeItem("rememberMe");
      }

      router.replace("/auth/continue");
      router.refresh();
    } catch {
      setErrorMessage(
        "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider: OAuthProvider) {
    setErrorMessage("");
    setOauthLoading(provider);

    try {
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
        },
      });

      if (error) {
        setErrorMessage(
          `Unable to sign in with ${
            provider === "google" ? "Google" : "Facebook"
          }. Please try again.`,
        );
        setOauthLoading(null);
      }
    } catch {
      setErrorMessage(
        "Social sign-in could not be started. Please try again.",
      );
      setOauthLoading(null);
    }
  }

  const anyLoading = loading || oauthLoading !== null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-7 text-center">
          <Image
            src="/tenh-pos-logo.png"
            alt="Tenh POS logo"
            width={72}
            height={72}
            priority
            className="mx-auto mb-4 rounded-2xl"
          />

          <h1 className="text-3xl font-bold text-slate-900">
            Tenh POS
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Sign in to manage your business
          </p>
        </div>

        {accountCreated && (
          <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            Account created. Sign in to set up your business.
          </div>
        )}

        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => handleOAuth("google")}
            disabled={anyLoading}
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FcGoogle size={20} />
            {oauthLoading === "google"
              ? "Connecting..."
              : "Continue with Google"}
          </button>

          <button
            type="button"
            onClick={() => handleOAuth("facebook")}
            disabled={anyLoading}
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1877F2] text-white">
              <FaFacebookF size={12} />
            </span>
            {oauthLoading === "facebook"
              ? "Connecting..."
              : "Continue with Facebook"}
          </button>
        </div>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            or sign in with email
          </span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Email address
            </label>

            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="owner@example.com"
              className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Password
            </label>

            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                placeholder="Enter your password"
                className="w-full rounded-lg border border-slate-300 px-4 py-3 pr-12 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />

              <button
                type="button"
                onClick={() =>
                  setShowPassword((current) => !current)
                }
                aria-label={
                  showPassword
                    ? "Hide password"
                    : "Show password"
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-700"
              >
                {showPassword ? (
                  <EyeOff size={20} />
                ) : (
                  <Eye size={20} />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <input
                id="remember"
                type="checkbox"
                checked={rememberMe}
                onChange={(event) =>
                  setRememberMe(event.target.checked)
                }
                className="h-4 w-4 rounded border-slate-300 accent-blue-600"
              />

              <label
                htmlFor="remember"
                className="cursor-pointer text-sm text-slate-600"
              >
                Remember me
              </label>
            </div>

            <button
              type="button"
              onClick={() =>
                router.push("/forgot-password")
              }
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              Forgot Password?
            </button>
          </div>

          {errorMessage && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={anyLoading}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-semibold text-blue-600 hover:text-blue-700 hover:underline"
          >
            Create account
          </Link>
        </p>
      </div>
    </main>
  );
}
