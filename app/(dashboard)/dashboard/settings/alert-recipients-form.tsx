"use client";

import { useActionState } from "react";
import { businessAlerts, notificationRoles } from "@/lib/notifications/settings";
import { saveNotificationRoleSettings } from "../notifications/actions";

export default function AlertRecipientsForm({ branchId, settings }: {branchId:string;settings:Record<string,string[]>}) {
  const [state, action, pending] = useActionState(saveNotificationRoleSettings, {success:false,message:""});
  return <form action={action} className="mt-5">
    <input type="hidden" name="branchId" value={branchId}/>
    <fieldset disabled={pending}>
      <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm">
        <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-700"><th className="py-3">Alert</th>{notificationRoles.map(role=><th key={role} className="px-3 py-3 capitalize">{role}</th>)}</tr></thead>
        <tbody>{businessAlerts.map(({type,label,roles})=><tr key={type} className="border-b border-slate-200 last:border-0 dark:border-slate-700"><th scope="row" className="py-4 text-left font-medium">{label}</th>{notificationRoles.map(role=><td key={role} className="px-3 py-4"><input type="checkbox" name={`${type}:${role}`} aria-label={`${label}: ${role}`} defaultChecked={(settings[type]??roles).includes(role)} className="h-4 w-4 rounded border-slate-300 accent-blue-600"/></td>)}</tr>)}</tbody>
      </table></div>
      <p className="mt-3 text-xs text-slate-500">Clear every role in a row to turn off that alert for this branch.</p>
      <button disabled={pending} className="mt-5 rounded-xl bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{pending?'Saving…':'Save alert roles'}</button>
    </fieldset>
    {state.message&&<p role={state.success?'status':'alert'} className={`mt-3 text-sm ${state.success?'text-emerald-600':'text-red-600'}`}>{state.message}</p>}
  </form>;
}
