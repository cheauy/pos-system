"use client";

import { CreditCard, ImageIcon, Loader2, Save, WalletCards, X } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { storefrontFormSnapshot } from "@/lib/storefront/form-snapshot";
import type { StorefrontSettings } from "@/lib/storefront/types";
import { updateOnlinePaymentSettings, type UpdateStorefrontState } from "../../online-store/actions";

const initialState: UpdateStorefrontState = { success: false, message: "", submittedAt: 0 };
const inputClass = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-950 dark:disabled:bg-slate-900";

export default function OnlinePaymentForm({
  settings,
  canEdit,
}: {
  settings: Pick<StorefrontSettings, "business_id" | "accept_cod" | "accept_khqr" | "khqr_image_url" | "khqr_account_name" | "khqr_instructions">;
  canEdit: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const baselineRef = useRef<string | null>(null);
  const submittedRef = useRef<string | null>(null);
  const checkingRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [state, action, pending] = useActionState(updateOnlinePaymentSettings, initialState);

  function scheduleCheck() {
    if (checkingRef.current !== null) cancelAnimationFrame(checkingRef.current);
    checkingRef.current = requestAnimationFrame(() => {
      checkingRef.current = null;
      if (!formRef.current || savingRef.current) return;
      const snapshot = storefrontFormSnapshot(new FormData(formRef.current));
      if (baselineRef.current === null) baselineRef.current = snapshot;
      setDirty(snapshot !== baselineRef.current);
    });
  }

  useEffect(() => {
    scheduleCheck();
    return () => { if (checkingRef.current !== null) cancelAnimationFrame(checkingRef.current); };
  }, []);

  useEffect(() => {
    if (!state.message) return;
    savingRef.current = false;
    if (state.success) {
      if (submittedRef.current !== null) baselineRef.current = submittedRef.current;
      setDirty(formRef.current ? storefrontFormSnapshot(new FormData(formRef.current)) !== baselineRef.current : false);
      toast.success(state.message);
    } else {
      toast.error(state.message);
      scheduleCheck();
    }
  }, [state]);

  return (
    <form
      id="online-payment-settings"
      ref={formRef}
      onChangeCapture={scheduleCheck}
      onClickCapture={scheduleCheck}
      onInputCapture={scheduleCheck}
      onSubmit={event => {
        event.preventDefault();
        if (!canEdit || !dirty || pending || savingRef.current) return;
        const data = new FormData(event.currentTarget);
        submittedRef.current = storefrontFormSnapshot(data);
        savingRef.current = true;
        startTransition(() => action(data));
      }}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-700 dark:bg-slate-900"
    >
      <input type="hidden" name="businessId" value={settings.business_id} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
            <CreditCard size={19} />
          </span>
          <div>
            <h3 className="text-base font-extrabold text-slate-950 dark:text-white">Online Payment</h3>
            <p className="mt-1 text-xs leading-4 text-slate-500">Choose how customers can pay for online orders.</p>
          </div>
        </div>

      </div>

      {!canEdit ? (
        <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-500 dark:bg-slate-950">You can view payment settings. Storefront editing permission is required to change them.</p>
      ) : null}

      <fieldset disabled={!canEdit || pending} className="mt-5 min-w-0 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <PaymentToggle
            name="acceptCod"
            title="Pay Later / Cash"
            description="Customer pays at pickup, delivery, or in person."
            icon={<WalletCards size={17} />}
            defaultChecked={settings.accept_cod}
          />
          <PaymentToggle
            name="acceptKhqr"
            title="KHQR"
            description="Show your KHQR code for online payment."
            icon={<CreditCard size={17} />}
            defaultChecked={settings.accept_khqr}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <KhqrImageField preview={settings.khqr_image_url} disabled={!canEdit || pending} />
          <div className="grid content-start gap-4">
            <Field label="KHQR account / merchant name" htmlFor="business-khqr-account">
              <input
                id="business-khqr-account"
                name="khqrAccountName"
                maxLength={120}
                defaultValue={settings.khqr_account_name ?? ""}
                placeholder="Example: Melody Clothing"
                className={inputClass}
              />
            </Field>
            <Field label="Payment instructions" htmlFor="business-khqr-instructions">
              <textarea
                id="business-khqr-instructions"
                name="khqrInstructions"
                maxLength={300}
                rows={3}
                defaultValue={settings.khqr_instructions ?? ""}
                placeholder="Scan the QR and include your order number in the remark."
                className={`${inputClass} h-auto min-h-[86px] resize-y py-2.5`}
              />
            </Field>
          </div>
        </div>
      </fieldset>
      <div className="settings-save-bar">        {canEdit && (dirty || pending) ? (
          <button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {pending ? "Saving…" : "Save payment"}
          </button>
        ) : null}</div>
    </form>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return <div><label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200">{label}</label>{children}</div>;
}

function PaymentToggle({ name, title, description, icon, defaultChecked }: { name: string; title: string; description: string; icon: React.ReactNode; defaultChecked: boolean }) {
  return (
    <label className="flex min-h-[72px] cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50/60 dark:border-slate-700 dark:has-[:checked]:bg-blue-950/30">
      <span className="rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold text-slate-900 dark:text-white">{title}</span>
        <span className="mt-1 block text-[11px] leading-4 text-slate-500">{description}</span>
      </span>
      <Switch name={name} label={title} defaultChecked={defaultChecked} />
    </label>
  );
}

function Switch({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <span className="relative inline-flex h-5 w-9 shrink-0 items-center">
      <input type="checkbox" name={name} aria-label={label} role="switch" defaultChecked={defaultChecked} className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0" />
      <span className="pointer-events-none absolute inset-0 rounded-full bg-slate-300 transition peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2" />
      <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
    </span>
  );
}

function KhqrImageField({ preview, disabled }: { preview: string | null; disabled: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<File | null>(null);
  const [removed, setRemoved] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!selected) return;
    const url = URL.createObjectURL(selected);
    setLocalPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selected]);
  const source = removed ? null : selected ? localPreview : preview;
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">KHQR image</p>
      <input type="hidden" name="remove-khqr" value={removed ? "on" : "off"} />
      <div className="relative flex h-36 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950">
        {source ? <img src={source} alt="KHQR preview" className="h-full w-full object-contain p-2" /> : <ImageIcon size={24} className="text-slate-400" />}
        {source && !disabled ? (
          <button type="button" aria-label="Remove KHQR image" onClick={() => { setRemoved(true); setSelected(null); setLocalPreview(null); if (inputRef.current) inputRef.current.value = ""; }} className="absolute right-2 top-2 rounded-full border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm">
            <X size={14} />
          </button>
        ) : null}
      </div>
      <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-blue-600 transition hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-950">
        <ImageIcon size={13} /> Upload KHQR
        <input
          ref={inputRef}
          type="file"
          name="khqr"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled}
          onChange={event => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
              toast.error("Choose a JPG, PNG or WebP image up to 5 MB.");
              event.target.value = "";
              return;
            }
            setSelected(file);
            setRemoved(false);
          }}
          className="sr-only"
        />
      </label>
      {removed && preview ? <button type="button" onClick={() => setRemoved(false)} className="ml-2 text-xs font-semibold text-blue-600">Undo removal</button> : null}
      <p className="mt-2 text-[11px] leading-4 text-slate-500">Upload the full KHQR image with clear margins. JPG, PNG or WebP, up to 5 MB.</p>
    </div>
  );
}
