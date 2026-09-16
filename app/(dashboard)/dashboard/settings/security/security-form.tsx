"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  KeyRound,
  Laptop,
  LockKeyhole,
  LogOut,
  Mail,
  Monitor,
  ShieldCheck,
  Smartphone,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { FaFacebookF } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";

import { createClient } from "@/lib/supabase/client";
import {
  changePassword,
  deleteOwnAccount,
  type ChangePasswordState,
  type DeleteAccountState,
} from "./actions";

type SecurityFormProps = {
  email: string;
  emailVerified: boolean;
  hasPasswordIdentity: boolean;
  lastSignInAt: string | null;
  profileRole: string;
};

type Factor = {
  id: string;
  status?: string;
  friendly_name?: string | null;
};

type Enrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

type Provider = "google" | "facebook";

const initialPasswordState: ChangePasswordState = {
  success: false,
  message: "",
};

const initialDeleteState: DeleteAccountState = {
  success: false,
  message: "",
};

export default function SecurityForm({
  email,
  emailVerified,
  hasPasswordIdentity,
  lastSignInAt,
  profileRole,
}: SecurityFormProps) {
  const supabase = useMemo(() => createClient(), []);
  const [passwordState, passwordAction, passwordPending] = useActionState(
    changePassword,
    initialPasswordState,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteOwnAccount,
    initialDeleteState,
  );

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [verifiedFactors, setVerifiedFactors] = useState<Factor[]>([]);
  const [identities, setIdentities] = useState<string[]>([]);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [deviceLabel, setDeviceLabel] = useState("Current browser");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  useEffect(() => {
    void refreshAuthState();
    setDeviceLabel(detectDeviceLabel());
  }, []);

  useEffect(() => {
    if (!deleteState.success) return;

    void supabase.auth.signOut({ scope: "local" }).finally(() => {
      window.location.assign("/login?account_deleted=1");
    });
  }, [deleteState.success, supabase]);

  async function refreshAuthState() {
    const [factorResult, identityResult] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.getUserIdentities(),
    ]);

    if (!factorResult.error) {
      const factors = (factorResult.data?.totp ?? []) as Factor[];
      setVerifiedFactors(
        factors.filter((factor) => factor.status === "verified"),
      );
    }

    if (!identityResult.error) {
      setIdentities(
        (identityResult.data?.identities ?? []).map(
          (identity) => identity.provider,
        ),
      );
    }
  }

  async function beginTotpEnrollment() {
    setAuthBusy(true);
    setAuthError("");
    setAuthMessage("");

    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Tenh POS Authenticator",
      });

      if (error) throw error;

      const qrCode = normalizeQrSource(data.totp.qr_code);
      setEnrollment({
        factorId: data.id,
        qrCode,
        secret: data.totp.secret,
      });
    } catch (error) {
      setAuthError(readError(error, "Unable to start 2FA setup."));
    } finally {
      setAuthBusy(false);
    }
  }

  async function verifyTotp() {
    if (!enrollment || !/^\d{6}$/.test(totpCode.trim())) {
      setAuthError("Enter the 6-digit code from your authenticator app.");
      return;
    }

    setAuthBusy(true);
    setAuthError("");

    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: enrollment.factorId,
        code: totpCode.trim(),
      });

      if (error) throw error;

      setEnrollment(null);
      setTotpCode("");
      setAuthMessage("Two-factor authentication is now enabled.");
      await refreshAuthState();
    } catch (error) {
      setAuthError(readError(error, "Unable to verify the authenticator code."));
    } finally {
      setAuthBusy(false);
    }
  }

  async function disableTotp() {
    if (verifiedFactors.length === 0) return;

    setAuthBusy(true);
    setAuthError("");
    setAuthMessage("");

    try {
      for (const factor of verifiedFactors) {
        const { error } = await supabase.auth.mfa.unenroll({
          factorId: factor.id,
        });
        if (error) throw error;
      }

      await supabase.auth.refreshSession();
      setAuthMessage("Two-factor authentication has been disabled.");
      await refreshAuthState();
    } catch (error) {
      setAuthError(
        readError(
          error,
          "Unable to disable 2FA. Re-authenticate with your authenticator and try again.",
        ),
      );
    } finally {
      setAuthBusy(false);
    }
  }

  async function connectProvider(provider: Provider) {
    setAuthBusy(true);
    setAuthError("");
    setAuthMessage("");

    try {
      const siteUrl = (
        process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
      ).replace(/\/$/, "");
      const redirectTo = `${siteUrl}/auth/link-callback?provider=${provider}`;

      const { data, error } = await supabase.auth.linkIdentity({
        provider,
        options: { redirectTo },
      });

      if (error) throw error;

      const url = (data as { url?: string | null } | null)?.url;
      if (url) {
        window.location.assign(url);
        return;
      }

      setAuthMessage(
        `${provider === "google" ? "Google" : "Facebook"} connection started.`,
      );
    } catch (error) {
      setAuthError(
        readError(
          error,
          `Unable to connect ${provider === "google" ? "Google" : "Facebook"}. Make sure Manual Linking is enabled in Supabase Auth.`,
        ),
      );
      setAuthBusy(false);
    }
  }

  async function signOutOthers() {
    setAuthBusy(true);
    setAuthError("");
    setAuthMessage("");

    const { error } = await supabase.auth.signOut({ scope: "others" });
    setAuthBusy(false);

    if (error) {
      setAuthError(error.message);
      return;
    }

    setAuthMessage("Other device sessions have been signed out.");
  }

  async function signOutAll() {
    setAuthBusy(true);
    const { error } = await supabase.auth.signOut({ scope: "global" });

    if (error) {
      setAuthBusy(false);
      setAuthError(error.message);
      return;
    }

    window.location.assign("/login");
  }

  const passwordRules = {
    length: newPassword.length >= 8,
    upper: /[A-Z]/.test(newPassword),
    lower: /[a-z]/.test(newPassword),
    number: /\d/.test(newPassword),
    symbol: /[^A-Za-z0-9]/.test(newPassword),
  };

  const twoFactorEnabled = verifiedFactors.length > 0;
  const isProtectedOwner = profileRole === "owner" || profileRole === "super_admin";

  return (
    <>
      {(authMessage || authError) && (
        <div
          className={
            authError
              ? "rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300"
              : "rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300"
          }
        >
          {authError || authMessage}
        </div>
      )}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.82fr)]">
        <div className="space-y-5">
          <form
            action={passwordAction}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900"
          >
            <SectionHeading
              icon={KeyRound}
              title={hasPasswordIdentity ? "Change Password" : "Create Password"}
              description={
                hasPasswordIdentity
                  ? "Use a strong password to keep your account secure."
                  : "Add email and password sign-in to this account."
              }
            />

            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.75fr)]">
              <div className="space-y-4">
                {hasPasswordIdentity && (
                  <PasswordField
                    id="current_password"
                    name="current_password"
                    label="Current password"
                    placeholder="Enter your current password"
                    visible={showCurrent}
                    onToggle={() => setShowCurrent((value) => !value)}
                  />
                )}
                <PasswordField
                  id="new_password"
                  name="new_password"
                  label="New password"
                  placeholder="Minimum 8 characters"
                  visible={showNew}
                  onToggle={() => setShowNew((value) => !value)}
                  value={newPassword}
                  onChange={setNewPassword}
                />
                <PasswordField
                  id="confirm_password"
                  name="confirm_password"
                  label="Confirm new password"
                  placeholder="Enter the new password again"
                  visible={showConfirm}
                  onToggle={() => setShowConfirm((value) => !value)}
                />

                {passwordState.message && (
                  <StatusBox success={passwordState.success}>
                    {passwordState.message}
                  </StatusBox>
                )}

                <button
                  type="submit"
                  disabled={passwordPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <LockKeyhole className="h-4 w-4" />
                  {passwordPending
                    ? "Updating..."
                    : hasPasswordIdentity
                      ? "Update Password"
                      : "Create Password"}
                </button>
              </div>

              <div className="rounded-2xl bg-blue-50/80 p-5 dark:bg-blue-950/25">
                <p className="font-bold text-slate-900 dark:text-white">
                  Password requirements
                </p>
                <div className="mt-4 space-y-3">
                  <Requirement ok={passwordRules.length}>At least 8 characters</Requirement>
                  <Requirement ok={passwordRules.upper}>Uppercase letter (A-Z)</Requirement>
                  <Requirement ok={passwordRules.lower}>Lowercase letter (a-z)</Requirement>
                  <Requirement ok={passwordRules.number}>At least one number (0-9)</Requirement>
                  <Requirement ok={passwordRules.symbol}>At least one special symbol</Requirement>
                </div>
              </div>
            </div>
          </form>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <SectionHeading
                icon={ShieldCheck}
                title="Two-Factor Authentication (2FA)"
                description="Add an extra layer of security to protect your account."
                tone="green"
              />
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {twoFactorEnabled ? "Enabled" : "Recommended"}
              </span>
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">Authenticator App</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Use Google Authenticator, Authy, 1Password or a compatible TOTP app.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    twoFactorEnabled ? void disableTotp() : void beginTotpEnrollment()
                  }
                  disabled={authBusy}
                  className={
                    twoFactorEnabled
                      ? "rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:hover:bg-red-950/20"
                      : "rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                  }
                >
                  {twoFactorEnabled ? "Disable 2FA" : "Enable 2FA"}
                </button>
              </div>

              {enrollment && (
                <div className="mt-5 grid gap-5 border-t border-slate-100 pt-5 md:grid-cols-[220px_minmax(0,1fr)] dark:border-slate-800">
                  <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200 dark:bg-white">
                    <img
                      src={enrollment.qrCode}
                      alt="Authenticator QR code"
                      className="mx-auto aspect-square w-full"
                    />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      Scan the QR code, then enter the 6-digit code.
                    </p>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Manual setup key
                    </p>
                    <code className="mt-2 block break-all rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {enrollment.secret}
                    </code>
                    <div className="mt-4 flex max-w-sm gap-2">
                      <input
                        value={totpCode}
                        onChange={(event) =>
                          setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                        }
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="123456"
                        className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-center font-mono text-lg tracking-[0.25em] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950"
                      />
                      <button
                        type="button"
                        onClick={() => void verifyTotp()}
                        disabled={authBusy || totpCode.length !== 6}
                        className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        Verify
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
            <SectionHeading
              icon={Monitor}
              title="Login Methods"
              description="Manage how you sign in to your account."
              tone="purple"
            />

            <div className="mt-5 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
              <ProviderRow
                icon={<FcGoogle size={25} />}
                label="Google"
                description="Connect your Google account for faster login."
                connected={identities.includes("google")}
                disabled={authBusy}
                onConnect={() => void connectProvider("google")}
              />
              <ProviderRow
                icon={
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1877F2] text-white">
                    <FaFacebookF size={14} />
                  </span>
                }
                label="Facebook"
                description="Connect your Facebook account for faster login."
                connected={identities.includes("facebook")}
                disabled={authBusy}
                onConnect={() => void connectProvider("facebook")}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <SectionHeading
                icon={Laptop}
                title="Active Sessions"
                description="Manage your current session and revoke other devices."
              />
              <button
                type="button"
                onClick={() => void signOutOthers()}
                disabled={authBusy}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <LogOut className="h-4 w-4" />
                Sign out other devices
              </button>
            </div>

            <div className="mt-5 flex flex-col gap-4 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
                  <Laptop className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">{deviceLabel}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Current device · {formatLastSignIn(lastSignInAt)}
                  </p>
                </div>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Active now
              </span>
            </div>

            <button
              type="button"
              onClick={() => void signOutAll()}
              disabled={authBusy}
              className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-red-600 hover:text-red-700 disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" />
              Sign out all devices including this one
            </button>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6 text-white shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-xl font-bold">Keep your account safe</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Follow these security tips to protect your business and data.
            </p>
            <div className="mt-5 space-y-4 text-sm text-slate-100">
              {[
                "Use a strong, unique password",
                "Enable two-factor authentication",
                "Keep your recovery information up to date",
                "Sign out from unused devices",
                "Be careful with suspicious links",
              ].map((tip) => (
                <div key={tip} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600">
                    <Check className="h-4 w-4" />
                  </span>
                  <span>{tip}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <SectionHeading
              icon={Mail}
              title="Account recovery"
              description="Your verified login email is used for account recovery."
            />
            <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
              <span className="min-w-0 truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                {email || "No email"}
              </span>
              <span
                className={
                  emailVerified
                    ? "inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                    : "inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                }
              >
                {emailVerified ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                {emailVerified ? "Verified" : "Unverified"}
              </span>
            </div>
          </section>

          <section className="rounded-2xl border border-red-200 bg-red-50/80 p-5 shadow-sm dark:border-red-900/50 dark:bg-red-950/15">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-300">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-bold text-red-700 dark:text-red-300">Danger zone</h2>
                <p className="mt-1 text-sm text-red-600/80 dark:text-red-300/80">
                  Account deletion cannot be reversed.
                </p>
              </div>
            </div>

            <form action={deleteAction} className="mt-5 space-y-3">
              {isProtectedOwner ? (
                <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Owner and Super Admin accounts are protected. Transfer ownership before deleting the account.
                </div>
              ) : (
                <>
                  <label className="block text-xs font-semibold text-red-700 dark:text-red-300">
                    Type DELETE to confirm
                  </label>
                  <input
                    name="confirmation"
                    value={deleteConfirmation}
                    onChange={(event) => setDeleteConfirmation(event.target.value)}
                    placeholder="DELETE"
                    autoComplete="off"
                    className="w-full rounded-xl border border-red-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 dark:border-red-900 dark:bg-slate-950"
                  />
                  <button
                    type="submit"
                    disabled={deletePending || deleteConfirmation !== "DELETE"}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300"
                  >
                    <Trash2 className="h-4 w-4" />
                    {deletePending ? "Deleting..." : "Delete account"}
                  </button>
                </>
              )}

              {deleteState.message && !deleteState.success && (
                <StatusBox success={false}>{deleteState.message}</StatusBox>
              )}
            </form>
          </section>
        </aside>
      </section>
    </>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  description,
  tone = "blue",
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  tone?: "blue" | "green" | "purple";
}) {
  const toneClass =
    tone === "green"
      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300"
      : tone === "purple"
        ? "bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-300"
        : "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300";

  return (
    <div className="flex items-start gap-3">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h2 className="font-bold text-slate-950 dark:text-white">{title}</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
      </div>
    </div>
  );
}

function PasswordField({
  id,
  name,
  label,
  placeholder,
  visible,
  onToggle,
  value,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  placeholder: string;
  visible: boolean;
  onToggle: () => void;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-semibold text-slate-800 dark:text-slate-200">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          required
          minLength={name === "current_password" ? undefined : 8}
          autoComplete={name === "current_password" ? "current-password" : "new-password"}
          placeholder={placeholder}
          {...(value !== undefined
            ? {
                value,
                onChange: (event: ChangeEvent<HTMLInputElement>) =>
                  onChange?.(event.target.value),
              }
            : {})}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-11 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700 dark:hover:text-slate-200"
        >
          {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}

function Requirement({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={
          ok
            ? "flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white"
            : "flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-slate-400 dark:bg-slate-700"
        }
      >
        <Check className="h-3.5 w-3.5" />
      </span>
      <span className={ok ? "text-slate-800 dark:text-slate-200" : "text-slate-500 dark:text-slate-400"}>
        {children}
      </span>
    </div>
  );
}

function StatusBox({ success, children }: { success: boolean; children: ReactNode }) {
  return (
    <div
      className={
        success
          ? "rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300"
          : "rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300"
      }
    >
      {children}
    </div>
  );
}

function ProviderRow({
  icon,
  label,
  description,
  connected,
  disabled,
  onConnect,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  connected: boolean;
  disabled: boolean;
  onConnect: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 bg-white p-4 sm:flex-row sm:items-center sm:justify-between dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-50 dark:bg-slate-800">
          {icon}
        </div>
        <div>
          <p className="font-bold text-slate-900 dark:text-white">{label}</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        </div>
      </div>
      {connected ? (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" /> Connected
        </span>
      ) : (
        <button
          type="button"
          onClick={onConnect}
          disabled={disabled}
          className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-60 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-950/30"
        >
          Connect
        </button>
      )}
    </div>
  );
}

function normalizeQrSource(value: string) {
  if (value.startsWith("data:") || value.startsWith("http")) return value;
  if (value.trim().startsWith("<svg")) {
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(value)}`;
  }
  return value;
}

function readError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === "string" && value) return value;
  }
  return fallback;
}

function detectDeviceLabel() {
  if (typeof navigator === "undefined") return "Current browser";
  const ua = navigator.userAgent;
  const browser = ua.includes("Edg/")
    ? "Edge"
    : ua.includes("Chrome/")
      ? "Chrome"
      : ua.includes("Firefox/")
        ? "Firefox"
        : ua.includes("Safari/")
          ? "Safari"
          : "Browser";
  const os = ua.includes("Windows")
    ? "Windows"
    : ua.includes("Mac OS")
      ? "macOS"
      : ua.includes("Android")
        ? "Android"
        : /iPhone|iPad/.test(ua)
          ? "iOS"
          : "Device";
  return `${os} · ${browser}`;
}

function formatLastSignIn(value: string | null) {
  if (!value) return "Signed in";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Signed in";
  return `signed in ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)}`;
}
