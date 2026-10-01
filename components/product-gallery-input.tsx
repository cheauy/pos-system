"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Star, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

type Photo = { key: string; url: string; file?: File };
export default function ProductGalleryInput({ initialUrls = [], onChange, title = "Product gallery", description = "First photo is the cover. Up to 8 photos; colour images are managed with variants." }: { initialUrls?: string[]; onChange?: () => void; title?: string; description?: string }) {
  const [photos, setPhotos] = useState<Photo[]>(() => initialUrls.map(url => ({ key: url, url })));
  const [changed, setChanged] = useState(false);
  const [uploading, setUploading] = useState(false);
  const root = useRef<HTMLFieldSetElement>(null);
  const busy = useRef(false);
  const urls = useRef(new Set<string>());
  useEffect(() => { const owned = urls.current; return () => owned.forEach(url => URL.revokeObjectURL(url)); }, []);
  useEffect(() => {
    const form = root.current?.form;
    const guard = (event: Event) => {
      const files = form ? [...new FormData(form).values()].filter((value): value is File => value instanceof File) : [];
      const tooLarge = files.reduce((size, file) => size + file.size, 0) > 15 * 1024 * 1024;
      if (busy.current || tooLarge) {
        event.preventDefault(); event.stopImmediatePropagation();
        toast.info(busy.current ? "Wait for the photos to finish preparing." : "Keep all uploaded product and colour photos below 15 MB in one save.");
      }
    };
    form?.addEventListener("submit", guard, true);
    return () => form?.removeEventListener("submit", guard, true);
  }, []);
  function update(next: Photo[]) { setPhotos(next); setChanged(true); onChange?.(); }
  async function upload(files: FileList | null, replace?: number) {
    if (!files?.length || busy.current) return;
    const chosen = Array.from(files);
    if ((replace === undefined ? photos.length + chosen.length : photos.length) > 8) return toast.error("Use up to 8 product images.");
    if (chosen.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024)) return toast.error("Choose JPG, PNG or WebP images, up to 5 MB each.");
    busy.current = true; setUploading(true);
    try {
      const additions: Photo[] = [];
      for (const original of chosen) {
        const bitmap = await createImageBitmap(original);
        const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext("2d");
        if (!context) { bitmap.close(); throw new Error("Unable to prepare this photo."); }
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", 0.82));
        const file = blob && (blob.size < original.size || scale < 1) ? new File([blob], original.name.replace(/\.[^.]+$/, ".webp"), { type: blob.type }) : original;
        const url = URL.createObjectURL(file); urls.current.add(url); additions.push({ key: crypto.randomUUID(), url, file });
      }
      const next = replace === undefined ? [...photos, ...additions] : photos.map((photo, index) => index === replace ? additions[0] : photo);
      if (next.reduce((size, photo) => size + (photo.file?.size ?? 0), 0) > 12 * 1024 * 1024) throw new Error("Choose smaller photos; the gallery can upload up to 12 MB at once.");
      update(next);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to read this photo."); }
    finally { busy.current = false; setUploading(false); }
  }
  function move(index: number, target: number) { const next = [...photos]; next.splice(target, 0, next.splice(index, 1)[0]); update(next); }
  return <fieldset ref={root} disabled={uploading} className="min-w-0 space-y-3">
    <div><h3 className="text-sm font-bold text-slate-900">{title}</h3><p className="mt-1 text-xs text-slate-500">{description}</p></div>
    {changed && <input type="hidden" name="productGallery" value={JSON.stringify(photos.map(photo => photo.file ? { slot: photo.key } : { url: photo.url }))} />}
    {photos.map(photo => photo.file && <input key={photo.key} name={`gallery_${photo.key}`} type="file" className="sr-only" tabIndex={-1} aria-hidden="true" ref={node => { if (node && photo.file) { const data = new DataTransfer(); data.items.add(photo.file); node.files = data.files; } }} />)}
    <div className="grid grid-cols-2 gap-3">
      {photos.map((photo, index) => <div key={photo.key} className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <label className="block cursor-pointer" title="Replace image"><img src={photo.url} alt={`Product photo ${index + 1}`} className="aspect-square w-full object-contain" loading="lazy" /><input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={event => { upload(event.target.files, index); event.target.value = ""; }} /></label>
        <div className="flex flex-wrap items-center justify-center gap-1 border-t border-slate-100 p-1">
          <button type="button" onClick={() => move(index, 0)} disabled={index === 0} aria-label={index === 0 ? "Cover image" : "Make cover"} className="rounded p-1.5 text-teal-700 hover:bg-teal-50"><Star size={14} fill={index === 0 ? "currentColor" : "none"} /></button>
          <button type="button" disabled={index === 0} onClick={() => move(index, index - 1)} aria-label="Move image earlier" className="rounded p-1.5 text-slate-500 disabled:opacity-30"><ArrowLeft size={14} /></button>
          <button type="button" disabled={index === photos.length - 1} onClick={() => move(index, index + 1)} aria-label="Move image later" className="rounded p-1.5 text-slate-500 disabled:opacity-30"><ArrowRight size={14} /></button>
          <button type="button" onClick={() => update(photos.filter((_, i) => i !== index))} aria-label="Remove image" className="rounded p-1.5 text-red-600 hover:bg-red-50"><Trash2 size={14} /></button>
        </div>
        {index === 0 && <p className="pb-2 text-center text-[10px] font-semibold text-teal-700">Cover image</p>}
      </div>)}
    </div>
    {uploading && <p role="status" className="text-xs text-teal-700">Preparing photos…</p>}
    {photos.length < 8 && <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-teal-300 bg-teal-50/50 px-3 py-5 text-xs font-semibold text-teal-700"><Upload size={16} />Add photos<input type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={event => { void upload(event.target.files); event.target.value = ""; }} /></label>}
  </fieldset>;
}
