"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { Clock3, Contact, Info, Loader2, Save } from "lucide-react";
import type { StoreProfile } from "@/lib/storefront/profile";
import { businessInfoSnapshot, businessInfoValues } from "@/lib/business/business-info";
import { storefrontFormSnapshot } from "@/lib/storefront/form-snapshot";
import ImageField from "@/components/storefront-image-field";
import OpeningHoursEditor from "../../online-store/opening-hours-editor";
import { saveBusinessInfo } from "./info-actions";

const inputClass = "mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-950 dark:disabled:bg-slate-900";

export default function BusinessInfoForm({ businessId, businessName, canEditBusinessName, phone, address, profile, logoUrl = null, bannerUrl = null, description = null, canEdit }: {
  businessId: string;
  businessName: string;
  canEditBusinessName: boolean;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  description?: string | null;
  phone: string | null;
  address: string | null;
  profile?: StoreProfile;
  canEdit: boolean;
}) {
  const form = useRef<HTMLFormElement>(null);
  const initial = useRef(businessInfoValues({ phone, address, profile, logo_url: logoUrl, banner_url: bannerUrl, description })).current;
  const expected = useRef(businessInfoSnapshot(initial));
  const baseline = useRef<string | null>(null);
  const saving = useRef(false);
  const frame = useRef<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ success: boolean; message: string } | null>(null);
  const [saveTarget, setSaveTarget] = useState<HTMLElement | null>(null);

  function scheduleCheck() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (!form.current || saving.current) return;
      const next = storefrontFormSnapshot(new FormData(form.current));
      if (baseline.current === null) baseline.current = next;
      setDirty(next !== baseline.current);
    });
  }

  useEffect(() => {
    setSaveTarget(document.getElementById("business-info-save-slot"));
    scheduleCheck();
  }, []);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty || saving.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <>
      <form
        id="business-info"
        ref={form}
        className="scroll-mt-6 space-y-4"
        onChangeCapture={scheduleCheck}
        onClickCapture={scheduleCheck}
        onInputCapture={scheduleCheck}
        onSubmit={async event => {
          event.preventDefault();
          if (!canEdit || !dirty || saving.current || !form.current) return;
          const data = new FormData(form.current);
          const submitted = storefrontFormSnapshot(data);
          data.set("businessId", businessId);
          data.set("expectedInfo", expected.current);
          saving.current = true;
          setBusy(true);
          setNotice(null);
          try {
            const result = await saveBusinessInfo(data);
            setNotice(result);
            if (result.success && result.snapshot) {
              expected.current = result.snapshot;
              baseline.current = submitted;
              setDirty(false);
            }
          } catch {
            setNotice({
              success: false,
              message: "The save result could not be confirmed. Reload and review your business information before retrying.",
            });
          } finally {
            saving.current = false;
            setBusy(false);
          }
        }}
      >
        {notice ? (
          <p
            role={notice.success ? "status" : "alert"}
            className={`rounded-xl px-4 py-3 text-sm ${notice.success ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"}`}
          >
            {notice.message}
          </p>
        ) : null}

        {!canEdit ? (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
            You can view these details. Business editing permission is required to save changes.
          </p>
        ) : null}

        <fieldset disabled={busy || !canEdit} className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300">
                <Contact size={19} />
              </span>
              <div>
                <h3 className="text-base font-extrabold text-slate-950 dark:text-white">Business Information</h3>
                <p className="mt-1 text-xs leading-4 text-slate-500">This information appears on your storefront and business printouts.</p>
              </div>
            </div>

            <label className="mt-4 block text-xs font-semibold text-slate-700 dark:text-slate-200" htmlFor="business-name">
              Business Name
              <input
                id="business-name"
                name="businessName"
                type="text"
                required
                minLength={2}
                maxLength={100}
                defaultValue={businessName}
                disabled={busy || !canEdit || !canEditBusinessName}
                placeholder="Enter your business name"
                className={inputClass}
              />
              <span className="mt-2 block text-[11px] font-normal leading-4 text-slate-500">
                {canEditBusinessName
                  ? "Only the Owner can change the workspace business name. Your store display name remains managed in Online Store settings."
                  : "Only the business Owner can change this name."}
              </span>
            </label>

            <div className="mt-4 grid gap-3 lg:grid-cols-[140px_minmax(0,1fr)]">
              <ImageField
                label="Store logo"
                name="logo"
                preview={logoUrl}
                disabled={busy || !canEdit}
                imageClass="h-24 w-full rounded-lg"
              />
              <ImageField
                label="Store banner"
                name="banner"
                preview={bannerUrl}
                disabled={busy || !canEdit}
                imageClass="h-24 w-full rounded-lg"
              />
            </div>

            <label className="mt-3 block text-xs font-semibold text-slate-700 dark:text-slate-200" htmlFor="description">
              Store description
              <textarea
                id="description"
                name="description"
                defaultValue={description ?? ""}
                rows={2}
                maxLength={500}
                disabled={busy || !canEdit}
                placeholder="Tell customers what you sell and what makes your shop special."
                className={`${inputClass} min-h-[72px] resize-none py-2`}
              />
            </label>


            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-200" htmlFor="business-phone">
                Phone
                <input id="business-phone" name="phone" type="tel" maxLength={40} defaultValue={initial.phone} placeholder="012 345 678" className={inputClass} />
              </label>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-200" htmlFor="business-email">
                Email
                <input id="business-email" name="contactEmail" type="email" maxLength={254} defaultValue={initial.contactEmail} placeholder="store@example.com" className={inputClass} />
              </label>
              <label className="text-xs font-semibold text-slate-700 sm:col-span-2 dark:text-slate-200" htmlFor="business-address">
                Address
                <textarea id="business-address" name="address" rows={3} maxLength={500} defaultValue={initial.address} placeholder="Street, commune, district, city" className={`${inputClass} resize-y`} />
              </label>
              <label className="text-xs font-semibold text-slate-700 sm:col-span-2 dark:text-slate-200" htmlFor="business-location">
                Location URL
                <input id="business-location" name="locationUrl" type="url" maxLength={2000} defaultValue={initial.locationUrl} placeholder="https://maps.google.com/..." className={inputClass} />
                <span className="mt-2 block text-[11px] font-normal leading-4 text-slate-500">View Our Location uses this link. Leave it blank to use your address.</span>
              </label>
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-xl bg-blue-50 px-3 py-3 text-[11px] leading-4 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
              <Info size={15} className="mt-0.5 shrink-0" />
              <p>
                This address is used on receipts, labels and your online store. A branch-specific phone or address still takes priority. {" "}
                <Link href="/dashboard/locations" className="font-bold underline underline-offset-2">Manage branches</Link>
              </p>
            </div>
          </section>

          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300">
                  <Clock3 size={19} />
                </span>
                <div>
                  <h3 className="text-base font-extrabold text-slate-950 dark:text-white">Store Hours</h3>
                  <p className="mt-1 text-xs leading-4 text-slate-500">Set your time zone and Monday–Sunday opening hours.</p>
                </div>
              </div>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">Applies to receipts and online store</span>
            </div>
            <OpeningHoursEditor value={initial.openingHours} disabled={busy || !canEdit} />
          </section>
        </fieldset>
      </form>

      {canEdit && saveTarget ? createPortal(
        <button
          type="submit"
          form="business-info"
          disabled={busy || !dirty}
          aria-busy={busy}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-200 disabled:text-white/90 dark:disabled:bg-blue-950"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {busy ? "Saving…" : "Save changes"}
        </button>,
        saveTarget,
      ) : null}
    </>
  );
}
