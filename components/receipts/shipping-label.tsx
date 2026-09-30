"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { shippingLabelMarkup, SHIPPING_LABEL_CSS, type ShippingOrder, type ShippingStore } from '@/lib/receipts/shipping-label-markup';
import { fitShippingLabel } from '@/lib/printing/prepare-print';

export default function ShippingLabelCard({ order, store, settings, size }: {
  order: ShippingOrder; store: ShippingStore; settings: Record<string, unknown>; size: string;
}) {
  const label = useRef<HTMLElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [imageError, setImageError] = useState(false);
  const content = useMemo(() => shippingLabelMarkup({ order, store, settings, size }), [order, store, settings, size]);
  useEffect(() => {
    const node = label.current;
    if (!node) return;
    let active = true, frame = 0;
    const fit = () => {
      if (!active) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!active) return;
        const result = fitShippingLabel(node);
        if (result !== null) setOverflow(!result);
      });
    };
    const images = [...node.querySelectorAll('img')];
    const checkImages = () => {
      const failed = images.some(image => image.complete && !image.naturalWidth);
      if (failed) node.dataset.printImageError = 'true'; else delete node.dataset.printImageError;
      if (active) setImageError(failed);
      fit();
    };
    images.forEach(image => { image.addEventListener('load', checkImages); image.addEventListener('error', checkImages); });
    checkImages();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    observer?.observe(node); // Includes a previously hidden printer tab becoming visible.
    node.ownerDocument.fonts?.ready.then(fit).catch(() => {});
    fit();
    return () => {
      active = false; cancelAnimationFrame(frame); observer?.disconnect();
      images.forEach(image => { image.removeEventListener('load', checkImages); image.removeEventListener('error', checkImages); });
    };
  }, [content]);
  return <div className="shipping-label-preview" style={{ width: 'max-content', maxWidth: 'none' }}>
    <style>{SHIPPING_LABEL_CSS}</style>
    <article ref={label} lang={content.template.language} data-template={content.template.id} data-width-mm={content.paper.width} data-height-mm={content.paper.height}
      className={content.className} style={{ '--ship-width': `${content.paper.width}mm`, '--ship-height': `${content.paper.height}mm`, '--ship-user-scale': settings.font_size === 'small' ? .85 : settings.font_size === 'large' ? 1.2 : 1 } as React.CSSProperties}
      dangerouslySetInnerHTML={{ __html: content.inner }} />
    {overflow && <p role="alert" className="no-print mt-3 text-sm text-red-700" style={{ maxWidth: `${content.paper.width}mm` }}>This label has too much text for {content.paper.label}. Choose a larger size or hide optional details. Printing is blocked rather than cutting off the address.</p>}
    {imageError && <p role="alert" className="no-print mt-3 text-sm text-red-700" style={{ maxWidth: `${content.paper.width}mm` }}>The store logo could not load. Reload the preview or turn off Store logo before printing.</p>}
  </div>;
}
