"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveFulfillmentBranch } from "./actions";
export default function FulfillmentBranch({branches,branchId,canEdit}:{branches:{id:string;name:string}[];branchId:string;canEdit:boolean}) {
  const [value,setValue]=useState(branchId);const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const router=useRouter();
  return <form className="flex flex-wrap items-end gap-4 rounded-2xl border border-slate-200 bg-white p-5" onSubmit={async e=>{e.preventDefault();setBusy(true);setMessage("");try{const result=await saveFulfillmentBranch(value);setMessage(result.message);if(result.success)router.refresh();}catch{setMessage("Unable to save fulfilment branch.");}finally{setBusy(false);}}}>
    <label className="text-sm font-semibold">Online order fulfilment branch<select aria-label="Online order fulfilment branch" value={value} onChange={e=>setValue(e.target.value)} disabled={!canEdit||busy} required className="mt-2 block min-w-64 rounded-xl border border-slate-200 px-3 py-2"><option value="" disabled>Choose branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    {canEdit&&<button disabled={busy} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Save branch</button>}<p className="w-full text-sm text-slate-500">The online store sells this branch’s assigned products. New orders, stock deductions and sales reports use this branch.</p>{message&&<p role="status" className="text-sm">{message}</p>}
  </form>;
}
