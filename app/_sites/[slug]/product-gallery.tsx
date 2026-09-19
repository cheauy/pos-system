"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState } from "react";
import { useStorefrontLanguage } from "./storefront-language";

export default function ProductGallery({ images, name }: { images: string[]; name: string }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const { t } = useStorefrontLanguage();
  if (!images.length) return null;
  const multiple = images.length > 1;
  function show(next: number) {
    const target = Math.max(0, Math.min(images.length - 1, next));
    viewport.current?.scrollTo({ left: target * viewport.current.clientWidth, behavior: "smooth" });
  }
  return <section className="product-gallery" aria-label={`${name} ${t("Photos")}`}>
    <div className="product-gallery-frame">
      <div ref={viewport} className="product-gallery-track" tabIndex={multiple ? 0 : undefined} aria-label={t("Product photos")} onKeyDown={event => {
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); show(index + (event.key === "ArrowRight" ? 1 : -1)); }
      }} onScroll={event => { const node = event.currentTarget; setIndex(Math.round(node.scrollLeft / node.clientWidth)); }}>
        {images.map((src, position) => <img key={src} src={src} alt={`${name} · ${t("Photo")} ${position + 1}`} loading={position === 0 ? "eager" : "lazy"} draggable={false} />)}
      </div>
      {multiple && <>
        <button type="button" className="product-gallery-arrow previous" aria-label={t("Previous photo")} disabled={index === 0} onClick={() => show(index - 1)}><ChevronLeft size={21} /></button>
        <button type="button" className="product-gallery-arrow next" aria-label={t("Next photo")} disabled={index === images.length - 1} onClick={() => show(index + 1)}><ChevronRight size={21} /></button>
        <span className="product-gallery-count" aria-live="polite">{index + 1} / {images.length}</span>
      </>}
    </div>
    {multiple && <div className="product-gallery-thumbnails" aria-label={t("Choose photo")}>{images.map((src, position) => <button key={src} type="button" aria-label={`${t("Photo")} ${position + 1}`} aria-pressed={position === index} onClick={() => show(position)}><img src={src} alt="" loading="lazy" /></button>)}</div>}
  </section>;
}
