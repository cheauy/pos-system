"use client";

import {
  Camera,
  CalendarDays,
  CircleUserRound,
  Mail,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import styles from "./profile-responsive.module.css";

import {
  updateProfile,
  type UpdateProfileState,
} from "./actions";

type ProfileFormProps = {
  defaultFullName: string;
  email: string;
  role: string;
  showIdentity?: boolean;
  avatarUrl?: string;
  lastUpdated?: string;
  security?: ReactNode;
};

const initialState: UpdateProfileState = {
  success: false,
  message: "",
};

const compactQuery = "(max-width: 1279px), (max-width: 1366.98px) and (pointer: coarse)";
function subscribeCompact(notify: () => void) {
  const media = window.matchMedia(compactQuery);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}

export default function ProfileForm({
  defaultFullName,
  email,
  role,
  showIdentity, avatarUrl, lastUpdated, security,
}: ProfileFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState(initialState);
  const [pending, setPending] = useState(false);
  const [fullName, setFullName] = useState(defaultFullName);
  const [savedName, setSavedName] = useState(defaultFullName);
  const locked = useRef(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState("personal");
  const [photoName, setPhotoName] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [savedPreview, setSavedPreview] = useState<string | null>(null);
  const previewUrls = useRef<string[]>([]);
  const compact = useSyncExternalStore(subscribeCompact, () => window.matchMedia(compactQuery).matches, () => false);
  const dirty = fullName.trim() !== savedName.trim() || Boolean(photoName);
  useEffect(() => {
    const urls = previewUrls.current;
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, []);

  return (
    <>
    {showIdentity && (      <section className={`${styles.identity} flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6 dark:border-slate-800 dark:bg-slate-900`}>
        <div className="flex min-w-0 items-center gap-4">
          <div className={`${styles.avatar} flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300`}>
            {(compact && photoPreview) || avatarUrl ? <img src={compact && photoPreview ? photoPreview : avatarUrl} alt="Profile" className="h-16 w-16 rounded-full object-cover" /> : <CircleUserRound className="h-9 w-9" />}
            <label htmlFor="profile-photo" className={styles.camera} role="button" aria-label="Profile photo" aria-disabled={pending} tabIndex={pending ? -1 : 0} onKeyDown={event => {
              if ((event.key === "Enter" || event.key === " ") && !pending) { event.preventDefault(); photoRef.current?.click(); }
            }}><Camera size={16} /></label>
          </div>
          <div className={`min-w-0 ${styles.identityName}`}>
            <h2 className="break-words text-lg font-bold text-slate-950 dark:text-white" data-i18n-ignore={Boolean(defaultFullName || fullName)}>
              {(compact ? fullName : defaultFullName) || "Unnamed User"}
            </h2>
            <p className="truncate text-sm text-slate-500 dark:text-slate-400" data-i18n-ignore={Boolean(email)}>
              {email || "No email"}
            </p>
            <span className="mt-2 inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold capitalize text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
              {role}
            </span>
          </div>
        </div>

        <div className={`${styles.identityStatus} min-w-[190px] border-t border-slate-100 pt-4 text-sm sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0 dark:border-slate-800`}>
          <p className="inline-flex items-center gap-2 font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Account active
          </p>
          <p className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <CalendarDays className="h-4 w-4" />
            {lastUpdated}
          </p>
        </div>
      </section>

)}
    <section className={`grid gap-4 lg:grid-cols-[minmax(0,1.75fr)_minmax(300px,0.95fr)] ${styles.workspace}`} data-tab={tab}>
    <form
      ref={formRef}
      onSubmit={async event => {
        event.preventDefault();
        if (locked.current || (compact && !dirty)) return;
        if (compact) setTab("personal");
        const data = new FormData(event.currentTarget);
        locked.current = true; setPending(true); setState(initialState);
        try {
          const result = await updateProfile(initialState, data);
          setState(result);
          if (result.success || result.nameSaved) setSavedName(fullName.trim());
          if (result.success && photoRef.current) { photoRef.current.value = ""; setPhotoName(""); setSavedPreview(photoPreview); }
        } catch { setState({success:false,message:"Unable to confirm the save. Your changes are kept; refresh before retrying."}); }
        finally { locked.current = false; setPending(false); }
      }}
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900 ${styles.form}`}
    >
      <div className={`flex items-start gap-3 border-b border-slate-100 pb-5 dark:border-slate-800 ${styles.formHeader}`}>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
          <UserRound className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-bold text-slate-950 dark:text-white">Personal Information</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Update your profile information.
          </p>
        </div>
      </div>

      {security && <div role="tablist" aria-label="Profile" className={styles.tabs}>
        {["personal", "security"].map(value => <button key={value} type="button" role="tab" id={`profile-${value}-tab`} aria-controls={`profile-${value}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1}
          onClick={() => setTab(value)} onKeyDown={event => {
            if (event.altKey || event.ctrlKey || event.metaKey) return;
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
              event.preventDefault(); const next = event.key === "Home" ? "personal" : event.key === "End" ? "security" : tab === "personal" ? "security" : "personal";
              setTab(next); document.getElementById(`profile-${next}-tab`)?.focus();
            }
          }}>{value === "personal" ? <UserRound size={18} /> : <ShieldCheck size={18} />}{value === "personal" ? "Personal" : "Security"}</button>)}
      </div>}
      <fieldset id="profile-personal" aria-labelledby={security ? "profile-personal-tab" : undefined} disabled={pending} className={`mt-5 min-w-0 space-y-5 ${styles.personal}`}>
        <div className={`space-y-2 ${styles.photoField}`}>
          <label htmlFor="profile-photo" className="text-sm font-semibold">Profile photo</label>
          <input ref={photoRef} id="profile-photo" name="photo" type="file" tabIndex={compact ? -1 : undefined} onChange={event => {
            const file = event.target.files?.[0]; setPhotoName(file?.name ?? ""); setState(initialState);
            if (file) { const url = URL.createObjectURL(file); previewUrls.current.push(url); setPhotoPreview(url); } else setPhotoPreview(savedPreview);
          }} accept="image/jpeg,image/png,image/webp" className="block w-full text-sm" />
          {photoName && <p data-i18n-ignore="true" className="break-words text-sm">{photoName}</p>}
          <p className="text-xs text-slate-500">JPG, PNG or WebP, up to 5 MB. Saved with your name when you click Save Changes. Also appears on mobile.</p>
        </div>
        <div className="space-y-2">
          <label htmlFor="full_name" className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Full Name
          </label>
          <div className="relative">
            <UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="full_name"
              name="full_name"
              type="text"
              required
              minLength={2}
              maxLength={100}
              value={fullName}
              onChange={event => { setFullName(event.target.value); if (state.success) setState(initialState); }}
              placeholder="Enter your full name"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:focus:ring-blue-950"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="email"
              type="email"
              value={email}
              disabled
              className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400"
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Your login email cannot be changed here.
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="role" className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Role
          </label>
          <div className="relative">
            <ShieldCheck className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="role"
              type="text"
              value={role}
              disabled
              className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm capitalize text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400"
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Only the Owner or Admin can change user roles.
          </p>
        </div>

        {state.message ? (
          <div
            role={state.success ? "status" : "alert"}
            className={
              state.success
                ? "rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-900/50 dark:bg-green-950/20 dark:text-green-300"
                : "rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300"
            }
          >
            {state.message}
          </div>
        ) : null}
      </fieldset>

      {lastUpdated && <p className={styles.update}><CalendarDays size={16} />{lastUpdated}</p>}
      <div className={`settings-save-bar ${styles.actions}`}>
        <button
          type="button"
          onClick={() => {setFullName(savedName); if(photoRef.current)photoRef.current.value=""; setPhotoName(""); setPhotoPreview(savedPreview); setState(initialState);}}
          disabled={pending}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending || (compact && !dirty)}
          onClick={event => {
            if (compact && !formRef.current?.checkValidity()) { event.preventDefault(); setTab("personal"); requestAnimationFrame(() => formRef.current?.reportValidity()); }
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {pending ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
    {security}
    </section>
    </>
  );
}
