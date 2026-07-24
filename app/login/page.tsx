"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showSignupInfo, setShowSignupInfo] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setErrorMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-900">
            POS System
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Sign in to manage your business
          </p>
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
      onChange={(event) => setPassword(event.target.value)}
      placeholder="Enter your password"
      className="w-full rounded-lg border border-slate-300 px-4 py-3 pr-12 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
    />

    <button
      type="button"
      onClick={() => setShowPassword((current) => !current)}
      aria-label={showPassword ? "Hide password" : "Show password"}
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

<p className="text-center text-sm text-slate-500">
  Don&apos;t have an account?{" "}
  <button
    type="button"
    onClick={() => setShowSignupInfo(true)}
    className="font-semibold text-blue-600 hover:text-blue-700 hover:underline"
  >
    Sign up
  </button>
</p>
        {showSignupInfo && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    onClick={() => setShowSignupInfo(false)}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="signup-info-title"
      onClick={(event) => event.stopPropagation()}
      className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2
            id="signup-info-title"
            className="text-xl font-bold text-slate-900"
          >
            Need an account?
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Account registration is managed by the administrator.
            Please contact the administrator through Telegram to Register
            your account.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowSignupInfo(false)}
          aria-label="Close"
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          ✕
        </button>
      </div>

      <a
        href="https://t.me/NOC_UY"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700"
      >
        Contact Admin via Telegram
      </a>

      <button
        type="button"
        onClick={() => setShowSignupInfo(false)}
        className="mt-3 w-full rounded-lg border border-slate-300 px-4 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        Close
      </button>
    </div>
  </div>
)}  

          {errorMessage && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        
      </div>
    </main>
  );
}