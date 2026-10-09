"use client";
import { useRef, useState } from "react";
import { Bell, Save, Volume2 } from "lucide-react";
import { businessAlerts } from "@/lib/notifications/settings";
import { saveNotificationSettings, type AlertSaveState } from "../notifications/actions";

type Draft={enabled:Record<string,boolean>;sound:boolean;browser:boolean};
export default function AlertRecipientsForm({businessId,branchId,branchName,settings,soundEnabled,browserEnabled}:{businessId:string;branchId:string;branchName:string;settings:Record<string,string[]>;soundEnabled:boolean;browserEnabled:boolean}) {
  const [baseline,setBaseline]=useState<Draft>({enabled:Object.fromEntries(businessAlerts.map(({type,roles})=>[type,(settings[type]??roles).length>0])),sound:soundEnabled,browser:browserEnabled});
  const [draft,setDraft]=useState(baseline),[pending,setPending]=useState(false),[status,setStatus]=useState<AlertSaveState>({success:false,message:""});
  const locked=useRef(false);
  const dirty=JSON.stringify(draft)!==JSON.stringify(baseline);
  function change(next:Draft){setDraft(next);setStatus({success:false,message:""});}
  async function save(){
    if(locked.current)return;
    locked.current=true;setPending(true);setStatus({success:false,message:""});
    try {
      if(draft.browser&&!baseline.browser){
        if(typeof Notification==="undefined")throw new Error("This browser does not support desktop notifications. Turn off browser notifications to save.");
        const permission=Notification.permission==="default"?await Notification.requestPermission():Notification.permission;
        if(permission!=="granted")throw new Error("Allow notifications in your browser settings, or turn off browser notifications to save.");
      }
      const result=await saveNotificationSettings({businessId,branchId,...draft});
      setStatus(result);
      setBaseline(current=>({...current,...(result.alertsSaved?{enabled:draft.enabled}:{}),...(result.preferencesSaved?{sound:draft.sound,browser:draft.browser}:{})}));
      if(result.preferencesSaved)window.dispatchEvent(new Event("notification-preferences-changed"));
    } catch(error){setStatus({success:false,message:error instanceof Error?error.message:"Unable to confirm the save. Reload settings before retrying."});}
    finally{locked.current=false;setPending(false);}
  }
  return <form onSubmit={event=>{event.preventDefault();void save();}} className="mt-5 space-y-5">
    <fieldset disabled={pending} className="min-w-0 space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold">Business alerts</h2>
        <p className="mt-1 text-sm text-slate-500">Enable alerts for <span data-i18n-ignore="true">{branchName}</span>. Recipients are determined by their role.</p>
        <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">{businessAlerts.map(({type,label})=><Toggle key={type} label={label} checked={draft.enabled[type]} onChange={value=>change({...draft,enabled:{...draft.enabled,[type]:value}})}/>)}</div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold">My notification preferences</h2>
        <p className="mt-1 text-sm text-slate-500">Applies to your account. Alerts remain available in the notification bell.</p>
        <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800"><Toggle label="Notification sound" checked={draft.sound} onChange={value=>change({...draft,sound:value})} icon="sound"/><Toggle label="Browser notifications" checked={draft.browser} onChange={value=>change({...draft,browser:value})} icon="browser"/></div>
        <p className="text-xs text-slate-500">Browser notifications require permission and an open workspace tab.</p>
      </section>
    </fieldset>
    <footer className="settings-save-bar">
      {status.message?<p role={status.success?"status":"alert"} className={`basis-full text-sm ${status.success?"text-emerald-600":"text-red-600"}`}>{status.message}</p>:<p className="text-xs text-slate-500">Changes apply only after saving.</p>}
      <button type="button" disabled={pending||!dirty} onClick={()=>{setDraft(baseline);setStatus({success:false,message:""});}} className="border border-slate-200 dark:border-slate-700">Cancel</button>
      <button type="submit" disabled={pending||(!dirty&&!(status.alertsSaved&&!status.preferencesSaved))} className="bg-blue-600 text-white disabled:opacity-50"><Save size={16}/>{pending?"Saving…":"Save changes"}</button>
    </footer>
  </form>;
}
function Toggle({label,checked,onChange,icon}:{label:string;checked:boolean;onChange:(value:boolean)=>void;icon?:"sound"|"browser"}) {
  return <label className="flex min-h-16 cursor-pointer items-center justify-between gap-4 py-3">
    <span className="flex min-w-0 items-center gap-3 text-sm font-medium">{icon==="sound"?<Volume2 size={18} className="shrink-0 text-blue-600"/>:icon==="browser"?<Bell size={18} className="shrink-0 text-blue-600"/>:null}{label}</span>
    <span className="flex shrink-0 items-center gap-2"><span className="relative"><input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={event=>onChange(event.target.checked)} className="peer sr-only"/><span className="block h-6 w-11 rounded-full bg-slate-300 transition-colors peer-checked:bg-blue-600 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue-600 peer-disabled:opacity-50 dark:bg-slate-600"/><span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5"/></span><span aria-hidden="true" className="w-6 text-xs text-slate-500">{checked?"On":"Off"}</span></span>
  </label>;
}
