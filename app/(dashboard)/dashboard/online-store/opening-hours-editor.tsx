"use client";

import { useState } from "react";
import { defaultOpeningHours, weekDays, type StoreProfile } from "@/lib/storefront/profile";

export default function OpeningHoursEditor({ value, disabled }: { value?: StoreProfile["openingHours"]; disabled: boolean }) {
  const [hours, setHours] = useState(value ?? defaultOpeningHours());
  return <div className="space-y-3">
    <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-xs font-semibold">
      Show opening hours on storefront
      <input name="hoursEnabled" type="checkbox" checked={hours.enabled} disabled={disabled} onChange={event => setHours({ ...hours, enabled: event.target.checked })} className="h-4 w-4 accent-blue-600" />
    </label>
    <label className="block text-xs font-medium text-slate-700">Time zone
      <select name="hoursTimezone" value={hours.timezone} disabled={disabled} onChange={event => setHours({ ...hours, timezone: event.target.value })} className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs">
        {[...new Set([hours.timezone, "Asia/Phnom_Penh", "Asia/Ho_Chi_Minh", "Asia/Bangkok", "Asia/Singapore", "UTC"])].map(zone => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}
      </select>
    </label>
    <div className="space-y-2">
      {weekDays.map(day => {
        const value = hours.days[day];
        const update = (change: Partial<typeof value>) => setHours({ ...hours, days: { ...hours.days, [day]: { ...value, ...change } } });
        return <div key={day} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 p-2 text-xs">
          <span className="w-[72px] font-semibold capitalize">{day}</span>
          <label className="flex items-center gap-1.5"><input name={`hours-${day}-closed`} type="checkbox" checked={value.closed} disabled={disabled} onChange={event => update({ closed: event.target.checked })} className="accent-blue-600" />Closed</label>
          <div className="ml-auto flex items-center gap-1.5">
            <input aria-label={`${day} opens`} name={`hours-${day}-open`} type="time" value={value.open} readOnly={value.closed} disabled={disabled} onChange={event => update({ open: event.target.value })} className={`min-w-0 rounded-md border border-slate-200 p-1.5 ${value.closed ? "opacity-40" : ""}`} />
            <span>–</span>
            <input aria-label={`${day} closes`} name={`hours-${day}-close`} type="time" value={value.close} readOnly={value.closed} disabled={disabled} onChange={event => update({ close: event.target.value })} className={`min-w-0 rounded-md border border-slate-200 p-1.5 ${value.closed ? "opacity-40" : ""}`} />
          </div>
        </div>;
      })}
    </div>
    <p className="text-[11px] leading-4 text-slate-500">Times are shown in your store’s time zone. A closing time earlier than opening is the next day. Online ordering follows the Accept online orders switch.</p>
  </div>;
}
