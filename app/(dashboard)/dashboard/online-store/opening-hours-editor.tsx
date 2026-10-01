"use client";

import { useState } from "react";
import { defaultOpeningHours, weekDays, type StoreProfile } from "@/lib/storefront/profile";

export default function OpeningHoursEditor({ value, disabled }: { value?: StoreProfile["openingHours"]; disabled: boolean }) {
  const [hours, setHours] = useState(() => {
    const defaults = defaultOpeningHours();
    return { ...defaults, ...value, days: { ...defaults.days, ...value?.days } };
  });

  return <div className="space-y-3">
    <input type="hidden" name="hoursEnabled" value={hours.enabled ? "on" : "off"} />
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
      <div>
        <p id="opening-hours-toggle-label" className="text-xs font-semibold">Show opening hours on storefront</p>
        <p className="mt-1 text-[11px] text-slate-500">{hours.enabled ? "Opening hours are visible to customers." : "Opening hours are hidden from customers."}</p>
      </div>
      <div role="group" aria-labelledby="opening-hours-toggle-label" className="inline-flex rounded-lg bg-slate-100 p-1">
        {[{ enabled: true, label: "Enable" }, { enabled: false, label: "Disable" }].map(option => (
          <button key={option.label} type="button" disabled={disabled}
            aria-pressed={hours.enabled === option.enabled} aria-controls="opening-hours-configuration"
            onClick={() => setHours(current => ({ ...current, enabled: option.enabled }))}
            className={`min-h-9 rounded-md px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${hours.enabled === option.enabled ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
    <div id="opening-hours-configuration" hidden={!hours.enabled} className="space-y-3">
      <label className="block text-xs font-medium text-slate-700">Time zone
        <select name="hoursTimezone" value={hours.timezone} disabled={disabled} onChange={event => setHours({ ...hours, timezone: event.target.value })} className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs">
          {[...new Set([hours.timezone, "Asia/Phnom_Penh", "Asia/Ho_Chi_Minh", "Asia/Bangkok", "Asia/Singapore", "UTC"])].map(zone => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}
        </select>
      </label>
      <div className="space-y-2">
        {weekDays.map(day => {
          const value = hours.days[day];
          const update = (change: Partial<typeof value>) => setHours(current => ({ ...current, days: { ...current.days, [day]: { ...current.days[day], ...change } } }));
          return <div key={day} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 p-2 text-xs">
            <span className="w-[72px] font-semibold capitalize">{day}</span>
            <label className="flex items-center gap-1.5"><input name={`hours-${day}-closed`} type="checkbox" checked={value.closed} disabled={disabled} onChange={event => update({ closed: event.target.checked })} className="accent-blue-600" />Closed</label>
            <div className="ml-auto flex min-w-0 items-center gap-1.5">
              <input aria-label={`${day} opens`} name={`hours-${day}-open`} type="time" value={value.open} readOnly={value.closed} disabled={disabled} onChange={event => update({ open: event.target.value })} className={`min-w-0 rounded-md border border-slate-200 p-1.5 ${value.closed ? "opacity-40" : ""}`} />
              <span>–</span>
              <input aria-label={`${day} closes`} name={`hours-${day}-close`} type="time" value={value.close} readOnly={value.closed} disabled={disabled} onChange={event => update({ close: event.target.value })} className={`min-w-0 rounded-md border border-slate-200 p-1.5 ${value.closed ? "opacity-40" : ""}`} />
            </div>
          </div>;
        })}
      </div>
      <p className="text-[11px] leading-4 text-slate-500">Times are shown in your store’s time zone. A closing time earlier than opening is the next day. Online ordering follows the Accept online orders switch.</p>
    </div>
  </div>;
}
