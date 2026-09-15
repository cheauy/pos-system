"use client";

import {
  ExternalLink,
  ImageIcon,
  Loader2,
  Save,
  Store,
} from "lucide-react";
import {
  useActionState,
  useEffect,
  useState,
} from "react";
import { toast } from "sonner";

import type {
  StorefrontSettings,
} from "@/lib/storefront/types";
import {
  businessTypes,
  formatBusinessType,
} from "@/lib/storefront/types";
import {
  updateStorefrontSettings,
  type UpdateStorefrontState,
} from "./actions";

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
}: {
  settings: StorefrontSettings;
  storeUrl: string;
  businessName: string;
  canEdit: boolean;
}) {
  const [state, formAction, pending] =
    useActionState(
      updateStorefrontSettings,
      initialState,
    );

  const [logoPreview, setLogoPreview] =
    useState<string | null>(settings.logo_url);
  const [bannerPreview, setBannerPreview] =
    useState<string | null>(settings.banner_url);
  const [khqrPreview, setKhqrPreview] =
    useState<string | null>(settings.khqr_image_url);

  useEffect(() => {
    if (!state.message) return;

    if (state.success) {
      toast.success(state.message);
    } else {
      toast.error(state.message);
    }
  }, [state]);

  function setPreview(
    file: File | undefined,
    setter: (value: string | null) => void,
  ) {
    if (!file) return;
    setter(URL.createObjectURL(file));
  }

  return (
    <form
      action={formAction}
      className="space-y-6"
    >
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
              <Store size={22} />
            </div>

            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                Store Status
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Publish the storefront and control whether customers can place online orders.
              </p>
            </div>
          </div>

          <a
            href={storeUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Preview Store
            <ExternalLink size={16} />
          </a>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <ToggleCard
            name="isPublished"
            title="Publish storefront"
            description="Customers can open your public TENH store."
            defaultChecked={settings.is_published}
            disabled={!canEdit}
          />

          <ToggleCard
            name="acceptOnlineOrders"
            title="Accept online orders"
            description="Prepare the store to accept customer checkout orders."
            defaultChecked={
              settings.accept_online_orders
            }
            disabled={!canEdit}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">
          Store Profile
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Choose the shop type and information customers see first.
        </p>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <Field label="Business type" htmlFor="businessType">
            <select
              id="businessType"
              name="businessType"
              defaultValue={settings.business_type}
              disabled={!canEdit}
              className={inputClass}
            >
              {businessTypes.map((type) => (
                <option key={type} value={type}>
                  {formatBusinessType(type)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Display name" htmlFor="displayName">
            <input
              id="displayName"
              name="displayName"
              defaultValue={
                settings.display_name ?? businessName
              }
              maxLength={80}
              disabled={!canEdit}
              className={inputClass}
            />
          </Field>

          <div className="md:col-span-2">
            <Field label="Store description" htmlFor="description">
              <textarea
                id="description"
                name="description"
                defaultValue={settings.description ?? ""}
                rows={4}
                maxLength={500}
                disabled={!canEdit}
                placeholder="Tell customers what you sell and what makes your shop special."
                className={`${inputClass} resize-none`}
              />
            </Field>
          </div>

          <Field label="Phone" htmlFor="phone">
            <input
              id="phone"
              name="phone"
              defaultValue={settings.phone ?? ""}
              disabled={!canEdit}
              className={inputClass}
            />
          </Field>

          <Field label="Currency" htmlFor="currency">
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
          </Field>

          <div className="md:col-span-2">
            <Field label="Address" htmlFor="address">
              <textarea
                id="address"
                name="address"
                rows={2}
                defaultValue={settings.address ?? ""}
                disabled={!canEdit}
                className={`${inputClass} resize-none`}
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-violet-50 p-3 text-violet-600">
            <ImageIcon size={22} />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              Branding
            </h2>
            <p className="text-sm text-slate-500">
              Add your logo, cover image and primary store color.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <ImageField
            label="Store logo"
            name="logo"
            preview={logoPreview}
            disabled={!canEdit}
            onChange={(file) =>
              setPreview(file, setLogoPreview)
            }
            imageClass="h-28 w-28 rounded-2xl"
          />

          <ImageField
            label="Store banner"
            name="banner"
            preview={bannerPreview}
            disabled={!canEdit}
            onChange={(file) =>
              setPreview(file, setBannerPreview)
            }
            imageClass="h-28 w-full rounded-2xl"
          />
        </div>

        <div className="mt-6 max-w-sm">
          <Field label="Primary color" htmlFor="primaryColor">
            <div className="flex gap-3">
              <input
                id="primaryColorPicker"
                type="color"
                defaultValue={settings.primary_color}
                disabled={!canEdit}
                className="h-12 w-16 rounded-xl border border-slate-300 bg-white p-1"
                onChange={(event) => {
                  const text = document.getElementById(
                    "primaryColor",
                  ) as HTMLInputElement | null;
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
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">
          Ordering & Fulfillment
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Choose how customers can receive their online orders.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <ToggleCard
            name="allowPickup"
            title="Pickup"
            description="Customer collects from your shop."
            defaultChecked={settings.allow_pickup}
            disabled={!canEdit}
          />
          <ToggleCard
            name="allowDelivery"
            title="Delivery"
            description="Deliver orders to customers."
            defaultChecked={settings.allow_delivery}
            disabled={!canEdit}
          />
          <ToggleCard
            name="allowDineIn"
            title="Dine In"
            description="Useful for restaurants and table QR ordering."
            defaultChecked={settings.allow_dine_in}
            disabled={!canEdit}
          />
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field label="Minimum order" htmlFor="minimumOrder">
            <input
              id="minimumOrder"
              name="minimumOrder"
              type="number"
              min="0"
              step="0.01"
              defaultValue={Number(settings.minimum_order ?? 0)}
              disabled={!canEdit}
              className={inputClass}
            />
          </Field>

          <Field label="Estimated preparation time (minutes)" htmlFor="estimatedMinutes">
            <input
              id="estimatedMinutes"
              name="estimatedMinutes"
              type="number"
              min="1"
              max="1440"
              defaultValue={settings.estimated_minutes ?? ""}
              disabled={!canEdit}
              placeholder="Example: 20"
              className={inputClass}
            />
          </Field>

          <Field label="Delivery fee" htmlFor="deliveryFee">
            <input
              id="deliveryFee"
              name="deliveryFee"
              type="number"
              min="0"
              step="0.01"
              defaultValue={Number(settings.delivery_fee ?? 0)}
              disabled={!canEdit}
              className={inputClass}
            />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Checkout message" htmlFor="checkoutMessage">
              <textarea
                id="checkoutMessage"
                name="checkoutMessage"
                rows={3}
                maxLength={300}
                defaultValue={settings.checkout_message ?? ""}
                disabled={!canEdit}
                placeholder="Example: We will call you after your order is accepted."
                className={`${inputClass} resize-none`}
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">
          Online Payment
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Let customers pay later, or show your shop KHQR during checkout. KHQR orders are marked pending verification until your team confirms the payment.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <ToggleCard
            name="acceptCod"
            title="Pay Later / Cash"
            description="Customer pays at pickup, delivery, or the counter."
            defaultChecked={settings.accept_cod}
            disabled={!canEdit}
          />
          <ToggleCard
            name="acceptKhqr"
            title="KHQR"
            description="Show your merchant KHQR image before the customer places the order."
            defaultChecked={settings.accept_khqr}
            disabled={!canEdit}
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <ImageField
            label="KHQR image"
            name="khqr"
            preview={khqrPreview}
            disabled={!canEdit}
            onChange={(file) =>
              setPreview(file, setKhqrPreview)
            }
            imageClass="aspect-square w-full max-w-[220px] rounded-2xl"
          />

          <div className="grid content-start gap-5">
            <Field label="KHQR account / merchant name" htmlFor="khqrAccountName">
              <input
                id="khqrAccountName"
                name="khqrAccountName"
                maxLength={120}
                defaultValue={settings.khqr_account_name ?? ""}
                disabled={!canEdit}
                placeholder="Example: Melody Clothing"
                className={inputClass}
              />
            </Field>

            <Field label="KHQR instructions" htmlFor="khqrInstructions">
              <textarea
                id="khqrInstructions"
                name="khqrInstructions"
                rows={3}
                maxLength={300}
                defaultValue={settings.khqr_instructions ?? ""}
                disabled={!canEdit}
                placeholder="Example: Scan the QR, pay the exact total, then enter the transaction reference below."
                className={`${inputClass} resize-none`}
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">
          Scheduled Orders
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Allow customers to choose a future pickup or delivery time. Table QR orders always stay immediate.
        </p>

        <div className="mt-6">
          <ToggleCard
            name="allowScheduledOrders"
            title="Allow scheduled / preorder times"
            description="Customers can choose Now or a future time during checkout."
            defaultChecked={settings.allow_scheduled_orders}
            disabled={!canEdit}
          />
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field label="Minimum lead time (minutes)" htmlFor="minScheduleLeadMinutes">
            <input
              id="minScheduleLeadMinutes"
              name="minScheduleLeadMinutes"
              type="number"
              min="0"
              max="10080"
              step="1"
              defaultValue={settings.min_schedule_lead_minutes ?? 30}
              disabled={!canEdit}
              className={inputClass}
            />
          </Field>

          <Field label="Maximum days in advance" htmlFor="maxScheduleDays">
            <input
              id="maxScheduleDays"
              name="maxScheduleDays"
              type="number"
              min="1"
              max="90"
              step="1"
              defaultValue={settings.max_schedule_days ?? 7}
              disabled={!canEdit}
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      {canEdit ? (
        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Saving Online Store...
            </>
          ) : (
            <>
              <Save size={18} />
              Save Online Store
            </>
          )}
        </button>
      ) : (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Your role can view this store, but only the owner or business admin can change online-store settings.
        </p>
      )}
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-sm font-medium text-slate-700"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function ToggleCard({
  name,
  title,
  description,
  defaultChecked,
  disabled,
}: {
  name: string;
  title: string;
  description: string;
  defaultChecked: boolean;
  disabled: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-blue-300 has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="mt-1 h-4 w-4 rounded"
      />
      <span>
        <span className="block font-semibold text-slate-900">
          {title}
        </span>
        <span className="mt-1 block text-sm leading-5 text-slate-500">
          {description}
        </span>
      </span>
    </label>
  );
}

function ImageField({
  label,
  name,
  preview,
  disabled,
  onChange,
  imageClass,
}: {
  label: string;
  name: string;
  preview: string | null;
  disabled: boolean;
  onChange: (file: File | undefined) => void;
  imageClass: string;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-slate-700">
        {label}
      </p>

      {preview ? (
        <img
          src={preview}
          alt={`${label} preview`}
          className={`${imageClass} border border-slate-200 object-cover`}
        />
      ) : (
        <div className={`${imageClass} flex items-center justify-center border border-dashed border-slate-300 bg-slate-50 text-slate-400`}>
          <ImageIcon size={24} />
        </div>
      )}

      <input
        type="file"
        name={name}
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled}
        onChange={(event) =>
          onChange(event.target.files?.[0])
        }
        className="mt-3 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
      />
      <p className="mt-1 text-xs text-slate-400">
        JPG, PNG or WebP · maximum 5 MB
      </p>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500";
