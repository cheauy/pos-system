"use client";

import { useEffect, useRef, useState } from "react";

export default function CategoryDisplayBranches({ branches, branchIds = null, embedded = false }: {
  branches: { id: string; name: string }[];
  branchIds?: string[] | null;
  embedded?: boolean;
}) {
  const [all, setAll] = useState(branchIds === null);
  const fieldset=useRef<HTMLFieldSetElement>(null);
  useEffect(()=>{const form=fieldset.current?.form;const reset=()=>setAll(branchIds===null);form?.addEventListener('reset',reset);return()=>form?.removeEventListener('reset',reset);},[branchIds]);
  return <fieldset ref={fieldset} className={embedded ? "space-y-3 text-sm" : "space-y-3 rounded-xl border border-slate-200 p-3 text-sm"}>
    <legend className="px-1 font-semibold">Display in branches</legend>
    <input type="hidden" name="branchMode" value={all ? "all" : "selected"} />
    <label className="flex items-center gap-2"><input type="checkbox" checked={all} onChange={event => setAll(event.target.checked)} />Apply all branches</label>
    {!all && <div className="max-h-44 space-y-2 overflow-auto">{branches.map(branch => <label key={branch.id} className="flex items-center gap-2"><input type="checkbox" name="branchIds" value={branch.id} defaultChecked={branchIds?.includes(branch.id) ?? false} />{branch.name}</label>)}</div>}
    <p className="text-xs text-slate-500">{all ? "Includes branches added later." : "Choose at least one branch."}</p>
  </fieldset>;
}
