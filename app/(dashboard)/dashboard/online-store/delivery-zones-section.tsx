"use client";

import { Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import {
  deleteDeliveryZone,
  saveDeliveryZone,
  type DeliveryZoneActionState,
} from "./delivery-zone-actions";

type DeliveryZone = {
  id: string;
  name: string;
  fee: number;
  minimum_order: number;
  is_active: boolean;
};

const initialState: DeliveryZoneActionState = {
  success: false,
  message: "",
  submittedAt: 0,
};

export default function DeliveryZonesSection({
  zones,
  currency,
  allowDelivery,
  canEdit,
}: {
  zones: DeliveryZone[];
  currency: string;
  allowDelivery: boolean;
  canEdit: boolean;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600">
          <MapPin size={22} />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Delivery Zones</h2>
          <p className="mt-1 text-sm text-slate-500">
            Set different delivery fees and minimum orders by area. If no active zones exist, the flat delivery fee above is used.
          </p>
        </div>
      </div>

      {!allowDelivery && (
        <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Turn on Delivery under Ordering & Fulfillment before customers can use these zones.
        </p>
      )}

      {canEdit && (
        <div className="mt-6">
          <ZoneForm currency={currency} canEdit />
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {zones.map((zone) => (
          <ZoneForm key={zone.id} currency={currency} zone={zone} canEdit={canEdit} />
        ))}

        {zones.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 p-7 text-center text-sm text-slate-500 lg:col-span-2">
            No delivery zones yet. Your current flat delivery fee will continue to work.
          </div>
        )}
      </div>
    </section>
  );
}

function ZoneForm({
  currency,
  zone,
  canEdit,
}: {
  currency: string;
  zone?: DeliveryZone;
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    saveDeliveryZone,
    initialState,
  );

  useEffect(() => {
    if (!state.message) return;
    state.success ? toast.success(state.message) : toast.error(state.message);
  }, [state]);

  return (
    <form
      action={formAction}
      className={`rounded-2xl border p-4 ${
        zone ? "border-slate-200" : "border-blue-200 bg-blue-50/40"
      }`}
    >
      {zone && <input type="hidden" name="zoneId" value={zone.id} />}

      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-slate-900">
          {zone ? zone.name : "Add delivery zone"}
        </h3>
        {zone && (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              zone.is_active
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {zone.is_active ? "Active" : "Paused"}
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-sm font-medium text-slate-700">
          Zone name
          <input
            name="name"
            required
            maxLength={80}
            defaultValue={zone?.name ?? ""}
            disabled={!canEdit}
            placeholder="Phnom Penh Center"
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Fee ({currency})
          <input
            name="fee"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={Number(zone?.fee ?? 0)}
            disabled={!canEdit}
            className={inputClass}
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Minimum ({currency})
          <input
            name="minimumOrder"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={Number(zone?.minimum_order ?? 0)}
            disabled={!canEdit}
            className={inputClass}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={zone?.is_active ?? true}
            disabled={!canEdit}
            className="h-4 w-4 rounded"
          />
          Active
        </label>

        <button
          type="submit"
          disabled={pending || !canEdit}
          className="ml-auto inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? (
            <Loader2 size={15} className="animate-spin" />
          ) : zone ? null : (
            <Plus size={15} />
          )}
          {zone ? "Save Zone" : "Add Zone"}
        </button>
      </div>

      {zone && canEdit && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <button
            type="submit"
            formAction={deleteDeliveryZone}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            <Trash2 size={13} /> Delete Zone
          </button>
        </div>
      )}
    </form>
  );
}

const inputClass =
  "mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100";
