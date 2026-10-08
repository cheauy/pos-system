"use client";

import {
  AtSign,
  Camera,
  Link2,
  Loader2,
  MessageCircle,
  MessagesSquare,
  Music2,
  Palette,
  Play,
  Save,
  Search,
  Send,
  Share2,
  Store,
  Truck,
  Utensils,
} from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { toast } from "sonner";
import { createPortal } from "react-dom";
import { storefrontFormSnapshot } from "@/lib/storefront/form-snapshot";
import { useRouter } from "next/navigation";

import type { StorefrontSettings } from "@/lib/storefront/types";
import { formatBusinessType } from "@/lib/storefront/types";
import { supportsDineIn } from "@/lib/storefront/profile";
import { updateStorefrontSettings, type UpdateStorefrontState } from "./actions";

// Mid-to-dark tones: storefrontTheme keeps button text at 4.5:1 or better for each.
const COLOR_PRESETS = [
  { label: "Blue", value: "#2563EB" },
  { label: "Teal", value: "#0F766E" },
  { label: "Green", value: "#15803D" },
  { label: "Red", value: "#B91C1C" },
  { label: "Purple", value: "#7C3AED" },
  { label: "Navy", value: "#1E3A8A" },
  { label: "Charcoal", value: "#334155" },
];

const initialState: UpdateStorefrontState = {
  success: false,
  message: "",
  submittedAt: 0,
};

