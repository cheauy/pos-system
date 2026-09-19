"use client";

import {
  CalendarClock,
  Clock3,
  Loader2,
  Save,
  Store,
  Truck,
  Utensils,
} from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import type { StorefrontSettings } from "@/lib/storefront/types";
import { supportsDineIn } from "@/lib/storefront/profile";
import {
  updateFulfillmentSettings,
  type UpdateStorefrontState,
} from "../actions";

const initialState: UpdateStorefrontState = {
  success: false,
  message: "",
  submittedAt: 0,
};

export default function OrderingFulfillmentForm({
  settings,
  canEdit,
}: {
  settings: StorefrontSettings;
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateFulfillmentSettings, initialState);

  useEffect(() => {
    if (!state.message) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  return (
    <form action={formAction} className="space-y-3">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <SectionHeader
          number="1"
          title="Fulfillment methods"
          description="Select how customers can receive their orders."
        />
        <div className={`mt-3 grid gap-2 ${supportsDineIn(settings.business_type) ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
          <FulfillmentCard
            name="allowPickup"
            title="Pickup"
            description="Customer collects from your shop."
            icon={<Store size={18} />}
            defaultChecked={settings.allow_pickup}
            disabled={!canEdit}
          />
          <FulfillmentCard
            name="allowDelivery"
            title="Delivery"
            description="Deliver orders to customers."
            icon={<Truck size={18} />}
            defaultChecked={settings.allow_delivery}
            disabled={!canEdit}
          />
          {supportsDineIn(settings.business_type) && <FulfillmentCard
            name="allowDineIn"
            title="Dine-in"
            description="Useful for restaurants and table QR ordering."
            icon={<Utensils size={18} />}
            defaultChecked={settings.allow_dine_in}
            disabled={!canEdit}
          />}
        </div>
      </section>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(350px,0.8fr)]">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div>
              <SectionHeader
                number="2"
                title="Service rules / order settings"
                description="Configure basic order settings for your online store."
              />
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <Field label={`Minimum order (${settings.currency})`} htmlFor="minimumOrder">
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
                <Field label={`Delivery fee (${settings.currency})`} htmlFor="deliveryFee">
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
                <Field label="Estimated preparation time (minutes)" htmlFor="estimatedMinutes">
                  <input
                    id="estimatedMinutes"
                    name="estimatedMinutes"
                    type="number"
                    min="1"
                    max="1440"
                    defaultValue={settings.estimated_minutes ?? ""}
                    disabled={!canEdit}
                    placeholder="20"
                    className={inputClass}
                  />
                </Field>
                <div className="md:col-span-3">
                  <Field label="Checkout message (optional)" htmlFor="checkoutMessage">
                    <input
                      id="checkoutMessage"
                      name="checkoutMessage"
                      maxLength={300}
                      defaultValue={settings.checkout_message ?? ""}
                      disabled={!canEdit}
                      placeholder="Thank you! We will call you after your order is accepted."
                      className={inputClass}
                    />
                  </Field>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                  <Clock3 size={16} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">Online order availability</p>
                  <p className="text-[11px] text-slate-500">Controlled from Online Store status</p>
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                  <span className={`h-2 w-2 rounded-full ${settings.accept_online_orders ? "bg-emerald-500" : "bg-amber-500"}`} />
                  {settings.accept_online_orders ? "Accepting orders" : "Orders paused"}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <SectionHeader
            number="3"
            title="Scheduled Orders"
            description="Allow customers to choose a future pickup or delivery time."
          />
          <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-slate-200 p-3">
            <div>
              <p className="text-xs font-semibold text-slate-900">Allow scheduled / preorder times</p>
              <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                Customers can choose a future date and time during checkout.
              </p>
            </div>
            <Switch
              name="allowScheduledOrders"
              defaultChecked={settings.allow_scheduled_orders}
              disabled={!canEdit}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
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
          <div className="mt-3 flex gap-2 rounded-lg border border-blue-100 bg-blue-50/60 p-2.5 text-[11px] leading-4 text-blue-700">
            <CalendarClock size={14} className="mt-0.5 shrink-0" />
            Customers will be able to select a future time when scheduled orders are enabled.
          </div>
        </section>
      </div>

      {canEdit && (
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-9 min-w-[150px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
          >
            {pending ? <Loader2 size={15} className="animate-spin" /> : <Save size={14} />}
            {pending ? "Saving..." : "Save Fulfillment"}
          </button>
        </div>
      )}
    </form>
  );
}

function SectionHeader({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-xs font-bold text-blue-600">
        {number}
      </div>
      <div>
        <h2 className="text-sm font-bold text-slate-900">{number}. {title}</h2>
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function FulfillmentCard({
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
    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50/60">
      <span className="rounded-lg bg-blue-50 p-2.5 text-blue-600">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{description}</span>
      </span>
      <Switch name={name} defaultChecked={defaultChecked} disabled={disabled} />
    </label>
  );
}

function Switch({ name, defaultChecked, disabled }: { name: string; defaultChecked: boolean; disabled: boolean }) {
  return (
    <span className="relative inline-flex h-5 w-9 shrink-0 items-center">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        aria-label={name.replace(/([A-Z])/g, " $1")}
        role="switch"
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      <span className="pointer-events-none absolute inset-0 rounded-full bg-slate-300 transition peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2 peer-disabled:opacity-50" />
      <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
    </span>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-slate-700">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500";
