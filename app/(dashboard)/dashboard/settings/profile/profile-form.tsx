"use client";

import {
  Mail,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useRef, useState } from "react";

import {
  updateProfile,
  type UpdateProfileState,
} from "./actions";

type ProfileFormProps = {
  defaultFullName: string;
  email: string;
  role: string;
};

const initialState: UpdateProfileState = {
  success: false,
  message: "",
};

export default function ProfileForm({
  defaultFullName,
  email,
  role,
}: ProfileFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState(initialState);
  const [pending, setPending] = useState(false);
  const [fullName, setFullName] = useState(defaultFullName);
  const [savedName, setSavedName] = useState(defaultFullName);
  const locked = useRef(false);
  const photoRef = useRef<HTMLInputElement>(null);

  return (
    <form
      ref={formRef}
      onSubmit={async event => {
        event.preventDefault();
        if (locked.current) return;
        const data = new FormData(event.currentTarget);
        locked.current = true; setPending(true); setState(initialState);
        try {
          const result = await updateProfile(initialState, data);
          setState(result);
          if (result.success || result.nameSaved) setSavedName(fullName.trim());
          if (result.success && photoRef.current) photoRef.current.value = "";
        } catch { setState({success:false,message:"Unable to confirm the save. Your changes are kept; refresh before retrying."}); }
        finally { locked.current = false; setPending(false); }
      }}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-start gap-3 border-b border-slate-100 pb-5 dark:border-slate-800">
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

      <fieldset disabled={pending} className="mt-5 min-w-0 space-y-5">
        <div className="space-y-2">
          <label htmlFor="profile-photo" className="text-sm font-semibold">Profile photo</label>
          <input ref={photoRef} id="profile-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="block w-full text-sm" />
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
              onChange={event => setFullName(event.target.value)}
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

      <div className="settings-save-bar">
        <button
          type="button"
          onClick={() => {setFullName(savedName); if(photoRef.current)photoRef.current.value=""; setState(initialState);}}
          disabled={pending}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {pending ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
}
