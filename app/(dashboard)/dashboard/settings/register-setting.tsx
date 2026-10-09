"use client";
import {useRef,useState} from "react";
import {toast} from "sonner";
import {saveRegisterRequirement} from "./register-setting-actions";

export default function RegisterSetting({businessId,branchId,branchName,required}:{businessId:string;branchId:string;branchName:string;required:boolean}) {
  const [value,setValue]=useState(required),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const saving=useRef(false);
  async function toggle() {
    if(saving.current)return;
    saving.current=true;setBusy(true);setError("");
    const next=!value;
    try {await saveRegisterRequirement(businessId,branchId,next);setValue(next);toast.success("POS register setting saved.");}
    catch(error){const message=error instanceof Error?error.message:"Unable to save.";setError(message);toast.error(message);}
    finally{saving.current=false;setBusy(false);}
  }
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div className="flex items-center justify-between gap-4">
      <div><h2 id="register-requirement-label" className="text-sm font-semibold">Require an open register</h2><p id="register-requirement-description" className="mt-1 text-xs text-slate-500"><span data-i18n-ignore="true">{branchName}</span> · Website and mobile POS. Off allows checkout without opening a register.</p></div>
      <button type="button" role="switch" aria-checked={value} aria-labelledby="register-requirement-label" aria-describedby="register-requirement-description" aria-busy={busy} disabled={busy} onClick={()=>void toggle()} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50">
        <span className={`flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${value?"bg-blue-600":"bg-slate-300 dark:bg-slate-600"}`}><span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${value?"translate-x-5":""}`}/></span>
        <span>{busy?"Saving…":value?"On":"Off"}</span>
      </button>
    </div>
    {error&&<p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
  </section>;
}
