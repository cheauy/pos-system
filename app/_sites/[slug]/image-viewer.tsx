"use client";
import { useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { useStorefrontLanguage } from "./storefront-language";

export function ImageViewer({ images, initialIndex = 0, name, onClose, downloadable = false }: { images: string[]; initialIndex?: number; name: string; onClose: () => void; downloadable?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(initialIndex);
  const { t } = useStorefrontLanguage();
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="store-image-viewer" aria-label={name} onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={e => { if (e.key === "ArrowRight") setIndex(i => Math.min(images.length - 1, i + 1)); if (e.key === "ArrowLeft") setIndex(i => Math.max(0, i - 1)); }}>
    <div className="viewer-toolbar"><span>{name} {images.length > 1 && `${index + 1} / ${images.length}`}</span>{downloadable && <SaveImage src={images[index]} />}<button type="button" onClick={onClose} aria-label={t("Close")}><X /></button></div>
    <img className="viewer-photo" src={images[index]} alt={`${name} ${index + 1}`} />
    {images.length > 1 && <div className="viewer-navigation"><button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)} aria-label={t("Previous photo")}><ChevronLeft /></button><button type="button" disabled={index === images.length - 1} onClick={() => setIndex(index + 1)} aria-label={t("Next photo")}><ChevronRight /></button></div>}
  </dialog>;
}
function SaveImage({ src }: { src: string }) {
  const { t } = useStorefrontLanguage();
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true); setError(false);
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) throw new Error("Invalid image");
      const url = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = url; link.download = `store-khqr.${blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg"}`;
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch { setError(true); } finally { setSaving(false); }
  }
  return <><button type="button" onClick={save} disabled={saving}><Download size={18} />{t("Save KHQR")}</button>{error && <a href={src} target="_blank" rel="noreferrer">{t("Open image to save")}</a>}</>;
}
export function KhqrPreview({ src }: { src: string }) {
  const [open, setOpen] = useState(false); const { t } = useStorefrontLanguage();
  return <><button type="button" className="mx-auto block w-full max-w-[230px]" onClick={() => setOpen(true)} aria-label={t("View KHQR")}><img src={src} alt="Store KHQR" className="aspect-square w-full rounded-2xl bg-white object-contain p-2" /></button><div className="khqr-actions"><button type="button" onClick={() => setOpen(true)}>{t("View KHQR")}</button><SaveImage src={src} /></div>{open && <ImageViewer images={[src]} name="KHQR" downloadable onClose={() => setOpen(false)} />}</>;
}
