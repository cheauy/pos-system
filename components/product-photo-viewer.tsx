"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import ProductPhoto from "./product-photo";

export default function ProductPhotoViewer({ images, initialIndex, name, onClose }: { images: string[]; initialIndex: number; name: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(initialIndex);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} aria-label={`${name} photos`} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }} onKeyDown={event => {
    event.stopPropagation();
    if (event.key === "ArrowLeft") setIndex(value => Math.max(0, value - 1));
    if (event.key === "ArrowRight") setIndex(value => Math.min(images.length - 1, value + 1));
  }} className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-5xl overflow-hidden rounded-2xl border-0 bg-slate-950 p-4 text-white shadow-2xl backdrop:bg-black/75">
    <header className="flex items-center justify-between gap-4 pb-3"><p className="truncate text-sm font-semibold">{name}</p><button type="button" onClick={onClose} aria-label="Close photo viewer" className="rounded-lg p-2 hover:bg-white/10"><X size={22} /></button></header>
    <ProductPhoto src={images[index]} alt={`${name} photo ${index + 1}`} sizes="(max-width: 1024px) 100vw, 1024px" loading="eager" className="h-[min(70dvh,720px)] w-full object-contain" />
    {images.length > 1 && <footer className="flex items-center justify-center gap-5 pt-3"><button type="button" aria-label="Previous photo" disabled={index === 0} onClick={() => setIndex(index - 1)} className="rounded-lg p-2 hover:bg-white/10 disabled:opacity-30"><ChevronLeft size={22} /></button><span aria-live="polite" className="text-xs">{index + 1} / {images.length}</span><button type="button" aria-label="Next photo" disabled={index === images.length - 1} onClick={() => setIndex(index + 1)} className="rounded-lg p-2 hover:bg-white/10 disabled:opacity-30"><ChevronRight size={22} /></button></footer>}
  </dialog>;
}
