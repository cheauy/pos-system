"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useActionState,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ArrowRight, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { FaFacebookF } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";

import { createClient } from "@/lib/supabase/client";

import { registerAccount } from "./actions";
import { initialRegisterAccountState } from "./state";

type OAuthProvider = "google" | "facebook";

function safeUiMessage(value: unknown) {
  if (typeof value !== "string") {
    return "Unable to create your account. Please try again.";
  }

  const message = value.trim();
  if (!message || message === "{}" || message === "[object Object]") {
    return "Unable to create your account. Please try again.";
  }

  return message;
}

export default function RegisterForm() {
  const supabase = createClient();
  const [state, formAction, pending] = useActionState(
    registerAccount,
    initialRegisterAccountState,
  );
  const [showPassword, setShowPassword] = useState(false);
  const [oauthLoading, setOauthLoading] =
    useState<OAuthProvider | null>(null);
  const [oauthError, setOauthError] = useState("");

  useEffect(() => {
    if (state.success && state.destination) {
      window.location.assign(state.destination);
    }
  }, [state.success, state.destination]);

  async function handleOAuth(provider: OAuthProvider) {
    setOauthError("");
    setOauthLoading(provider);

    try {
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });

      if (error) {
        setOauthError(
          `Unable to continue with ${
            provider === "google" ? "Google" : "Facebook"
          }. Please try again.`,
        );
        setOauthLoading(null);
      }
    } catch {
      setOauthError(
        "Social sign-up could not be started. Please try again.",
      );
      setOauthLoading(null);
    }
  }

  if (state.success && state.requiresEmailConfirmation) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f8fc] px-4 py-10">
        <section className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/50">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={32} />
          </div>
          <h1 className="mt-5 text-2xl font-bold text-slate-950">
            Check your email
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {state.message}
          </p>
          <Link
            href="/login"
            className="mt-7 inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700"
          >
            Go to sign in
          </Link>
        </section>
      </main>
    );
  }

  const busy = pending || oauthLoading !== null;

  return (
    <main className="min-h-screen bg-[#f6f8fc] px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-[1080px] overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.10)] lg:grid lg:grid-cols-[1fr_0.9fr]">
        <section className="p-6 sm:p-9 lg:p-11">
          <Link href="/" className="inline-flex items-center gap-3">
            <Image
              src="/tenh-pos-logo.png"
              alt="Tenh POS logo"
              width={48}
              height={48}
              priority
              className="h-12 w-12 rounded-2xl object-contain"
            />
            <div>
              <p className="font-extrabold tracking-tight text-slate-950">
                Tenh POS
              </p>
              <p className="text-xs text-slate-500">Build. Sell. Grow.</p>
            </div>
          </Link>

          <div className="mt-9">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">
              Create account
            </p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.035em] text-slate-950 sm:text-4xl">
              Start with your account.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
              Create your Tenh POS account first. After your first sign-in, we&apos;ll guide you through setting up your business and store address.
            </p>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => handleOAuth("google")}
              disabled={busy}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FcGoogle size={20} />
              {oauthLoading === "google"
                ? "Connecting..."
                : "Continue with Google"}
            </button>

            <button
              type="button"
              onClick={() => handleOAuth("facebook")}
              disabled={busy}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
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
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              or create with email
            </span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <form action={formAction} className="space-y-4">
            <div className="pointer-events-none absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
              <label htmlFor="website">Website</label>
              <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
            </div>

            <Field label="Full name" htmlFor="fullName">
              <input
                id="fullName"
                name="fullName"
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
                className={inputClass}
                placeholder="Your name"
              />
            </Field>

            <Field label="Email address" htmlFor="email">
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className={inputClass}
                placeholder="owner@example.com"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Password" htmlFor="password">
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className={`${inputClass} pr-11`}
                    placeholder="At least 8 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Field>

              <Field label="Confirm password" htmlFor="confirmPassword">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className={inputClass}
                  placeholder="Repeat password"
                />
              </Field>
            </div>

            {(state.message && !state.success) || oauthError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {oauthError || safeUiMessage(state.message)}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 font-bold text-white shadow-lg shadow-blue-600/15 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Creating account..." : "Create account"}
              {!pending && <ArrowRight size={18} />}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-blue-600 hover:underline">
              Sign in
            </Link>
          </p>
        </section>

        <aside className="hidden bg-[radial-gradient(circle_at_85%_12%,rgba(37,99,235,0.55),transparent_25%),linear-gradient(150deg,#03132f,#072f69_58%,#0754a8)] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-300">
              First sign-in setup
            </p>
            <h2 className="mt-4 text-3xl font-extrabold tracking-[-0.035em]">
              Account first. Business setup next.
            </h2>
            <p className="mt-4 text-sm leading-6 text-blue-100/85">
              After signing in, choose your business type, business name and your permanent tenh-pos.com store address.
            </p>
          </div>

          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.07] p-5 text-sm text-blue-50/90">
            <Step number="1" text="Create or connect your account" />
            <Step number="2" text="Sign in to Tenh POS" />
            <Step number="3" text="Set up your business" />
            <Step number="4" text="Open your POS dashboard" />
          </div>
        </aside>
      </div>
    </main>
  );
}

function Step({ number, text }: { number: string; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white">
        {number}
      </span>
      <span>{text}</span>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block text-sm font-semibold text-slate-700">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100";
