import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft, CheckCircle2, MailCheck, RefreshCw } from "lucide-react";

import { resendConfirmationEmail } from "./actions";

const PENDING_EMAIL_COOKIE = "tenh_pending_signup_email";

function maskEmail(email: string | undefined) {
  if (!email || !email.includes("@")) return "your email address";
  const [name, domain] = email.split("@");
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${"•".repeat(Math.max(3, name.length - visible.length))}@${domain}`;
}

type Props = {
  searchParams: Promise<{
    error?: string;
    resent?: string;
  }>;
};

export default async function CheckEmailPage({ searchParams }: Props) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const pendingEmail = cookieStore.get(PENDING_EMAIL_COOKIE)?.value;
  const emailLabel = maskEmail(pendingEmail);

  const errorMessage =
    params.error === "resend_failed"
      ? "We could not resend the email right now. Please wait a moment and try again."
      : params.error === "email_missing"
        ? "Your pending registration email was not found. Please return to registration and try again."
        : params.error === "invalid"
          ? "This confirmation link is invalid or expired. Please resend a new confirmation email."
          : null;

  return (
    <main className="min-h-screen bg-[#f6f8fc] px-4 py-8 sm:py-12">
      <div className="mx-auto grid w-full max-w-[980px] overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.10)] lg:grid-cols-[1fr_0.82fr]">
        <section className="p-7 sm:p-10 lg:p-12">
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
              <p className="font-extrabold tracking-tight text-slate-950">Tenh POS</p>
              <p className="text-xs text-slate-500">Build. Sell. Grow.</p>
            </div>
          </Link>

          <div className="mt-10 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <MailCheck size={32} />
          </div>

          <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-blue-600">
            Confirm your email
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.035em] text-slate-950 sm:text-4xl">
            Check your inbox.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-slate-600">
            We sent a confirmation link to <strong className="text-slate-800">{emailLabel}</strong>.
            Click the link in that email to verify your account.
          </p>

          <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex gap-3">
              <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={20} />
              <div>
                <p className="font-semibold text-slate-900">After you confirm</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  TENH will sign you in and open <strong>Get Started</strong>, where you can choose your business type, business name and <strong>name.tenh-pos.com</strong> store address.
                </p>
              </div>
            </div>
          </div>

          {params.resent === "1" ? (
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              A new confirmation email has been sent.
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <form action={resendConfirmationEmail}>
              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <RefreshCw size={17} />
                Resend email
              </button>
            </form>
            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700"
            >
              Go to sign in
            </Link>
          </div>

          <p className="mt-5 text-xs leading-5 text-slate-500">
            Didn&apos;t see the email? Check your spam or junk folder. Confirmation links can take a moment to arrive.
          </p>

          <Link
            href="/register"
            className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-800"
          >
            <ArrowLeft size={16} />
            Back to registration
          </Link>
        </section>

        <aside className="hidden bg-[radial-gradient(circle_at_80%_12%,rgba(37,99,235,0.58),transparent_28%),linear-gradient(150deg,#03132f,#073772_62%,#0a57a8)] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-300">
              One more step
            </p>
            <h2 className="mt-4 text-3xl font-extrabold tracking-[-0.035em]">
              Confirm first. Build your store next.
            </h2>
            <p className="mt-4 text-sm leading-6 text-blue-100/85">
              Email confirmation protects your account before TENH creates any business workspace or store address.
            </p>
          </div>

          <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.07] p-6 text-sm text-blue-50/90">
            <Step number="1" text="Create your account" done />
            <Step number="2" text="Confirm your email" active />
            <Step number="3" text="Choose your business setup" />
            <Step number="4" text="Open your POS dashboard" />
          </div>
        </aside>
      </div>
    </main>
  );
}

function Step({
  number,
  text,
  done = false,
  active = false,
}: {
  number: string;
  text: string;
  done?: boolean;
  active?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          done
            ? "bg-emerald-500 text-white"
            : active
              ? "bg-blue-500 text-white ring-4 ring-blue-400/20"
              : "bg-white/10 text-blue-100"
        }`}
      >
        {done ? "✓" : number}
      </span>
      <span className={active ? "font-semibold text-white" : ""}>{text}</span>
    </div>
  );
}
