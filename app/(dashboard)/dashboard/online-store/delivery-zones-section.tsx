"use client";

import {
  Check,
  HelpCircle,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useActionState, useEffect, useState } from "react";
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
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-2.5">
          <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
            <MapPin size={17} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">4. Delivery Zones</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Set different delivery fees and minimum orders by zone.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600">
          <HelpCircle size={13} /> How it works?
        </span>
      </div>

      {!allowDelivery && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Delivery is currently disabled. Turn it on above before customers can use delivery zones.
        </div>
      )}

      {canEdit && <AddZoneForm currency={currency} />}

      <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
        <div className="hidden grid-cols-[44px_minmax(180px,1.6fr)_1fr_1fr_110px_92px] bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500 md:grid">
          <span>#</span>
          <span>Zone name</span>
          <span>Delivery fee</span>
          <span>Minimum order</span>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>

        {zones.map((zone, index) => (
          <ZoneRow
            key={zone.id}
            zone={zone}
            index={index + 1}
            currency={currency}
            canEdit={canEdit}
          />
        ))}

        {zones.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-slate-500">
            No delivery zones yet. The flat delivery fee will continue to be used.
          </div>
        )}
      </div>
    </section>
  );
}

function AddZoneForm({ currency }: { currency: string }) {
  const [state, formAction, pending] = useActionState(saveDeliveryZone, initialState);

  useEffect(() => {
    if (!state.message) return;
    state.success ? toast.success(state.message) : toast.error(state.message);
  }, [state]);

  return (
    <form action={formAction} className="mt-3 grid gap-2 rounded-lg border border-blue-100 bg-blue-50/30 p-3 md:grid-cols-[minmax(180px,1.6fr)_1fr_1fr_110px_auto] md:items-end">
      <Field label="Zone name">
        <input
          name="name"
          required
          maxLength={80}
          placeholder="e.g. Phnom Penh Center"
          className={inputClass}
        />
      </Field>
      <Field label={`Delivery fee (${currency})`}>
        <input name="fee" type="number" min="0" step="0.01" required defaultValue="0" className={inputClass} />
      </Field>
      <Field label={`Minimum order (${currency})`}>
        <input name="minimumOrder" type="number" min="0" step="0.01" required defaultValue="0" className={inputClass} />
      </Field>
      <label className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700">
        <input type="checkbox" name="isActive" defaultChecked className="h-4 w-4 rounded border-slate-300" />
        Active
      </label>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        Add Zone
      </button>
    </form>
  );
}

function ZoneRow({
  zone,
  index,
  currency,
  canEdit,
}: {
  zone: DeliveryZone;
  index: number;
  currency: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(saveDeliveryZone, initialState);

  useEffect(() => {
    if (!state.message) return;
    if (state.success) {
      toast.success(state.message);
      setEditing(false);
    } else {
      toast.error(state.message);
    }
  }, [state]);

  if (editing) {
    return (
      <form action={formAction} className="grid gap-2 border-t border-slate-100 p-3 first:border-t-0 md:grid-cols-[44px_minmax(180px,1.6fr)_1fr_1fr_110px_92px] md:items-center">
        <input type="hidden" name="zoneId" value={zone.id} />
        <span className="hidden text-xs text-slate-500 md:block">{index}</span>
        <input name="name" required maxLength={80} defaultValue={zone.name} className={inputClass} />
        <input name="fee" type="number" min="0" step="0.01" required defaultValue={Number(zone.fee)} className={inputClass} />
        <input name="minimumOrder" type="number" min="0" step="0.01" required defaultValue={Number(zone.minimum_order)} className={inputClass} />
        <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
          <input type="checkbox" name="isActive" defaultChecked={zone.is_active} className="h-4 w-4 rounded border-slate-300" />
          Active
        </label>
        <div className="flex justify-end gap-1">
          <button type="submit" disabled={pending} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:opacity-60" title="Save zone">
            {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50" title="Cancel edit">
            <X size={14} />
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="grid gap-2 border-t border-slate-100 px-3 py-2.5 first:border-t-0 md:grid-cols-[44px_minmax(180px,1.6fr)_1fr_1fr_110px_92px] md:items-center">
      <span className="text-xs text-slate-500">{index}</span>
      <div>
        <p className="text-xs font-semibold text-slate-900">{zone.name}</p>
        <p className="mt-0.5 text-[10px] text-slate-400 md:hidden">Delivery zone</p>
      </div>
      <span className="text-xs font-semibold text-slate-700">{formatMoney(zone.fee, currency)}</span>
      <span className="text-xs font-semibold text-slate-700">{formatMoney(zone.minimum_order, currency)}</span>
      <span className={`inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold ${zone.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${zone.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
        {zone.is_active ? "Active" : "Paused"}
      </span>
      {canEdit ? (
        <div className="flex justify-end gap-1">
          <button type="button" onClick={() => setEditing(true)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50" title="Edit zone">
            <Pencil size={13} />
          </button>
          <form action={deleteDeliveryZone}>
            <input type="hidden" name="zoneId" value={zone.id} />
            <button type="submit" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-rose-500 hover:bg-rose-50" title="Delete zone">
              <Trash2 size={13} />
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-[11px] font-medium text-slate-700">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

const inputClass =
  "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
