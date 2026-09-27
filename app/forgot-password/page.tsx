"use client";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setMessage("");
    setErrorMessage("");

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo:
            `${window.location.origin}/reset-password`,
        },
      );
      if (error) {
        setErrorMessage(error.status === 429 ? "Too many requests. Please wait a minute before trying again." : "Unable to send the reset link right now. Please try again shortly.");
        return;
      }
      setMessage("If an account exists for that email, a password reset link has been sent. Open it in this browser. Check your spam folder too.");
    } catch {
      setErrorMessage("Unable to send the reset link. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow">

        <button
          type="button"
          onClick={() => router.push("/login")}
          className="mb-6 flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-blue-600"
        >
          <ArrowLeft size={18} />
          Back to Login
        </button>

        <h1 className="text-2xl font-bold">
          Forgot Password
        </h1>

        <p className="mt-2 text-sm text-slate-500">
          Enter your email to receive a password reset link.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-6 space-y-4"
        >
          <input
            type="email"
            aria-label="Email address"
            autoComplete="email"
            required
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            placeholder="Email Address"
            className="w-full rounded-lg border px-4 py-3"
          />

          <button
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white"
          >
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>

        {message && (
          <p role="status" className="mt-4 text-sm">
            {message}
          </p>
        )}
        {errorMessage && <p role="alert" className="mt-4 text-sm text-red-600">{errorMessage}</p>}
      </div>
    </main>
  );
}
