"use client";
import { Store, Truck, Utensils } from "lucide-react";
import type { StorefrontSettings } from "@/lib/storefront/types";
import { supportsDineIn } from "@/lib/storefront/profile";

export default function FulfillmentFields({ settings, canEdit }: { settings: StorefrontSettings; canEdit: boolean }) {
  return <section id="ordering-fulfillment" className="scroll-mt-5 space-y-3">
    <div><h2 className="text-2xl font-bold text-slate-950">Ordering &amp; Fulfillment</h2><p className="mt-1 text-sm text-slate-500">Choose how customers receive orders and manage fulfillment rules.</p></div>
      <section id="fulfillment-methods" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <SectionHeader
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

      <div className="grid gap-3">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-4">
            <div>
              <SectionHeader
                title="Order rules"
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

          </div>
        </section>

      </div>

  </section>;
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return <div><h2 className="text-sm font-bold text-slate-900">{title}</h2><p className="mt-0.5 text-xs text-slate-500">{description}</p></div>;
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

function Switch({ name, defaultChecked, disabled, onChange }: { name: string; defaultChecked: boolean; disabled: boolean; onChange?: (checked: boolean) => void }) {
  return (
    <span className="relative inline-flex h-5 w-9 shrink-0 items-center">
      <input
        type="checkbox"
        name={name}
        onChange={event => onChange?.(event.target.checked)}
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
