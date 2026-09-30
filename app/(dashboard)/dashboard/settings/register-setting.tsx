"use client";
import {useState} from "react";
import {Landmark,Loader2} from "lucide-react";
import {toast} from "sonner";
import {saveRegisterRequirement} from "./register-setting-actions";

export default function RegisterSetting({businessId,branchId,branchName,required}:{businessId:string;branchId:string;branchName:string;required:boolean}) {
  const [value,setValue]=useState(required),[busy,setBusy]=useState(false),[error,setError]=useState("");
  return <form onSubmit={async event=>{event.preventDefault();if(busy)return;setBusy(true);setError("");try{await saveRegisterRequirement(businessId,branchId,value);toast.success("POS register setting saved.");}catch(error){setError(error instanceof Error?error.message:"Unable to save.");}finally{setBusy(false);}}} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><Landmark className="text-teal-700" size={24}/><div><h2 className="font-bold">POS checkout · {branchName}</h2><p className="mt-1 text-xs text-slate-500">Applies to website and mobile POS in this branch.</p></div></div><label className="flex cursor-pointer items-center gap-3 text-sm font-semibold"><input type="checkbox" role="switch" checked={value} disabled={busy} onChange={event=>setValue(event.target.checked)} className="h-5 w-5 accent-teal-700"/>Require an open register</label></div>
    <p className="mt-3 text-sm text-slate-500">{value?"Open a register shift before taking payment to track shift totals and cash reconciliation.":"Allow checkout without opening a register shift. Sales and stock are still recorded; sales without a shift are not part of register reconciliation."}</p>
    {error&&<p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    <button disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy&&<Loader2 size={16} className="animate-spin"/>}{busy?"Saving…":"Save setting"}</button>
  </form>;
}
