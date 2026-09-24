"use client";

import {
  AtSign,
  Camera,
  ChevronRight,
  Clock3,
  CreditCard,
  ExternalLink,
  ImageIcon,
  Link2,
  Loader2,
  MapPin,
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
  WalletCards,
  X,
} from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import type { StorefrontSettings } from "@/lib/storefront/types";
import FulfillmentFields from "./ordering/fulfillment-fields";
import OpeningHoursEditor from "./opening-hours-editor";
import { formatBusinessType } from "@/lib/storefront/types";
import { updateStorefrontSettings, type UpdateStorefrontState } from "./actions";

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
  const [state, formAction, pending] = useActionState(updateStorefrontSettings, initialState);
  const [displayName, setDisplayName] = useState(settings.display_name ?? businessName);
  const [description, setDescription] = useState(settings.description ?? "");

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

  useEffect(() => {
    if (!state.message) return;
    if (state.success) { toast.success(state.message); router.refresh(); }
    else toast.error(state.message);
  }, [state, router]);

  return (
    <>
    <form id="store-settings-form" onSubmit={event => { event.preventDefault(); if (pending) return; const data = new FormData(event.currentTarget); startTransition(() => formAction(data)); }} className="space-y-3">
      <div className="columns-1 gap-3 xl:columns-2">
        <div className="contents">
          <Card
            icon={<Store size={17} />}
            iconClass="bg-blue-50 text-blue-600"
            title="Store Status"
            description="Control your storefront visibility and online ordering."
          >
            <div className="grid gap-2 md:grid-cols-2">
              <TogglePanel
                name="isPublished"
                title="Publish storefront"
                description="Make your store visible to customers online."
                defaultChecked={settings.is_published}
                disabled={!canEdit}
                status={settings.is_published ? "Your store is currently public" : "Your store is currently private"}
                statusTone={settings.is_published ? "green" : "slate"}
              />

              <TogglePanel name="acceptOnlineOrders" title="Online order availability" description="Allow customers to place orders." defaultChecked={settings.accept_online_orders} disabled={!canEdit} status={settings.accept_online_orders ? "Accepting orders" : "Orders paused"} statusTone={settings.accept_online_orders ? "green" : "amber"} />
            </div>
          </Card>

          <Card
            icon={<Store size={17} />}
            iconClass="bg-blue-50 text-blue-600"
            title="Store Profile"
            description="Basic information about your online store."
          >
            <div className="grid gap-3 md:grid-cols-2">
              <CompactField label="Business type" htmlFor="businessType">
                <input id="businessType" value={formatBusinessType(businessType)} readOnly className={`${inputClass} bg-slate-50 text-slate-600`} />
                <p className="mt-1 text-xs text-slate-500">Managed in Business Settings.</p>
              </CompactField>

              <CompactField label="Display name" htmlFor="displayName">
                <input
                  id="displayName"
                  name="displayName"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  maxLength={80}
                  disabled={!canEdit}
                  className={inputClass}
                />
              </CompactField>

              <div className="md:col-span-2">
                <CompactField label="Store description" htmlFor="description">
                  <textarea
                    id="description"
                    name="description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={2}
                    maxLength={500}
                    disabled={!canEdit}
                    placeholder="Tell customers what you sell and what makes your shop special."
                    className={`${inputClass} min-h-[72px] resize-none py-2`}
                  />
                </CompactField>
              </div>

              <CompactField label="Currency" htmlFor="currency">
                <select
                  id="currency"
                  name="currency"
                  defaultValue={settings.currency || "USD"}
                  disabled={!canEdit}
                  className={inputClass}
                >
                  <option value="USD">USD - US Dollar</option>
                  <option value="KHR">KHR - Cambodian Riel</option>
                </select>
              </CompactField>

            </div>
          </Card>

          <Card
            icon={<CreditCard size={17} />}
            iconClass="bg-blue-50 text-blue-600"
            title="Online Payment"
            description="Choose how customers can pay for online orders."
          >
            <div className="grid gap-2 md:grid-cols-2">
              <MethodToggle
                name="acceptCod"
                title="Pay Later / Cash"
                description="Customer pays at pickup, delivery, or in person."
                icon={<WalletCards size={16} />}
                defaultChecked={settings.accept_cod}
                disabled={!canEdit}
              />
              <MethodToggle
                name="acceptKhqr"
                title="KHQR"
                description="Show your KHQR code for online payment."
                icon={<CreditCard size={16} />}
                defaultChecked={settings.accept_khqr}
                disabled={!canEdit}
              />
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
              <ImageField
                label="KHQR image"
                name="khqr"
                preview={settings.khqr_image_url}
                disabled={!canEdit}
                imageClass="h-24 w-full rounded-lg"
              />
              <div className="grid content-start gap-3">
                <CompactField label="KHQR account / merchant name" htmlFor="khqrAccountName">
                  <input
                    id="khqrAccountName"
                    name="khqrAccountName"
                    maxLength={120}
                    defaultValue={settings.khqr_account_name ?? ""}
                    disabled={!canEdit}
                    placeholder="Example: Melody Clothing"
                    className={inputClass}
                  />
                </CompactField>
                <CompactField label="Payment instructions" htmlFor="khqrInstructions">
                  <input
                    id="khqrInstructions"
                    name="khqrInstructions"
                    maxLength={300}
                    defaultValue={settings.khqr_instructions ?? ""}
                    disabled={!canEdit}
                    placeholder="Scan the QR and include your order number in the remark."
                    className={inputClass}
                  />
                </CompactField>
              </div>
            </div>
          </Card>
        </div>

        <div className="contents">
          <Card
            icon={<Clock3 size={17} />}
            iconClass="bg-blue-50 text-blue-600"
            title="Store Hours"
            description="Edit your weekly opening hours for customers visiting or contacting your shop."
          >
            <OpeningHoursEditor value={settings.social_links?.profile?.openingHours} disabled={!canEdit} />
          </Card>

          <Card icon={<Store size={17} />} iconClass="bg-emerald-50 text-emerald-600" title="New Arrivals" description="Highlight recently added products in your shop, banner links, and footer.">
            <ToggleRow name="newArrivalsEnabled" label="Show new arrivals" defaultChecked={settings.social_links?.profile?.newArrivals?.enabled !== false} disabled={!canEdit} />
            <div className="mt-3"><CompactField label="Keep products new for (days)" htmlFor="newArrivalDays"><input id="newArrivalDays" name="newArrivalDays" type="number" min="1" max="365" required defaultValue={settings.social_links?.profile?.newArrivals?.days ?? 30} disabled={!canEdit} className={inputClass} /></CompactField><p className="mt-2 text-xs text-slate-500">Uses the date the product was first created. Choose between 1 and 365 days.</p></div>
          </Card>

          <Card
            icon={<Palette size={17} />}
            iconClass="bg-violet-50 text-violet-600"
            title="Branding"
            description="Customize your store's look and feel."
          >
            <div className="grid gap-3 lg:grid-cols-[140px_minmax(0,1fr)]">
              <ImageField
                label="Store logo"
                name="logo"
                preview={settings.logo_url}
                disabled={!canEdit}
                imageClass="h-24 w-full rounded-lg"
              />
              <ImageField
                label="Store banner"
                name="banner"
                preview={settings.banner_url}
                disabled={!canEdit}
                imageClass="h-24 w-full rounded-lg"
              />
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
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
              </CompactField>
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-700">Theme preview</p>
                <a
                  href={storeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-9 items-center justify-between rounded-lg border border-slate-200 bg-blue-50/60 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                >
                  Your store theme
                  <ChevronRight size={14} />
                </a>
              </div>
            </div>
          </Card>



          <Card
            icon={<Share2 size={17} />}
            iconClass="bg-blue-50 text-blue-600"
            title="Contact"
            description="Your shop phone, email and address."
          >
            <div className="grid gap-3 md:grid-cols-2">
              <CompactField label="Phone" htmlFor="phone">
                <input
                  id="phone"
                  name="phone"
                  defaultValue={settings.phone ?? ""}
                  disabled={!canEdit}
                  className={inputClass}
                />
              </CompactField>

              <CompactField label="Contact email" htmlFor="contactEmail">
                <input id="contactEmail" name="contactEmail" type="email" maxLength={254} defaultValue={settings.social_links?.profile?.contactEmail ?? ""} disabled={!canEdit} placeholder="hello@yourstore.com" className={inputClass} />
              </CompactField>
              <div className="md:col-span-2"><CompactField label="Location URL" htmlFor="locationUrl"><input id="locationUrl" name="locationUrl" type="url" maxLength={2000} defaultValue={settings.social_links?.profile?.locationUrl ?? ""} disabled={!canEdit} placeholder="https://maps.google.com/..." className={inputClass} /></CompactField><p className="mt-1 text-xs text-slate-500">View Our Location opens this link. Leave blank to use your address.</p></div>
              <div className="md:col-span-2">
                <CompactField label="Address" htmlFor="address">
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      id="address"
                      name="address"
                      defaultValue={settings.address ?? ""}
                      disabled={!canEdit}
                      className={`${inputClass} pl-9`}
                    />
                  </div>
                </CompactField>
              </div>
            </div>
          </Card>
          <Card icon={<Share2 size={17} />} iconClass="bg-blue-50 text-blue-600" title="Social" description="Add your social account name and its direct link.">
            <div className="grid gap-3 md:grid-cols-2">
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

          <Card
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

        </div>
      </div>

      <FulfillmentFields settings={{ ...settings, business_type: businessType }} canEdit={canEdit} />
      <input type="hidden" name="allowScheduledOrders" value={settings.allow_scheduled_orders ? "on" : ""} />
      <input type="hidden" name="minScheduleLeadMinutes" value={settings.min_schedule_lead_minutes ?? 30} />
      <input type="hidden" name="maxScheduleDays" value={settings.max_schedule_days ?? 7} />
    </form>
    {children}
      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          Changes apply to your public TENH online store after saving.
        </p>
        <div className="flex items-center justify-end gap-2">
          <a
            href={storeUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Preview <ExternalLink size={13} />
          </a>
          {canEdit ? (
            <button
              type="submit"
              form="store-settings-form"
              disabled={pending}
              className="inline-flex h-9 min-w-[126px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? <Loader2 size={15} className="animate-spin" /> : <Save size={14} />}
              {pending ? "Saving..." : "Save Changes"}
            </button>
          ) : (
            <span className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
              View only
            </span>
          )}
        </div>
      </div>
    </>
  );
}

function Card({
  icon,
  iconClass,
  title,
  description,
  action,
  children,
}: {
  icon: React.ReactNode;
  iconClass: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-3 break-inside-avoid rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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

function TogglePanel({
  name,
  title,
  description,
  defaultChecked,
  disabled,
  status,
  statusTone,
}: {
  name: string;
  title: string;
  description: string;
  defaultChecked: boolean;
  disabled: boolean;
  status: string;
  statusTone: "green" | "amber" | "slate";
}) {
  const tone =
    statusTone === "green"
      ? "bg-emerald-50 text-emerald-700"
      : statusTone === "amber"
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-100 text-slate-600";

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-900">{title}</p>
          <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{description}</p>
        </div>
        <Switch name={name} label={title} defaultChecked={defaultChecked} disabled={disabled} />
      </div>
      <span className={`mt-2 inline-flex rounded-md px-2 py-1 text-[10px] font-medium ${tone}`}>
        {status}
      </span>
    </div>
  );
}

function MethodToggle({
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
    <label className="relative flex min-h-[64px] cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 p-3 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50/60">
      <span className="rounded-md bg-blue-50 p-2 text-blue-600">{icon}</span>
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


function ImageField({ label, name, preview, disabled, imageClass }: {
  label: string; name: string; preview: string | null; disabled: boolean; imageClass: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<File | null>(null);
  const [removed, setRemoved] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState("");
  useEffect(() => {
    if (!selected) return;
    const url = URL.createObjectURL(selected);
    const frame = requestAnimationFrame(() => setLocalPreview(url));
    return () => { cancelAnimationFrame(frame); URL.revokeObjectURL(url); };
  }, [selected]);
  const source = removed ? null : selected ? localPreview : preview;
  const recommendation = name === "logo" ? "Recommended: 512 x 512 px (square)." : name === "banner" ? "Recommended: 1600 x 600 px (wide). Keep important content near the center." : "Recommended: at least 600 px wide. Upload the full QR image with clear white margins.";
  function remove() {
    setRemoved(true); setSelected(null); setLocalPreview(null); setDimensions("");
    if (input.current) input.current.value = "";
  }
  return <div>
    <p className="mb-1.5 text-xs font-medium text-slate-700">{label}</p>
    <input type="hidden" name={`remove-${name}`} value={removed ? "on" : "off"} />
    <div className="relative">
      {source ? <button type="button" aria-label={`Preview ${label}`} className="block w-full" onClick={() => setExpanded(true)}><img src={source} alt={`${label} preview`} onLoad={event => setDimensions(`${event.currentTarget.naturalWidth} x ${event.currentTarget.naturalHeight} px`)} className={`${imageClass} border border-slate-200 bg-slate-50 object-contain`} /></button> : <div className={`${imageClass} flex items-center justify-center border border-dashed border-slate-300 bg-slate-50 text-slate-400`}><ImageIcon size={20} /></div>}
      {source && !disabled && <button type="button" aria-label={`Remove ${label}`} title={`Remove ${label}`} onClick={remove} className="absolute right-1 top-1 rounded-full border border-slate-200 bg-white p-1.5 text-slate-600 shadow"><X size={14} /></button>}
    </div>
    <p className="mt-2 text-[11px] leading-4 text-slate-500">{recommendation} JPG, PNG or WebP, up to 5 MB.{dimensions && ` Current: ${dimensions}.`}</p>
    <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-blue-600 hover:bg-blue-50"><ImageIcon size={12} /> Upload {label.toLowerCase()}<input ref={input} aria-label={`Upload ${label}`} type="file" name={name} accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={event => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { toast.error("Choose a JPG, PNG or WebP image up to 5 MB."); event.target.value = ""; return; }
      setSelected(file); setRemoved(false); setDimensions("");
    }} className="sr-only" /></label>
    {removed && preview && <button type="button" onClick={() => setRemoved(false)} className="ml-2 text-xs text-blue-600">Undo removal</button>}
    {expanded && source && <div role="dialog" aria-modal="true" aria-label={`${label} preview`} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-6" onKeyDown={event => { if (event.key === "Escape") setExpanded(false); }}><button type="button" aria-label="Close image preview" onClick={() => setExpanded(false)} className="absolute left-5 top-5 flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900"><X size={20} /> Close preview</button><img src={source} alt={label} className="max-h-[85vh] max-w-full rounded-xl bg-white object-contain" /></div>}
  </div>;
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
