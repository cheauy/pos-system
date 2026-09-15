"use client";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

export default function GlobalSearchBox() {
  const [query,setQuery]=useState(""); const router=useRouter(); const input=useRef<HTMLInputElement>(null);
  useEffect(()=>{ const onKey=(e:KeyboardEvent)=>{ if(e.key==="/" && !e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement?.tagName!=="INPUT" && document.activeElement?.tagName!=="TEXTAREA"){ e.preventDefault(); input.current?.focus(); } }; window.addEventListener("keydown",onKey); return()=>window.removeEventListener("keydown",onKey); },[]);
  function submit(e:FormEvent){ e.preventDefault(); const q=query.trim(); if(q) router.push(`/dashboard/search?q=${encodeURIComponent(q)}`); }
  return <form onSubmit={submit} className="relative hidden w-full max-w-md md:block"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input ref={input} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search orders, SKU, customer…  /" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:focus:bg-slate-900"/></form>;
}
