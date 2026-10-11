"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./products-stock-responsive.module.css";

const compactQuery = "(max-width: 1279px), (hover: none) and (pointer: coarse)";

export default function ProductStockDrawer({ children, label, close, desktopClassName }: { children: ReactNode; label: string; close: () => void; desktopClassName: string }) {
  const [compact, setCompact] = useState(() => typeof window !== "undefined" && window.matchMedia(compactQuery).matches);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const media = window.matchMedia(compactQuery);
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!compact) return;
    const dialog = ref.current;
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    const viewport = window.visualViewport;
    const update = () => {
      dialog?.style.setProperty("--catalog-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
      dialog?.style.setProperty("--catalog-viewport-top", `${viewport?.offsetTop ?? 0}px`);
    };
    update();
    viewport?.addEventListener("resize", update); viewport?.addEventListener("scroll", update);
    return () => {
      viewport?.removeEventListener("resize", update); viewport?.removeEventListener("scroll", update);
      dialog?.close(); document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [compact]);

  if (!compact) return <div className={desktopClassName} onMouseDown={close}>{children}</div>;
  return <dialog ref={ref} data-product-stock-details aria-label={label} data-i18n-ignore-attributes="aria-label" className={`${styles.compactDetails} workspace-theme`}
    onCancel={event => { event.preventDefault(); close(); }}
    onClick={event => { if (event.target !== event.currentTarget) return; const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close(); }}>
    {children}
  </dialog>;
}
