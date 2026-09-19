"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Package, X } from "lucide-react";

export default function CatalogDialog({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  return <>
    <button type="button" onClick={() => { dialog.current?.showModal(); setOpen(true); }} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white"><Package size={16} />Storefront products</button>
    <dialog ref={dialog} aria-labelledby="catalog-dialog-title" onClose={() => setOpen(false)} className="fixed inset-0 m-auto max-h-[90dvh] w-[min(1280px,96vw)] max-w-none overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-0 shadow-2xl backdrop:bg-slate-950/50">
      <div className="sticky top-0 z-20 flex justify-end border-b border-slate-200 bg-white px-4 py-2"><button autoFocus type="button" onClick={() => dialog.current?.close()} aria-label="Close storefront products" className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"><X size={18} />Close</button></div>
      {open && children}
    </dialog>
  </>;
}
