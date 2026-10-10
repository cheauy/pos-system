"use client";

import { useEffect, useRef, useState } from "react";
import { ImageIcon, X } from "lucide-react";
import { toast } from "sonner";

export default function ImageField({ label, name, preview, disabled, imageClass }: {
  label: string; name: string; preview: string | null; disabled: boolean; imageClass: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<File | null>(null);
  const [removed, setRemoved] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState("");
  useEffect(() => {
    if (!selected) return;
    const url = URL.createObjectURL(selected);
    const frame = requestAnimationFrame(() => setLocalPreview(url));
    return () => { cancelAnimationFrame(frame); URL.revokeObjectURL(url); };
  }, [selected]);
  const source = removed ? null : selected ? localPreview : preview;
  const recommendation = name === "logo" ? "Recommended: 512 x 512 px (square)." : name === "banner" ? "Recommended: 1600 x 600 px (wide). Keep important content near the center." : "Recommended: at least 600 px wide. Upload the full QR image with clear white margins.";
  function remove() {
    setRemoved(true); setSelected(null); setLocalPreview(null); setDimensions("");
    if (input.current) input.current.value = "";
  }
  return <div>
    <p className="mb-1.5 text-xs font-medium text-slate-700">{label}</p>
    <input type="hidden" name={`remove-${name}`} value={removed ? "on" : "off"} />
    <div className="relative">
      {source ? <button type="button" aria-label={`Preview ${label}`} className="block w-full" onClick={() => setExpanded(true)}><img src={source} alt={`${label} preview`} onLoad={event => setDimensions(`${event.currentTarget.naturalWidth} x ${event.currentTarget.naturalHeight} px`)} className={`${imageClass} border border-slate-200 bg-slate-50 object-contain`} /></button> : <div className={`${imageClass} flex items-center justify-center border border-dashed border-slate-300 bg-slate-50 text-slate-400`}><ImageIcon size={20} /></div>}
      {source && !disabled && <button type="button" aria-label={`Remove ${label}`} title={`Remove ${label}`} onClick={remove} className="absolute right-1 top-1 rounded-full border border-slate-200 bg-white p-1.5 text-slate-600 shadow"><X size={14} /></button>}
    </div>
    <p className="mt-2 text-[11px] leading-4 text-slate-500">{recommendation} JPG, PNG or WebP, up to 5 MB.{dimensions && ` Current: ${dimensions}.`}</p>
    <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-blue-600 hover:bg-blue-50"><ImageIcon size={12} /> Upload {label.toLowerCase()}<input ref={input} aria-label={`Upload ${label}`} type="file" name={name} accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={event => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { toast.error("Choose a JPG, PNG or WebP image up to 5 MB."); event.target.value = ""; return; }
      setSelected(file); setRemoved(false); setDimensions("");
    }} className="sr-only" /></label>
    {removed && preview && <button type="button" onClick={() => setRemoved(false)} className="ml-2 text-xs text-blue-600">Undo removal</button>}
    {expanded && source && <div data-workspace-image-viewer role="dialog" aria-modal="true" aria-label={`${label} preview`} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-6" onKeyDown={event => { if (event.key === "Escape") setExpanded(false); }}><button type="button" aria-label="Close image preview" onClick={() => setExpanded(false)} className="absolute left-5 top-5 flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900"><X size={20} /> Close preview</button><img src={source} alt={label} className="max-h-[85vh] max-w-full rounded-xl bg-white object-contain" /></div>}
  </div>;
}

