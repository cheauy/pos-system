"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { applyCategoryBranches } from "./actions";
export default function CategoryBranchesDialog({ category, branches, onClose }: { category: {id:string;name:string;branchIds:string[]|null}; branches:{id:string;name:string}[]; onClose:()=>void }) {
  const [all,setAll]=useState(category.branchIds===null); const [selected,setSelected]=useState(category.branchIds ?? branches.map(b=>b.id));
  const [busy,setBusy]=useState(false); const [error,setError]=useState(""); const router=useRouter();
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="category-branches-title"><form className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl" onSubmit={async e=>{
    e.preventDefault();setBusy(true);setError("");
    try {const result=await applyCategoryBranches(category.id,all?null:selected);if(!result.ok)setError(result.message);else{router.refresh();onClose();}}catch{setError("Unable to save category branches.");}finally{setBusy(false);}
  }}><h2 id="category-branches-title" className="text-lg font-bold">Apply {category.name} to branches</h2><label className="flex gap-2"><input type="checkbox" checked={all} onChange={e=>setAll(e.target.checked)}/>All branches, including new branches</label><div className="max-h-64 space-y-3 overflow-auto">{branches.map(b=><label key={b.id} className="flex gap-2"><input type="checkbox" disabled={all||busy} checked={all||selected.includes(b.id)} onChange={e=>setSelected(v=>e.target.checked?[...v,b.id]:v.filter(id=>id!==b.id))}/>{b.name}</label>)}</div><p className="text-xs text-slate-500">Controls category and product visibility in POS and the online fulfilment branch. Stock quantities stay unchanged.</p>{error&&<p role="alert" className="text-sm text-red-600">{error}</p>}<div className="flex justify-end gap-3"><button type="button" disabled={busy} onClick={onClose} className="rounded-xl border px-4 py-2">Cancel</button><button disabled={busy} className="rounded-xl bg-blue-600 px-4 py-2 text-white">{busy?"Saving…":"Apply branches"}</button></div></form></div>;
}