export default function StorefrontSettingsForm({
  settings,
  storeUrl,
  businessName,
  canEdit,
  children,
}: {
  settings: StorefrontSettings;
  storeUrl: string;
  businessName: string;
  canEdit: boolean;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const baselineRef = useRef<string | null>(null);
  const submittedRef = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const checkFrameRef = useRef<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveTarget, setSaveTarget] = useState<HTMLElement | null>(null);
  const [publishTarget, setPublishTarget] = useState<HTMLElement | null>(null);
  const [ordersTarget, setOrdersTarget] = useState<HTMLElement | null>(null);
  const [state, formAction, pending] = useActionState(updateStorefrontSettings, initialState);
  const displayName = settings.display_name ?? businessName;
  const description = settings.description ?? "";
  const [currency, setCurrency] = useState(settings.currency || "USD");
  // Missing value = Classic, so stores that never chose keep their current look.
  const [storefrontStyle, setStorefrontStyle] = useState<"classic" | "simple">(
    settings.social_links?.profile?.storefrontStyle === "simple" ? "simple" : "classic",
  );
  const [defaultLanguage, setDefaultLanguage] = useState<"en" | "km">(
    settings.social_links?.profile?.defaultLanguage === "km" ? "km" : "en",
  );

  const businessType = settings.business_type;
  const [seoTitle, setSeoTitle] = useState(settings.social_links?.profile?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(settings.social_links?.profile?.seoDescription ?? "");
  const defaultMetaTitle = useMemo(
    () => `${displayName || businessName} | ${formatBusinessType(businessType)}`,
    [businessName, displayName, businessType],
  );
  const metaTitle = seoTitle || defaultMetaTitle;
  const metaDescription = seoDescription ||
    description || `Shop ${displayName || businessName} online and discover our latest products.`;

  // Snapshot after React commits: also captures hidden inputs controlled by
  // language/hour/image buttons, not just native input/change events.
  function scheduleDirtyCheck() {
    if (checkFrameRef.current !== null) cancelAnimationFrame(checkFrameRef.current);
    checkFrameRef.current = requestAnimationFrame(() => {
      checkFrameRef.current = null;
      if (!formRef.current || submittingRef.current || baselineRef.current === null) return;
      setDirty(storefrontFormSnapshot(new FormData(formRef.current)) !== baselineRef.current);
    });
  }
  useEffect(() => {
    setSaveTarget(document.getElementById("storefront-save-slot"));
    setPublishTarget(document.getElementById("storefront-publish-slot"));
    setOrdersTarget(document.getElementById("storefront-orders-slot"));
    return () => { if (checkFrameRef.current !== null) cancelAnimationFrame(checkFrameRef.current); };
  }, []);
  useEffect(() => {
    if (!formRef.current || !publishTarget || !ordersTarget || baselineRef.current !== null) return;
    baselineRef.current = storefrontFormSnapshot(new FormData(formRef.current));
    setDirty(false);
  }, [publishTarget, ordersTarget]);
  useEffect(() => {
    if (!state.message) return;
    submittingRef.current = false;
    if (state.success) {
      // Only mark the submitted values as saved. Failed saves keep the button.
      if (submittedRef.current !== null) baselineRef.current = submittedRef.current;
      setDirty(formRef.current ? storefrontFormSnapshot(new FormData(formRef.current)) !== baselineRef.current : false);
      toast.success(state.message);
      router.refresh();
    } else { toast.error(state.message); scheduleDirtyCheck(); }
  }, [state, router]);

  return (
    <>
    <form ref={formRef} id="store-settings-form" data-dirty={dirty ? "true" : "false"}
      onChangeCapture={scheduleDirtyCheck} onClickCapture={scheduleDirtyCheck} onInputCapture={scheduleDirtyCheck}
      onSubmit={event => {
        event.preventDefault();
        if (pending || submittingRef.current || !canEdit || !dirty) return;
        const data = new FormData(event.currentTarget);
        submittedRef.current = storefrontFormSnapshot(data);
        submittingRef.current = true;
        startTransition(() => formAction(data));
      }} className="space-y-3">
      <input type="hidden" name="businessId" value={settings.business_id} />
      <fieldset disabled={pending} className="min-w-0 space-y-3">
          <Card
            id="store-language-currency"
            section="storefront"
            icon={<Store size={17} />}
            iconClass="bg-emerald-50 text-emerald-600"
            title="Language & Currency"
            description="What customers see first when they open your store."
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p id="store-default-currency-label" className="mb-1.5 text-xs font-medium text-slate-700">Default storefront currency</p>
                <input type="hidden" name="currency" value={currency} />
                <div role="group" aria-labelledby="store-default-currency-label" className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                  {["USD", "KHR"].map(option => (
                    <button key={option} type="button" aria-pressed={currency === option} disabled={!canEdit}
                      onClick={() => setCurrency(option)}
                      className={`min-h-9 flex-1 rounded-md px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${currency === option ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}>
                      {option}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p id="store-default-language-label" className="mb-1.5 text-xs font-medium text-slate-700">Default storefront language</p>
                <input type="hidden" name="defaultLanguage" value={defaultLanguage} />
                <div role="group" aria-labelledby="store-default-language-label" className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                  {([{ value: "en", label: "English" }, { value: "km", label: "ខ្មែរ" }] as const).map(option => (
                    <button key={option.value} type="button" lang={option.value} data-i18n-ignore="true"
                      aria-pressed={defaultLanguage === option.value} disabled={!canEdit}
                      onClick={() => setDefaultLanguage(option.value)}
                      className={`min-h-9 flex-1 rounded-md px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${defaultLanguage === option.value ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}>
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">The language customers see when they first open your store. Customers can still switch languages.</p>
              </div>
            </div>
          </Card>

          <Card
            id="branding"
            section="branding"
            icon={<Palette size={17} />}
            iconClass="bg-violet-50 text-violet-600"
            title="Branding"
            description="Customize your store's color and style."
          >
            <div>
              <p id="store-style-label" className="mb-1.5 text-xs font-medium text-slate-700">Storefront style</p>
              <input type="hidden" name="storefrontStyle" value={storefrontStyle} />
              <div role="group" aria-labelledby="store-style-label" className="grid gap-2 sm:grid-cols-2">
                {([
                  { value: "classic", label: "Classic", hint: "Your current layout: large banner with text over the image." },
                  { value: "simple", label: "Simple", hint: "Like the live preview: compact header, clean banner, square product cards." },
                ] as const).map(option => (
                  <button key={option.value} type="button" aria-pressed={storefrontStyle === option.value} disabled={!canEdit}
                    onClick={() => setStorefrontStyle(option.value)}
                    className={`min-h-11 rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${storefrontStyle === option.value ? "border-blue-500 bg-blue-50/60" : "border-slate-200 hover:bg-slate-50"}`}>
                    <span className="block text-xs font-semibold text-slate-900">{option.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{option.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 max-w-md">
              <CompactField label="Primary color" htmlFor="primaryColor">
                <div className="flex gap-2">
                  <input
                    id="primaryColorPicker"
                    type="color"
                    defaultValue={settings.primary_color}
                    disabled={!canEdit}
                    className="h-9 w-11 rounded-lg border border-slate-200 bg-white p-1"
                    onChange={(event) => {
                      const text = document.getElementById("primaryColor") as HTMLInputElement | null;
                      if (text) text.value = event.target.value.toUpperCase();
                    }}
                  />
                  <input
                    id="primaryColor"
                    name="primaryColor"
                    defaultValue={settings.primary_color}
                    pattern="^#[0-9A-Fa-f]{6}$"
                    disabled={!canEdit}
                    className={inputClass}
                  />
                </div>
                <div role="group" aria-label="Color presets" className="mt-2 flex flex-wrap gap-2">
                  {COLOR_PRESETS.map(preset => (
                    <button key={preset.value} type="button" disabled={!canEdit} title={preset.label} aria-label={`Use ${preset.label}`}
                      onClick={() => {
                        const text = document.getElementById("primaryColor") as HTMLInputElement | null;
                        const picker = document.getElementById("primaryColorPicker") as HTMLInputElement | null;
                        if (picker) picker.value = preset.value.toLowerCase();
                        if (text) { text.value = preset.value; text.dispatchEvent(new Event("input", { bubbles: true })); }
                      }}
                      className="h-8 w-8 rounded-full border-2 border-white shadow ring-1 ring-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
                      style={{ backgroundColor: preset.value }} />
                  ))}
                </div>
              </CompactField>
            </div>

          </Card>

          <Card id="fulfillment" section="storefront" icon={<Truck size={17} />} iconClass="bg-blue-50 text-blue-600" title="Pickup & Delivery" description="Choose how customers can receive orders from your storefront.">
            <div>
              <div className={`mt-3 grid gap-2 ${supportsDineIn(businessType) ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
                <FulfillmentOption
                  name="allowPickup"
                  title="Pickup"
                  description="Customer collects from your shop."
                  icon={<Store size={17} />}
                  defaultChecked={settings.allow_pickup}
                  disabled={!canEdit}
                />
                <FulfillmentOption
                  name="allowDelivery"
                  title="Delivery"
                  description="Deliver orders to customers."
                  icon={<Truck size={17} />}
                  defaultChecked={settings.allow_delivery}
                  disabled={!canEdit}
                />
                {supportsDineIn(businessType) ? (
                  <FulfillmentOption
                    name="allowDineIn"
                    title="Dine-in"
                    description="Allow table or dine-in ordering."
                    icon={<Utensils size={17} />}
                    defaultChecked={settings.allow_dine_in}
                    disabled={!canEdit}
                  />
                ) : null}
              </div>
            </div>
          </Card>

          <Card section="storefront" icon={<Store size={17} />} iconClass="bg-emerald-50 text-emerald-600" title="New Arrivals" description="Highlight recently added products in your shop, banner links, and footer.">
            <ToggleRow name="newArrivalsEnabled" label="Show new arrivals" defaultChecked={settings.social_links?.profile?.newArrivals?.enabled !== false} disabled={!canEdit} />
            <div className="mt-3"><CompactField label="Keep products new for (days)" htmlFor="newArrivalDays"><input id="newArrivalDays" name="newArrivalDays" type="number" min="1" max="365" required defaultValue={settings.social_links?.profile?.newArrivals?.days ?? 30} disabled={!canEdit} className={inputClass} /></CompactField><p className="mt-2 text-xs text-slate-500">Uses the date the product was first created. Choose between 1 and 365 days.</p></div>
          </Card>

          <Card
            section="seo"
            icon={<Search size={17} />}
            iconClass="bg-blue-50 text-blue-600"
            title="SEO / Meta Preview"
            description="Preview how your store can appear when shared or indexed."
          >
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
              <div className="space-y-3">
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-700">
                    <label htmlFor="seoTitle">Meta title</label>
                    <span className="text-slate-400">{Math.min(metaTitle.length, 60)}/60</span>
                  </div>
                  <input id="seoTitle" name="seoTitle" value={seoTitle} onChange={event => setSeoTitle(event.target.value)} maxLength={60} placeholder={defaultMetaTitle} disabled={!canEdit} className={inputClass} />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-700">
                    <label htmlFor="seoDescription">Meta description</label>
                    <span className="text-slate-400">{Math.min(metaDescription.length, 160)}/160</span>
                  </div>
                  <textarea id="seoDescription" name="seoDescription" value={seoDescription} onChange={event => setSeoDescription(event.target.value)} maxLength={160} rows={3} placeholder={description || `Shop ${displayName || businessName} online and discover our latest products.`} disabled={!canEdit} className={`${inputClass} h-auto py-2`} />
                  <p className="mt-2 text-[11px] text-slate-500">Leave blank to use your store name and description. Saved text is used for search and social sharing.</p>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <p className="text-xs font-semibold text-slate-800">Search preview</p>
                <p className="mt-2 truncate text-[11px] text-slate-400">{storeUrl}</p>
                <p className="mt-1 line-clamp-1 text-xs font-semibold text-blue-700">{metaTitle}</p>
                <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{metaDescription}</p>
              </div>
            </div>
          </Card>

          <Card section="social" icon={<Share2 size={17} />} iconClass="bg-blue-50 text-blue-600" title="Social" description="Add your social account name and its direct link.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SocialLinkField
                label="Facebook"
                name="facebookUrl"
                placeholder="https://facebook.com/yourstore"
                defaultValue={settings.social_links?.facebook}
                defaultName={settings.social_links?.profile?.socialNames?.facebook}
                icon={<Link2 size={14} />}
                disabled={!canEdit}
              />
              <SocialLinkField
                label="Instagram"
                name="instagramUrl"
                placeholder="https://instagram.com/yourstore"
                defaultValue={settings.social_links?.instagram}
                defaultName={settings.social_links?.profile?.socialNames?.instagram}
                icon={<Camera size={14} />}
                disabled={!canEdit}
              />
              <SocialLinkField
                label="TikTok"
                name="tiktokUrl"
                placeholder="https://tiktok.com/@yourstore"
                defaultValue={settings.social_links?.tiktok}
                defaultName={settings.social_links?.profile?.socialNames?.tiktok}
                icon={<Music2 size={14} />}
                disabled={!canEdit}
              />
              <SocialLinkField
                label="YouTube"
                name="youtubeUrl"
                placeholder="https://youtube.com/@yourchannel"
                defaultValue={settings.social_links?.youtube}
                defaultName={settings.social_links?.profile?.socialNames?.youtube}
                icon={<Play size={14} />}
                disabled={!canEdit}
              />
              <SocialLinkField
                label="Telegram"
                name="telegramUrl"
                placeholder="https://t.me/yourstore"
                defaultValue={settings.social_links?.telegram}
                defaultName={settings.social_links?.profile?.socialNames?.telegram}
                icon={<Send size={14} />}
                disabled={!canEdit}
              />
              <SocialLinkField
                label="WhatsApp"
                name="whatsappUrl"
                placeholder="https://wa.me/855..."
                defaultValue={settings.social_links?.whatsapp}
                defaultName={settings.social_links?.profile?.socialNames?.whatsapp}
                icon={<MessageCircle size={14} />}
                disabled={!canEdit}
              />
              <SocialLinkField
                label="Messenger"
                name="messengerUrl"
                placeholder="https://m.me/yourpage"
                defaultValue={settings.social_links?.messenger}
                defaultName={settings.social_links?.profile?.socialNames?.messenger}
                icon={<MessagesSquare size={14} />}
                disabled={!canEdit}
              />
              <SocialLinkField
                label="X (Twitter)"
                name="xUrl"
                placeholder="https://x.com/yourstore"
                defaultValue={settings.social_links?.x}
                defaultName={settings.social_links?.profile?.socialNames?.x}
                icon={<AtSign size={14} />}
                disabled={!canEdit}
              />
            </div>
            <p className="mt-3 text-[11px] leading-4 text-slate-500">
              Only links you add are shown on the public store. Leave a field empty to hide it.
            </p>
          </Card>

      <input type="hidden" name="allowScheduledOrders" value={settings.allow_scheduled_orders ? "on" : ""} />
      <input type="hidden" name="minScheduleLeadMinutes" value={settings.min_schedule_lead_minutes ?? 30} />
      <input type="hidden" name="maxScheduleDays" value={settings.max_schedule_days ?? 7} />
      </fieldset>
    </form>
    {children}
      {publishTarget && createPortal(
        <SummarySwitch
          name="isPublished"
          label="Publish storefront"
          defaultChecked={settings.is_published}
          disabled={!canEdit || pending}
          onChanged={scheduleDirtyCheck}
        />,
        publishTarget,
      )}
      {ordersTarget && createPortal(
        <SummarySwitch
          name="acceptOnlineOrders"
          label="Online order availability"
          defaultChecked={settings.accept_online_orders}
          disabled={!canEdit || pending}
          onChanged={scheduleDirtyCheck}
        />,
        ordersTarget,
      )}
      {canEdit && saveTarget && (dirty || pending) && createPortal(
        <button type="submit" form="store-settings-form" disabled={pending} aria-busy={pending}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
          {pending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {pending ? "Saving..." : "Save storefront"}
        </button>, saveTarget)}
    </>
  );
}

function Card({
  id,
  section,
  icon,
  iconClass,
  title,
  description,
  action,
  children,
}: {
  id?: string;
  section: string;
  icon: React.ReactNode;
  iconClass: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} data-section={section} className="scroll-mt-5 mb-3 break-inside-avoid rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className={`rounded-lg p-2 ${iconClass}`}>{icon}</div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900">{title}</h2>
            <p className="mt-0.5 text-xs leading-4 text-slate-500">{description}</p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function CompactField({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-slate-700">
        {label}
      </label>
      {children}
    </div>
  );
}

function SummarySwitch({
  name,
  label,
  defaultChecked,
  disabled,
  onChanged,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
  disabled: boolean;
  onChanged: () => void;
}) {
  return (
    <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
      <input
        form="store-settings-form"
        type="checkbox"
        name={name}
        aria-label={label}
        role="switch"
        defaultChecked={defaultChecked}
        disabled={disabled}
        onChange={onChanged}
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      <span className="pointer-events-none absolute inset-0 rounded-full bg-slate-300 transition peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2 peer-disabled:opacity-50" />
      <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
    </span>
  );
}

function FulfillmentOption({
  name,
  title,
  description,
  icon,
  defaultChecked,
  disabled,
}: {
  name: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  defaultChecked: boolean;
  disabled: boolean;
}) {
  return (
    <label className="flex min-h-[66px] cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50/60">
      <span className="rounded-lg bg-blue-50 p-2 text-blue-600">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-slate-900">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{description}</span>
      </span>
      <Switch name={name} label={title} defaultChecked={defaultChecked} disabled={disabled} />
    </label>
  );
}

function ToggleRow({
  name,
  label,
  defaultChecked,
  disabled,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-2.5">
      <span className="text-xs font-semibold text-slate-800">{label}</span>
      <Switch name={name} label={label} defaultChecked={defaultChecked} disabled={disabled} />
    </div>
  );
}

function Switch({
  name,
  label,
  defaultChecked,
  disabled,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
  disabled: boolean;
}) {
  return (
    <span className="relative inline-flex h-5 w-9 shrink-0 items-center">
      <input
        type="checkbox"
        name={name}
        aria-label={label}
        role="switch"
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      <span className="pointer-events-none absolute inset-0 rounded-full bg-slate-300 transition peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2 peer-disabled:opacity-50" />
      <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
    </span>
  );
}


function SocialLinkField({
  label,
  name,
  placeholder,
  defaultValue,
  defaultName,
  icon,
  disabled,
}: {
  label: string;
  name: string;
  placeholder: string;
  defaultValue?: string | null;
  defaultName?: string;
  icon: React.ReactNode;
  disabled: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="mb-2 text-xs font-semibold text-slate-800">{label}</p>
      <label htmlFor={`${name}-name`} className="mb-1 block text-[11px] text-slate-500">Account name</label>
      <input id={`${name}-name`} name={`${name}-name`} maxLength={80} defaultValue={defaultName ?? ""} placeholder={`Your ${label} name`} disabled={disabled} className={`${inputClass} mb-2`} />
      <label htmlFor={name} className="mb-1 block text-[11px] text-slate-500">Profile link</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 flex -translate-y-1/2 items-center text-slate-400">
          {icon}
        </span>
        <input
          id={name}
          name={name}
          type="url"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={500}
          defaultValue={defaultValue ?? ""}
          placeholder={placeholder}
          disabled={disabled}
          className={`${inputClass} pl-9`}
        />
      </div>
    </div>
  );
}

const inputClass =
  "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500";
