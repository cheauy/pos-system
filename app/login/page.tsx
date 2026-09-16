"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Store,
} from "lucide-react";
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

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setErrorMessage("");

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error || !data.user) {
        setErrorMessage(signInErrorMessage);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, is_active")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profileError || !profile || profile.is_active !== true) {
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
      setErrorMessage("Something went wrong. Please try again.");
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
        options: { redirectTo },
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
    <main className="relative min-h-screen overflow-hidden bg-[#f4f8ff] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <div className="pointer-events-none absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-blue-100/55 blur-2xl" />
      <div className="pointer-events-none absolute -right-20 -top-28 h-96 w-96 rounded-full bg-blue-100/70 blur-3xl" />

      <div className="relative mx-auto grid min-h-[calc(100vh-40px)] w-full max-w-[1380px] overflow-hidden rounded-[30px] border border-white/80 bg-white shadow-[0_30px_90px_rgba(30,64,175,0.14)] lg:grid-cols-[0.92fr_1.08fr]">
        <section className="flex items-center px-6 py-10 sm:px-10 md:px-14 lg:px-16 xl:px-20">
          <div className="mx-auto w-full max-w-[510px]">
            <div className="mb-8 text-center">
              <div className="mb-5 flex items-center justify-center gap-3">
                <Image
                  src="/tenh-pos-logo.png"
                  alt="Tenh POS logo"
                  width={76}
                  height={76}
                  priority
                  className="h-[68px] w-[68px] object-contain"
                />
                <span className="text-[38px] font-extrabold tracking-[-0.04em] text-[#08123b]">
                  Tenh POS
                </span>
              </div>
              <p className="text-[17px] font-medium text-slate-500">
                Sign in to manage your business
              </p>
              <p className="mt-1.5 text-[15px] text-slate-400">
                Manage your store, orders, and inventory in one place.
              </p>
            </div>

            {accountCreated && (
              <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                Account created. Sign in to set up your business.
              </div>
            )}

            <div className="grid gap-3.5">
              <button
                type="button"
                onClick={() => handleOAuth("google")}
                disabled={anyLoading}
                className="flex h-14 items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-5 text-[15px] font-semibold text-[#111b43] transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FcGoogle size={26} />
                {oauthLoading === "google"
                  ? "Connecting..."
                  : "Continue with Google"}
              </button>

              <button
                type="button"
                onClick={() => handleOAuth("facebook")}
                disabled={anyLoading}
                className="flex h-14 items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-5 text-[15px] font-semibold text-[#111b43] transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1877F2] text-white">
                  <FaFacebookF size={16} />
                </span>
                {oauthLoading === "facebook"
                  ? "Connecting..."
                  : "Continue with Facebook"}
              </button>
            </div>

            <div className="my-7 flex items-center gap-4">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-sm font-medium text-slate-400">
                or sign in with email
              </span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-semibold text-[#172044]"
                >
                  Email address
                </label>
                <div className="relative">
                  <Mail
                    size={19}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="owner@example.com"
                    className="h-14 w-full rounded-xl border border-slate-300 bg-white pl-12 pr-4 text-[15px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-semibold text-[#172044]"
                >
                  Password
                </label>
                <div className="relative">
                  <LockKeyhole
                    size={19}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    className="h-14 w-full rounded-xl border border-slate-300 bg-white pl-12 pr-12 text-[15px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-800"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor="remember"
                  className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-slate-600"
                >
                  <input
                    id="remember"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                    className="h-4.5 w-4.5 rounded border-slate-300 accent-blue-600"
                  />
                  Remember me
                </label>

                <button
                  type="button"
                  onClick={() => router.push("/forgot-password")}
                  className="text-sm font-semibold text-blue-600 transition hover:text-blue-700 hover:underline"
                >
                  Forgot Password?
                </button>
              </div>

              {errorMessage && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                  {errorMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={anyLoading}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0d5fff] to-[#2878ff] px-5 text-[16px] font-bold text-white shadow-[0_12px_24px_rgba(29,100,255,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Sign in"}
                {!loading && <ArrowRight size={19} />}
              </button>
            </form>

            <div className="my-7 h-px bg-slate-200" />

            <p className="text-center text-sm text-slate-500">
              Don&apos;t have an account?{" "}
              <Link
                href="/register"
                className="font-bold text-blue-600 transition hover:text-blue-700 hover:underline"
              >
                Create account
              </Link>
            </p>
          </div>
        </section>

        <section className="relative hidden min-h-full overflow-visible bg-[linear-gradient(145deg,#061f55_0%,#083d8c_46%,#0b5bc0_100%)] p-10 text-white lg:flex lg:flex-col xl:p-14">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-blue-400/20" />
          <div className="pointer-events-none absolute right-12 top-32 h-32 w-32 rounded-full bg-blue-300/10" />
          <div className="pointer-events-none absolute -bottom-28 -right-20 h-80 w-80 rounded-full border border-blue-300/10 bg-blue-400/10" />

          <div className="relative z-10 max-w-[590px]">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-sky-300">
              Powering modern businesses
            </p>
            <h2 className="mt-4 text-[46px] font-extrabold leading-[1.06] tracking-[-0.035em] xl:text-[52px]">
              Run your business smarter with{" "}
              <span className="bg-gradient-to-r from-[#35c7ff] to-[#2e8cff] bg-clip-text text-transparent">
                Tenh POS
              </span>
            </h2>
            <p className="mt-5 max-w-[560px] text-[17px] leading-7 text-blue-50/85">
              A modern point of sale system designed to help you sell, track, and grow — all in one place.
            </p>
          </div>

          <div className="relative z-20 mt-7 flex flex-1 items-center justify-center py-2">
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-[72%] w-[92%] -translate-x-1/2 -translate-y-1/2 rounded-[45%] bg-blue-300/15 blur-3xl" />
            <Image
              src="/tenh-pos-login-dashboard.svg"
              alt="Tenh POS dashboard preview"
              width={850}
              height={570}
              priority
              className="relative -ml-[8%] h-auto w-[116%] max-w-none rotate-[-1.25deg] drop-shadow-[0_38px_52px_rgba(0,0,0,0.38)] xl:-ml-[10%] xl:w-[120%]"
            />
          </div>

          <div className="relative z-10 mt-3 grid grid-cols-3 divide-x divide-white/15 rounded-2xl border border-white/10 bg-white/[0.055] px-2 py-5 backdrop-blur-sm">
            <div className="px-5">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 shadow-lg shadow-blue-950/20">
                <Boxes size={22} />
              </div>
              <h3 className="font-bold">Inventory tracking</h3>
              <p className="mt-1 text-sm leading-5 text-blue-100/75">
                Keep track of stock in real time
              </p>
            </div>
            <div className="px-5">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-400 to-purple-600 shadow-lg shadow-blue-950/20">
                <BarChart3 size={22} />
              </div>
              <h3 className="font-bold">Sales reports</h3>
              <p className="mt-1 text-sm leading-5 text-blue-100/75">
                Turn data into growth
              </p>
            </div>
            <div className="px-5">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-blue-950/20">
                <Store size={22} />
              </div>
              <h3 className="font-bold">Multi-store ready</h3>
              <p className="mt-1 text-sm leading-5 text-blue-100/75">
                Manage multiple locations with ease
              </p>
            </div>
          </div>

          <p className="relative z-10 mt-5 text-right text-sm italic text-sky-200/75">
            Build a brighter business
          </p>
        </section>
      </div>
    </main>
  );
}
