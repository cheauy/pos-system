"use client";

import { useState } from "react";
import { Bell, Volume2 } from "lucide-react";
import { saveNotificationPreferences } from "../notifications/actions";

export default function NotificationPreferences({soundEnabled,browserEnabled}:{soundEnabled:boolean;browserEnabled:boolean}) {
  const [sound,setSound]=useState(soundEnabled);
  const [browser,setBrowser]=useState(browserEnabled);
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState({success:false,message:""});
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
    <h2 className="text-lg font-semibold">My notification preferences</h2><p className="mt-1 text-sm text-slate-500">Applies to your account in this business. Alerts remain available in the notification bell.</p>
    <form className="mt-5 space-y-4" onSubmit={async event=>{
      event.preventDefault();if(busy)return;setBusy(true);setStatus({success:false,message:""});
      try {
        if(browser){
          if(typeof Notification==='undefined')throw new Error('This browser does not support desktop notifications. Turn off browser notifications to save.');
          const permission=Notification.permission==='default'?await Notification.requestPermission():Notification.permission;
          if(permission!=='granted')throw new Error('Allow notifications in your browser settings, or turn off browser notifications to save.');
        }
        const result=await saveNotificationPreferences({sound,browser});setStatus(result);
        if(result.success)window.dispatchEvent(new Event('notification-preferences-changed'));
      } catch(error){setStatus({success:false,message:error instanceof Error?error.message:'Unable to save preferences.'});}
      finally{setBusy(false);}
    }}>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700"><Volume2 size={20}/><span className="flex-1 text-sm font-medium">Notification sound</span><input type="checkbox" checked={sound} onChange={event=>setSound(event.target.checked)} className="size-4 accent-blue-600"/></label>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700"><Bell size={20}/><span className="flex-1 text-sm font-medium">Browser notifications</span><input type="checkbox" checked={browser} onChange={event=>setBrowser(event.target.checked)} className="size-4 accent-blue-600"/></label>
      </fieldset>
      <p className="text-xs text-slate-500">Browser notifications require permission and an open workspace tab.</p>
      <button disabled={busy} className="rounded-xl bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{busy?'Saving…':'Save preferences'}</button>
      {status.message&&<p role={status.success?'status':'alert'} className={`text-sm ${status.success?'text-emerald-600':'text-red-600'}`}>{status.message}</p>}
    </form>
  </section>;
}
